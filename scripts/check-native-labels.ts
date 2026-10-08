/**
 * Renamed built-in fields (Settings → Properties): every screen must read a
 * built-in field's name through the resolver, so a rename reaches it.
 *
 *   npx tsx --env-file=.env.local scripts/check-native-labels.ts
 *
 * 1. Source scan — DERIVED, never listed. The native keys come from
 *    RECORD_FIELDS plus FIELD_ALIASES; every .ts/.tsx under app/, components/
 *    and lib/ is scanned for `{ key: "<native key>", … label: "<literal>" }`
 *    definitions. One passes when its list goes through relabel() /
 *    applyNativeLabels(), or its entries are relabelled with labelFrom() where
 *    the list is read. A file that names the objects it handles (any
 *    relabel/labelFrom/fl call) is held to those objects' keys; a file that
 *    names none is held to every object's keys, so a new screen can't slip by.
 * 2. Pure tests — the resolver and the rename rules.
 * 3. Mutation tests — the scan flags what it should, on synthetic source.
 * 4. DB test, rolled back — a stored rename is read back, and reaches the
 *    record cards, filters, report fields and exports. Nothing is left behind.
 */
import { readFileSync, readdirSync, statSync } from "fs"
import { join, relative } from "path"
import { prisma } from "../lib/prisma"
import { RECORD_FIELDS } from "../lib/record-field-catalog"
import { FIELD_ALIASES, labelFrom, relabel, canonicalFieldKey } from "../lib/native-labels-shared"
import { loadNativeLabels, primeNativeLabelsForTest, clearNativeLabelsMemo, nativeLabelChange, applyNativeLabels } from "../lib/native-labels"

let failures = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${!ok && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`)
}

const ROOT = process.cwd()

// ── Deliberate exceptions: a native-looking key that isn't a renamable field ──
// Keyed by file; `keys` limits the exception to those keys (omit = whole file).
const ALLOW: { file: string; keys?: string[]; why: string }[] = [
  { file: "lib/record-field-catalog.ts", why: "the catalog itself — the default names" },
  { file: "lib/referral-filter-fields.ts", why: "query translation only; the FilterBuilder's labels come from fieldsFor()" },
  { file: "lib/surgery-filter-fields.ts", why: "query translation only; the FilterBuilder's labels come from fieldsFor()" },
  { file: "lib/reporting/objects.ts", keys: ["name", "email"], why: "the User object's fields, not a renamable object" },
  { file: "lib/object-fields-server.ts", keys: ["status"], why: "Surgery status — not in RECORD_FIELDS.SURGERY, so not renamable" },
  { file: "components/surgery-create-dialog.tsx", keys: ["status"], why: "Surgery status — not in RECORD_FIELDS.SURGERY, so not renamable" },
  { file: "components/message-template-manager.tsx", keys: ["name", "status"], why: "message templates, not a record object" },
  { file: "app/(dashboard)/broadcasts/page.tsx", keys: ["email"], why: "a tab id, not a field" },
]
// Left out by design, and not matched by the scan (no key/label definitions):
// the public referral form (patient-facing wording) and the token systems
// (lib/message-tokens.ts, lib/personalization.ts) — tokens are keyed by field,
// so a rename never breaks them.

// ── 1. Source scan ────────────────────────────────────────────────────────────

const OBJECT_KEYS: Record<string, Set<string>> = {}
for (const [obj, fields] of Object.entries(RECORD_FIELDS)) {
  OBJECT_KEYS[obj] = new Set([...fields.map((f) => f.key), ...Object.keys(FIELD_ALIASES[obj] ?? {})])
}
const ANY_KEY = new Set(Object.values(OBJECT_KEYS).flatMap((s) => Array.from(s)))

type Finding = { file: string; line: number; key: string; label: string }

/** The span [start, end) of the bracketed expression opening at `open`. */
function spanFrom(src: string, open: number): number {
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" }
  const stack: string[] = []
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (c === '"' || c === "'" || c === "`") { // skip string literals
      const q = c; i++
      while (i < src.length && src[i] !== q) { if (src[i] === "\\") i++; i++ }
      continue
    }
    if (pairs[c]) stack.push(pairs[c])
    else if (c === stack[stack.length - 1]) { stack.pop(); if (!stack.length) return i + 1 }
  }
  return src.length
}

export function scanSource(file: string, src: string): Finding[] {
  // Objects this file handles, from its resolver calls.
  const objects = new Set<string>()
  for (const m of Array.from(src.matchAll(/\b(?:relabel|labelFrom)\(\s*[\w.?]+\s*,\s*"([A-Z_]+)"/g))) objects.add(m[1])
  for (const m of Array.from(src.matchAll(/\b(?:fl|fieldName|nativeLabel|applyNativeLabels|useFieldLabel\(\))\(\s*"([A-Z_]+)"/g))) objects.add(m[1])
  const keysInScope = objects.size
    ? new Set(Array.from(objects).flatMap((o) => Array.from(OBJECT_KEYS[o] ?? [])))
    : ANY_KEY

  // Spans whose literals are relabelled: relabel(...) / applyNativeLabels(...) calls…
  const covered: [number, number][] = []
  const wrapped = new Set<string>() // const names passed to those calls
  for (const m of Array.from(src.matchAll(/\b(?:relabel|applyNativeLabels)\(/g))) {
    const open = m.index! + m[0].length - 1
    const end = spanFrom(src, open)
    covered.push([open, end])
    for (const n of Array.from(src.slice(open, end).matchAll(/\b([A-Za-z_]\w*)\b/g))) wrapped.add(n[1])
  }
  // …and consts whose entries get labelFrom() where they're read (`const m = X[key]` … labelFrom(…)).
  // (a type annotation may hold arrows: `const X: Record<string, { get: (r: R) => any }> = {`)
  const lines = src.split("\n")
  for (const m of Array.from(src.matchAll(/\bconst ([A-Za-z_]\w*)\b(?:[^=\n]|=>)*=(?!>)\s*/g))) {
    const name = m[1]
    const open = m.index! + m[0].length
    if (!"[{".includes(src[open])) continue
    const end = spanFrom(src, open)
    const defLine = src.slice(0, open).split("\n").length
    const endLine = src.slice(0, end).split("\n").length
    const isWrapped = wrapped.has(name) || lines.some((l, i) =>
      (i + 1 < defLine || i + 1 > endLine) && new RegExp(`\\b${name}\\b`).test(l) &&
      lines.slice(i, i + 6).some((x) => /\blabelFrom\(/.test(x)))
    if (isWrapped) covered.push([open, end])
  }

  const out: Finding[] = []
  for (const m of Array.from(src.matchAll(/\{\s*key:\s*"(\w+)"[^{}]*?\blabel:\s*"([^"]*)"/g))) {
    if (!keysInScope.has(m[1])) continue
    const at = m.index!
    if (covered.some(([a, b]) => at >= a && at < b)) continue
    out.push({ file, line: src.slice(0, at).split("\n").length, key: m[1], label: m[2] })
  }
  return out
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (name === "node_modules" || name.startsWith(".")) continue
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p)
  }
  return out
}

function sourceScan() {
  const files = ["app", "components", "lib"].flatMap((d) => walk(join(ROOT, d)))
  check(`scanned ${files.length} source files`, files.length > 300, files.length)
  const findings: Finding[] = []
  const allowUsed = new Set<string>()
  for (const abs of files) {
    const file = relative(ROOT, abs).replace(/\\/g, "/")
    for (const f of scanSource(file, readFileSync(abs, "utf8"))) {
      const allow = ALLOW.find((a) => a.file === file && (!a.keys || a.keys.includes(f.key)))
      if (allow) { allowUsed.add(allow.file + (allow.keys ?? []).join()); continue }
      findings.push(f)
    }
  }
  check("every built-in field label on a list, form or export follows a rename", findings.length === 0, findings.length)
  for (const f of findings) console.log(`       ${f.file}:${f.line} ${f.key}="${f.label}"`)
  // An exception nobody needs any more hides the next real gap in that file.
  const stale = ALLOW.filter((a) => a.file !== "lib/record-field-catalog.ts" && !allowUsed.has(a.file + (a.keys ?? []).join()))
    .filter((a) => { try { statSync(join(ROOT, a.file)); return true } catch { return false } })
  check("no stale exceptions in the allowlist", stale.length === 0, stale.map((a) => a.file))
}

// ── 2. Pure tests ─────────────────────────────────────────────────────────────

function pureTests() {
  const map = { PROVIDER: { phone: "Mobile" }, REFERRAL: { patientMrn: "Outside MRN" } }
  check("an override wins", labelFrom(map, "PROVIDER", "phone", "Cell Phone") === "Mobile")
  check("no override → the screen's own wording", labelFrom(map, "PROVIDER", "email", "E-mail") === "E-mail")
  check("no map at all → the screen's own wording", labelFrom(undefined, "PROVIDER", "phone", "Cell Phone") === "Cell Phone")
  check("a rename is per object", labelFrom(map, "PRACTICE", "phone", "Phone") === "Phone")
  check("a list alias reaches the field (referral list 'mrn' → patientMrn)", labelFrom(map, "REFERRAL", "mrn", "Referring MRN") === "Outside MRN")
  check("canonicalFieldKey maps aliases and leaves real keys", canonicalFieldKey("REFERRAL", "dob") === "patientDob" && canonicalFieldKey("REFERRAL", "genesisMrn") === "genesisMrn")
  const rel = relabel(map, "PROVIDER", [{ key: "phone", label: "Cell Phone", extra: 1 }, { key: "npi", label: "NPI", extra: 2 }])
  check("relabel replaces renamed labels only, keeping other props", rel[0].label === "Mobile" && rel[1].label === "NPI" && rel[0].extra === 1, rel)
  check("every alias points at a real catalog field",
    Object.entries(FIELD_ALIASES).every(([o, m]) => Object.values(m).every((k) => (RECORD_FIELDS[o] ?? []).some((f) => f.key === k))), FIELD_ALIASES)

  check("rename: an unknown key is refused", "error" in nativeLabelChange("PROVIDER", "nope", "X"))
  check("rename: an unknown object is refused", "error" in nativeLabelChange("NOPE", "phone", "X"))
  check("rename: an empty name resets", "reset" in nativeLabelChange("PROVIDER", "phone", "   "))
  check("rename: null resets", "reset" in nativeLabelChange("PROVIDER", "phone", null))
  check("rename: the catalog's own name resets (no row kept)", "reset" in nativeLabelChange("PROVIDER", "phone", "Cell Phone"))
  const c = nativeLabelChange("PROVIDER", "phone", "  Mobile   number ")
  check("rename: trimmed, spaces collapsed", "label" in c && c.label === "Mobile number", c)
  const long = nativeLabelChange("PROVIDER", "phone", "x".repeat(200))
  check("rename: capped at 80 characters", "label" in long && long.label.length === 80)
}

// ── 3. Mutation tests: the scan must fail when it should ─────────────────────

function mutationTests() {
  const bare = `const COLS = [\n  { key: "phone", label: "Phone" },\n]\nexport function X() { return COLS }`
  check("mutation: a literal label on a native key, never relabelled, is flagged", scanSource("x.tsx", bare).length === 1)
  const wrapped = `const COLS = [\n  { key: "phone", label: "Phone" },\n]\nfunction X(renamed) { return relabel(renamed, "PROVIDER", COLS) }`
  check("mutation: the same list through relabel() passes", scanSource("x.tsx", wrapped).length === 0)
  const readWithLabel = `const EDIT = {\n  phone: { key: "phone", label: "Phone" },\n}\nfunction X(renamed, key) {\n  const m = EDIT[key]\n  return { ...m, label: labelFrom(renamed, "PROVIDER", m.key, m.label) }\n}`
  check("mutation: a map whose entries get labelFrom() where read passes", scanSource("x.tsx", readWithLabel).length === 0)
  const inlineDef = `function X(renamed) {\n  const a = labelFrom(renamed, "REFERRAL", "notes", "Notes")\n  return { def: { key: "status", label: "Status", type: "select" } }\n}`
  check("mutation: an inline def in a file handling REFERRAL is flagged", scanSource("x.tsx", inlineDef).length === 1)
  const otherObject = `function X(renamed) {\n  const a = labelFrom(renamed, "TASK", "title", "Title")\n  return { def: { key: "assignedTo", label: "Assigned To", type: "user" } }\n}`
  check("mutation: a key outside the file's objects isn't flagged (TASK has no assignedTo)", scanSource("x.tsx", otherObject).length === 0)
  const inRelabelCall = `export function cols(labels) {\n  return relabel(labels, "REFERRAL", [\n    { key: "phone", label: "Phone" },\n  ])\n}`
  check("mutation: a literal list passed straight into relabel() passes", scanSource("x.tsx", inRelabelCall).length === 0)
  const stringParen = `const COLS = [\n  { key: "phone", label: "Phone (cell)" },\n]\nconst Y = relabel(m, "PROVIDER", COLS)`
  check("mutation: parentheses inside a label don't break the span", scanSource("x.tsx", stringParen).length === 0)
}

// ── 4. DB test, rolled back ───────────────────────────────────────────────────

const ROLLBACK = new Error("rollback")
const TEST_LABEL = "Mobile (label check)"

async function dbTest() {
  let read: Awaited<ReturnType<typeof loadNativeLabels>> = {}
  try {
    await prisma.$transaction(async (tx) => {
      await (tx as any).nativeFieldLabel.upsert({
        where: { objectType_fieldKey: { objectType: "PROVIDER", fieldKey: "phone" } },
        create: { objectType: "PROVIDER", fieldKey: "phone", label: TEST_LABEL },
        update: { label: TEST_LABEL },
      })
      await (tx as any).nativeFieldLabel.upsert({
        where: { objectType_fieldKey: { objectType: "REFERRAL", fieldKey: "patientMrn" } },
        create: { objectType: "REFERRAL", fieldKey: "patientMrn", label: "Outside MRN (label check)" },
        update: { label: "Outside MRN (label check)" },
      })
      read = await loadNativeLabels(tx)
      throw ROLLBACK
    })
  } catch (e) {
    if (e !== ROLLBACK) throw e
  }
  check("a stored rename is read back by the loader", read.PROVIDER?.phone === TEST_LABEL, read)
  const left = await (prisma as any).nativeFieldLabel.count({ where: { label: { contains: "(label check)" } } })
  check("the test rows were rolled back", left === 0, left)

  // The surfaces, fed the map that was read (no stored row needed).
  primeNativeLabelsForTest(read)
  try {
    const { loadPropertyCards } = await import("../lib/record-cards")
    const cards = await loadPropertyCards("PROVIDER", { id: "label-check", customProperties: {} })
    check("record cards: the provider field catalog shows the rename",
      cards.catalog.some((f: any) => f.key === "phone" && f.label === TEST_LABEL), cards.catalog.map((f: any) => `${f.key}=${f.label}`))

    const { fieldsFor } = await import("../lib/object-fields-server")
    const filters = await fieldsFor("PROVIDER")
    check("filters: the provider filter field shows the rename",
      filters.some((f: any) => f.key === "phone" && f.label === TEST_LABEL), filters.map((f: any) => `${f.key}=${f.label}`))

    const { reportFieldsFor } = await import("../lib/reporting/objects")
    const report = await reportFieldsFor("PROVIDER")
    check("reports: the provider report field shows the rename",
      report.some((f: any) => f.key === "phone" && f.label === TEST_LABEL), report.map((f: any) => `${f.key}=${f.label}`))

    const { referralExportColumns } = await import("../lib/referral-export-columns")
    const exp = referralExportColumns([], read)
    check("exports: the referral list's 'mrn' column follows a patientMrn rename",
      exp.mrn?.label === "Outside MRN (label check)", exp.mrn)

    const applied = await applyNativeLabels("PROVIDER", RECORD_FIELDS.PROVIDER)
    check("applyNativeLabels leaves unrenamed fields alone",
      applied.find((f) => f.key === "email")?.label === "Email" && applied.find((f) => f.key === "phone")?.label === TEST_LABEL)
  } finally {
    clearNativeLabelsMemo()
  }
}

async function main() {
  sourceScan()
  pureTests()
  mutationTests()
  await dbTest()
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED")
  await prisma.$disconnect()
  process.exit(failures ? 1 : 0)
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
