/**
 * Genesis AI's guarantees, checked against the real database. No model calls.
 *
 *   npx tsx --env-file=.env.local scripts/check-genesis-ai.ts
 *
 * Targets are DERIVED, never listed: every real user (with their teams) and
 * team permission set, every object (custom ones included), every filter field
 * and display column the CRM offers. Reads are read-only; the chat-storage test
 * writes only rows for two made-up user ids and deletes them.
 *
 * 1. Mapping — every join, pick list and relation count is mapped to the object
 *    it reveals (an unmapped one is refused at runtime; this makes it visible).
 * 2. Tool schemas — fixed text: no unions, and no admin text, names or PHI.
 * 3. Access — for every permission set and object, tools refuse what the person
 *    can't View and never return a field from an object they can't View.
 * 4. Answers agree with the CRM — counts, lists and grouped sums match.
 * 5. Input validation and result caps.
 * 6. Chats are private to their owner; the 30-day cleanup deletes only old ones;
 *    the window never shows thinking or raw tool results.
 * 7. Mutation tests — each guard fails when its condition is broken.
 */
import { prisma } from "../lib/prisma"
import { TOOL_DEFINITIONS, runTool, LIMITS, TOOL_NAMES } from "../lib/genesis-ai/tools"
import { allowedColumns, allowedFilterDefs, canViewObject, columnSource, filterFieldSource, viewableObjects, type Viewer } from "../lib/genesis-ai/access"
import { STATIC_SYSTEM, contextBlock } from "../lib/genesis-ai/prompt"
import { appendTurns, conversationLines, createConversation, deleteConversation, displayLines, loadHistory, purgeExpired, RETENTION_DAYS } from "../lib/genesis-ai/conversation"
import { fieldsFor } from "../lib/object-fields-server"
import { segmentColumnCatalog } from "../lib/segment-table"
import { listReportObjects } from "../lib/reporting/objects"
import { countObjectMatches } from "../lib/object-query"

let failures = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${!ok && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`)
}
const json = (s: string) => { try { return JSON.parse(s) } catch { return null } }

const ADMIN: Viewer = { id: "check-admin", name: "Check Admin", role: "ADMIN", permissions: [] }

async function permissionSets(): Promise<{ label: string; me: Viewer }[]> {
  const raw: { label: string; role: string; perms: string[] }[] = [
    { label: "admin", role: "ADMIN", perms: [] },
    { label: "nothing", role: "STAFF", perms: [] },
    { label: "referrals only", role: "STAFF", perms: ["REFERRALS:VIEW"] },
    { label: "practices only", role: "STAFF", perms: ["PRACTICES:VIEW"] },
  ]
  for (const t of await prisma.team.findMany({ select: { name: true, permissions: true } })) raw.push({ label: `team ${t.name}`, role: "STAFF", perms: t.permissions })
  const users = await prisma.user.findMany({ select: { id: true, role: true, permissions: true, teamMemberships: { select: { team: { select: { permissions: true } } } } } })
  for (const u of users) raw.push({ label: `user ${u.id}`, role: u.role, perms: Array.from(new Set([...(u.permissions ?? []), ...u.teamMemberships.flatMap((m) => m.team.permissions)])) })
  // One run per distinct (role, permissions).
  const seen = new Set<string>()
  return raw.filter((r) => { const k = `${r.role}|${[...r.perms].sort().join(",")}`; if (seen.has(k)) return false; seen.add(k); return true })
    .map((r, i) => ({ label: r.label, me: { id: `check-${i}`, name: "Check", role: r.role, permissions: r.perms } }))
}

// ── 1. Mapping ────────────────────────────────────────────────────────────────

async function mappingChecks(objects: { key: string }[]) {
  const unmapped: string[] = []
  for (const o of objects) {
    for (const d of await fieldsFor(o.key)) if (filterFieldSource(d) === "UNKNOWN") unmapped.push(`${o.key} filter ${d.key}`)
    for (const c of await segmentColumnCatalog(o.key)) if (columnSource(c) === "UNKNOWN") unmapped.push(`${o.key} column ${c.key}`)
  }
  check(`every join, pick list and count of ${objects.length} objects is mapped to its source object`, unmapped.length === 0, unmapped)
}

// ── 2. Tool schemas ───────────────────────────────────────────────────────────

async function forbiddenSchemaText(): Promise<string[]> {
  // Admin-written names and labels: none may appear in what's sent as schema.
  const defs = await prisma.customObjectDef.findMany({ select: { key: true, singular: true, plural: true, properties: true } })
  const cps = await prisma.customProperty.findMany({ select: { name: true } })
  const words = new Set<string>()
  for (const d of defs) {
    for (const w of [d.singular, d.plural, d.key]) if (w && w.length > 3) words.add(w.toLowerCase())
    for (const p of (d.properties as any[]) ?? []) if (p?.name && p.name.length > 3) words.add(String(p.name).toLowerCase())
  }
  for (const c of cps) if (c.name.length > 3) words.add(c.name.toLowerCase())
  // Ordinary words and built-in field names the fixed text uses on its own —
  // an admin happening to name a property "Call" or "State" doesn't put admin
  // text in the schema.
  for (const ok of ["notes", "name", "email", "phone", "status", "date", "type", "title", "owner", "description", "practice", "provider", "location", "referral", "referrals", "records",
    "call", "state", "time", "referral date"]) words.delete(ok)
  return Array.from(words)
}

function schemaLeaks(definitionsText: string, forbidden: string[]): string[] {
  const t = definitionsText.toLowerCase()
  return forbidden.filter((w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(t))
}

async function schemaChecks() {
  const text = JSON.stringify(TOOL_DEFINITIONS)
  check("tool definitions have no unions (anyOf / oneOf / type lists)", !/"anyOf"|"oneOf"|"type":\[/.test(text))
  check("every tool has a validator and a definition", TOOL_DEFINITIONS.length === TOOL_NAMES.length && TOOL_DEFINITIONS.every((d) => TOOL_NAMES.includes(d.name as any)))
  check("every tool schema forbids extra properties", TOOL_DEFINITIONS.every((d) => (d.input_schema as any).additionalProperties === false))
  const forbidden = await forbiddenSchemaText()
  const leaks = schemaLeaks(text, forbidden)
  check(`tool definitions carry none of ${forbidden.length} admin-written names`, leaks.length === 0, leaks)
  const promptLeaks = schemaLeaks(STATIC_SYSTEM, forbidden)
  check("the cached system prompt carries no admin-written names", promptLeaks.length === 0, promptLeaks)
  const ctx = contextBlock({ id: "u1", name: "Pat" }, new Date("2026-10-08T15:00:00Z"))
  check("the context block is only the date and who is asking", ctx === "Today is Thursday, October 8, 2026 (2026-10-08) in the clinic's timezone. The person asking is Pat (user id u1).", ctx)
  // Mutation: a definition carrying a custom object's name is caught.
  if (forbidden.length) check("mutation: a schema carrying an admin-written name is caught", schemaLeaks(`{"enum":["${forbidden[0]}"]}`, forbidden).length > 0)
}

// ── 3. Access ─────────────────────────────────────────────────────────────────

async function accessChecks(objects: { key: string; label: string }[]) {
  const sets = await permissionSets()
  const problems: string[] = []
  let refusedChecks = 0, describedChecks = 0
  for (const s of sets) {
    for (const o of objects) {
      const can = canViewObject(s.me, o.key)
      const d = await runTool("describe_object", { object: o.key }, s.me)
      if (!can) {
        refusedChecks++
        if (!d.isError) problems.push(`${s.label}: describe ${o.key} not refused`)
        const q = await runTool("query_records", { object: o.key, limit: 1 }, s.me)
        if (!q.isError) problems.push(`${s.label}: query ${o.key} not refused`)
        const a = await runTool("aggregate", { object: o.key, measure: "count" }, s.me)
        if (!a.isError) problems.push(`${s.label}: aggregate ${o.key} not refused`)
        continue
      }
      describedChecks++
      const body = json(d.content)
      if (!body) { problems.push(`${s.label}: describe ${o.key} failed: ${d.content.slice(0, 80)}`); continue }
      const [defs, cols] = await Promise.all([allowedFilterDefs(s.me, o.key), allowedColumns(s.me, o.key)])
      const fk = new Set(defs.map((x) => x.key)), ck = new Set(cols.map((x) => x.key))
      for (const f of body.filter_fields) if (!fk.has(f.key)) problems.push(`${s.label}: ${o.key} filter ${f.key} not allowed`)
      for (const c of body.display_fields) if (!ck.has(c.key)) problems.push(`${s.label}: ${o.key} column ${c.key} not allowed`)
      // Every allowed field's source object is one they can View.
      for (const x of defs) { const src = filterFieldSource(x); if (src && src !== "USER" && src !== "UNKNOWN" && !canViewObject(s.me, src)) problems.push(`${s.label}: ${o.key} filter ${x.key} reveals ${src}`) }
      for (const x of cols) { const src = columnSource(x); if (src && src !== "USER" && src !== "UNKNOWN" && !canViewObject(s.me, src)) problems.push(`${s.label}: ${o.key} column ${x.key} reveals ${src}`) }
    }
  }
  check(`${sets.length} permission sets × ${objects.length} objects: refusals (${refusedChecks}) and field lists (${describedChecks}) respect View`, problems.length === 0, problems.slice(0, 10))

  // A joined field from an object they can't View is refused in every position.
  const refOnly: Viewer = { id: "check-ref", name: "Check", role: "STAFF", permissions: ["REFERRALS:VIEW"] }
  const catalog = await segmentColumnCatalog("REFERRAL")
  const hidden = catalog.filter((c) => c.joinPath === "referringPractice")
  check("mutation guard: Referrals-only can't see Practice columns that exist (test isn't vacuous)", hidden.length > 0 && !(await allowedColumns(refOnly, "REFERRAL")).some((c) => c.joinPath === "referringPractice"))
  const col = hidden[0]?.key ?? "referringPractice.name"
  const r1 = await runTool("query_records", { object: "REFERRAL", columns: [col], limit: 1 }, refOnly)
  const r2 = await runTool("query_records", { object: "REFERRAL", filter: { conditions: [{ field: "practice.name", operator: "contains", values: ["a"] }] }, limit: 1 }, refOnly)
  const r3 = await runTool("aggregate", { object: "REFERRAL", measure: "count", group_by: col }, refOnly)
  const r4 = await runTool("query_records", { object: "REFERRAL", filter: { conditions: [{ field: "referringPracticeId", operator: "is_any_of", values: ["x"] }] }, limit: 1 }, refOnly)
  check("Referrals-only: a Practice column, filter, group-by and pick list are all refused", !!(r1.isError && r2.isError && r3.isError && r4.isError), [r1, r2, r3, r4].map((r) => r.content.slice(0, 60)))

  // get_record: links and timeline only from objects they can View.
  // A referral that still exists and has links (some links point at deleted records).
  const links = await prisma.objectAssociation.findMany({ where: { OR: [{ fromType: "REFERRAL" }, { toType: "REFERRAL" }] }, take: 500 })
  const candidates = Array.from(new Set(links.map((l) => (l.fromType === "REFERRAL" ? l.fromId : l.toId))))
  const live = await prisma.referral.findFirst({ where: { id: { in: candidates } }, select: { id: true } })
  const refId = live?.id ?? (await prisma.referral.findFirst({ select: { id: true } }))?.id
  if (refId) {
    const g = json((await runTool("get_record", { object: "REFERRAL", id: refId }, refOnly)).content)
    const allowedLabels = new Set((await allowedColumns(refOnly, "REFERRAL")).map((c) => c.label))
    const badFields = Object.keys(g?.fields ?? {}).filter((l) => !allowedLabels.has(l))
    const badLinks = (g?.linked_records ?? []).filter((l: any) => !canViewObject(refOnly, l.object))
    const badTimeline = (g?.timeline ?? []).filter((t: any) => t.kind === "TASK" || t.kind === "ACTIVITY")
    check("get_record (Referrals-only): fields, links and timeline come only from viewable objects", !!g && !badFields.length && !badLinks.length && !badTimeline.length, { badFields, badLinks, badTimeline: badTimeline.length })
  }
}

// ── 4. Answers agree with the CRM ─────────────────────────────────────────────

async function agreementChecks() {
  const filter = { conditions: [{ field: "referralDate", operator: "relative", values: ["last_365"] }] }
  const count = json((await runTool("aggregate", { object: "REFERRAL", measure: "count", filter }, ADMIN)).content)
  const list = json((await runTool("query_records", { object: "REFERRAL", filter, limit: 3 }, ADMIN)).content)
  const grouped = json((await runTool("aggregate", { object: "REFERRAL", measure: "count", filter, group_by: "status", limit: 100 }, ADMIN)).content)
  const sum = (grouped?.groups ?? []).reduce((n: number, g: any) => n + Number(Object.values(g)[1] ?? 0), 0)
  check("count = list total = sum of the by-status groups (referrals, last 365 days)",
    count?.count === list?.total && !grouped?.note && sum === count?.count, { count: count?.count, total: list?.total, sum })
  const direct = await countObjectMatches("REFERRAL", null)
  const all = json((await runTool("aggregate", { object: "REFERRAL", measure: "count" }, ADMIN)).content)
  check("an unfiltered count is exact (beyond the report engine's 10,000-row cap)", all?.count === direct.total, { tool: all?.count, direct: direct.total })
  // Labels work like values; "@me" means the asker.
  const byValue = json((await runTool("aggregate", { object: "REFERRAL", measure: "count", filter: { conditions: [{ field: "status", operator: "is_any_of", values: ["NEW"] }] } }, ADMIN)).content)
  const byLabel = json((await runTool("aggregate", { object: "REFERRAL", measure: "count", filter: { conditions: [{ field: "status", operator: "is_any_of", values: ["new"] }] } }, ADMIN)).content)
  check("a select option's label filters like its value", byValue?.count === byLabel?.count && typeof byValue?.count === "number", { byValue, byLabel })
  const someone = await prisma.task.findFirst({ where: { assignedToId: { not: null } }, select: { assignedToId: true } })
  if (someone?.assignedToId) {
    const me: Viewer = { ...ADMIN, id: someone.assignedToId }
    const mine = json((await runTool("aggregate", { object: "TASK", measure: "count", filter: { conditions: [{ field: "assignedToId", operator: "is_any_of", values: ["@me"] }] } }, me)).content)
    const truth = await prisma.task.count({ where: { assignedToId: someone.assignedToId } })
    check("\"@me\" in a person field means the person asking", mine?.count === truth, { mine: mine?.count, truth })
  }
  const found = await prisma.referral.findFirst({ where: { patientLastName: { not: "" } }, select: { id: true, patientFirstName: true, patientLastName: true } })
  if (found?.patientLastName) {
    const f = json((await runTool("find_records", { object: "REFERRAL", text: `${found.patientFirstName ?? ""} ${found.patientLastName}`.trim(), limit: 25 }, ADMIN)).content)
    check("find_records finds a referral by first + last name", (f?.records ?? []).some((r: any) => r.id === found.id) || (f?.matches ?? 0) > 25)
  }
}

// ── 5. Validation and caps ────────────────────────────────────────────────────

async function validationChecks() {
  const bad: [string, string, unknown][] = [
    ["an unknown tool", "drop_table", {}],
    ["an extra property", "list_objects", { sneaky: true }],
    ["a missing object", "query_records", {}],
    ["an unknown field", "query_records", { object: "REFERRAL", filter: { conditions: [{ field: "nope", operator: "is", values: ["x"] }] } }],
    ["a wrong operator", "query_records", { object: "REFERRAL", filter: { conditions: [{ field: "status", operator: "contains", values: ["x"] }] } }],
    ["an unknown date preset", "query_records", { object: "REFERRAL", filter: { conditions: [{ field: "referralDate", operator: "relative", values: ["last_forever"] }] } }],
    ["sorting by a joined field", "query_records", { object: "REFERRAL", sort_by: "practice.name" }],
    ["an unknown object", "aggregate", { object: "SECRET", measure: "count" }],
    ["sum without a field", "aggregate", { object: "REFERRAL", measure: "sum" }],
    ["a date bucket on a non-date", "aggregate", { object: "REFERRAL", measure: "count", group_by: "status", date_bucket: "month" }],
    ["a missing record", "get_record", { object: "REFERRAL", id: "no-such-id" }],
  ]
  for (const [label, name, input] of bad) {
    const r = await runTool(name, input, ADMIN)
    check(`refuses ${label}`, !!r.isError, r.content.slice(0, 100))
  }
  const big = await runTool("query_records", { object: "REFERRAL", limit: 500, columns: [] }, ADMIN)
  const body = json(big.content)
  check(`row cap: at most ${LIMITS.rows} rows, result within ${LIMITS.resultChars} chars`, (body?.rows?.length ?? 99) <= LIMITS.rows && big.content.length <= LIMITS.resultChars, { rows: body?.rows?.length, chars: big.content.length })
  const echo = await runTool("query_records", { object: "REFERRAL", filter: { conditions: [{ field: 123, operator: "is", values: ["PATIENT-SECRET"] }] } }, ADMIN)
  check("a validation error never echoes the input's values", echo.isError === true && !echo.content.includes("PATIENT-SECRET"), echo.content)
}

// ── 6. Chat storage ───────────────────────────────────────────────────────────

async function storageChecks() {
  const A = "genesis-check-user-a", B = "genesis-check-user-b"
  try {
    const conv = await createConversation(A, "How many referrals last week?")
    await appendTurns(A, conv.id, [
      { role: "assistant", content: [{ type: "thinking", thinking: "THINKING-SECRET", signature: "sig" }, { type: "tool_use", id: "tu1", name: "aggregate", input: { object: "REFERRAL", measure: "count" } }] as any },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "tu1", content: "TOOL-RESULT-SECRET" }] },
      { role: "assistant", content: [{ type: "text", text: "There were 12." }] },
    ])
    check("the owner's history loads in order with thinking blocks intact",
      JSON.stringify(await loadHistory(A, conv.id)).includes("THINKING-SECRET"))
    check("another user can't load it", (await loadHistory(B, conv.id)).length === 0 && (await conversationLines(B, conv.id)) === null)
    await appendTurns(B, conv.id, [{ role: "user", content: [{ type: "text", text: "INTRUDER" }] }])
    check("another user can't add to it", !JSON.stringify(await loadHistory(A, conv.id)).includes("INTRUDER"))
    check("another user can't delete it", (await deleteConversation(B, conv.id)) === false && !!(await conversationLines(A, conv.id)))
    const lines = (await conversationLines(A, conv.id))!.lines
    const shown = JSON.stringify(lines)
    check("the window shows the question and answer, never thinking or tool results",
      shown.includes("There were 12.") && !shown.includes("THINKING-SECRET") && !shown.includes("TOOL-RESULT-SECRET") && lines.find((l) => l.role === "assistant")?.tools?.length === 1, lines)
    check("the owner can delete it", (await deleteConversation(A, conv.id)) === true)

    // Retention: only chats untouched for RETENTION_DAYS go. Dated in the year
    // 2000, so no real chat is old enough to be touched by this run.
    const old = await createConversation(A, "old"), recent = await createConversation(A, "recent")
    await prisma.$executeRaw`UPDATE "AiConversation" SET "updatedAt" = ${new Date("2000-01-01T00:00:00Z")} WHERE id = ${old.id}`
    await prisma.$executeRaw`UPDATE "AiConversation" SET "updatedAt" = ${new Date("2000-02-10T00:00:00Z")} WHERE id = ${recent.id}`
    const now = new Date(new Date("2000-01-01T00:00:00Z").getTime() + (RETENTION_DAYS + 1) * 86_400_000) // 31 days after `old`
    const deleted = await purgeExpired(now)
    const left = await prisma.aiConversation.findMany({ where: { id: { in: [old.id, recent.id] } }, select: { id: true } })
    check(`cleanup deletes chats older than ${RETENTION_DAYS} days and keeps newer ones`, deleted === 1 && left.length === 1 && left[0].id === recent.id, { deleted, left })
  } finally {
    await prisma.aiConversation.deleteMany({ where: { userId: { in: [A, B] } } })
  }
  // Pure: a stopped question followed by another merges into one user turn.
  const merged = displayLines([{ role: "user", content: [{ type: "text", text: "q1" }] }, { role: "user", content: [{ type: "text", text: "q2" }] }])
  check("display: consecutive questions both show", merged.length === 2)
}

// ── 7. Mutation tests ─────────────────────────────────────────────────────────

function mutationChecks() {
  check("mutation: an unmapped join is reported UNKNOWN (and so refused)", filterFieldSource({ key: "x.name", label: "X", type: "text", relationPath: "brandNewJoin", column: "name", readPath: [] } as any) === "UNKNOWN")
  check("mutation: an unmapped pick list is reported UNKNOWN", filterFieldSource({ key: "fooId", label: "Foo", type: "select", column: "fooId", readPath: [] } as any) === "UNKNOWN")
  check("mutation: a plain field reveals nothing else", filterFieldSource({ key: "notes", label: "Notes", type: "text", column: "notes", readPath: [] } as any) === null)
}

async function main() {
  const objects = await listReportObjects()
  await mappingChecks(objects)
  await schemaChecks()
  await accessChecks(objects)
  await agreementChecks()
  await validationChecks()
  await storageChecks()
  mutationChecks()
  check("admin can see every object", (await viewableObjects(ADMIN)).length === objects.length)
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED")
  await prisma.$disconnect()
  process.exit(failures ? 1 : 0)
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
