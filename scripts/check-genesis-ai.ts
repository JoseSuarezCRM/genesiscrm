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
 * 8. Actions — every propose_* tool refuses exactly when the screens would, for
 *    every permission set and object; only allowlisted fields can change and
 *    special fields go through their own action; values are converted right;
 *    cards warn about patient messages; proposing changes nothing; a proposal
 *    runs once, only for its owner, and expires. No proposal is ever executed.
 */
import { prisma } from "../lib/prisma"
import { TOOL_DEFINITIONS, ALL_TOOL_DEFINITIONS, runTool, LIMITS, TOOL_NAMES } from "../lib/genesis-ai/tools"
import { ACTION_TOOL_DEFINITIONS, ACTION_TOOL_NAMES, proposeAction } from "../lib/genesis-ai/actions"
import { canCreateObject, canCreateReport, canCreateSegment, canDeleteObject, canEditObject } from "../lib/genesis-ai/actions/gates"
import { coerceValue, editableFields, type EditableField } from "../lib/genesis-ai/actions/fields"
import { cancel, claim, finish } from "../lib/genesis-ai/actions/lifecycle"
import { ACTION_TTL_MS } from "../lib/genesis-ai/actions/types"
import { ACTION_NOTE_PREFIX } from "../lib/genesis-ai/conversation"
import { RECORD_FIELDS } from "../lib/record-field-catalog"
import { delegateFor, isCustomObject } from "../lib/automation-records"
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
    "call", "state", "time", "referral date", "outcome"]) words.delete(ok)
  return Array.from(words)
}

function schemaLeaks(definitionsText: string, forbidden: string[]): string[] {
  const t = definitionsText.toLowerCase()
  return forbidden.filter((w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(t))
}

async function schemaChecks() {
  const text = JSON.stringify(ALL_TOOL_DEFINITIONS)
  check(`tool definitions (${ALL_TOOL_DEFINITIONS.length}) have no unions (anyOf / oneOf / type lists)`, !/"anyOf"|"oneOf"|"type":\[/.test(text))
  check("every read tool has a validator and a definition", TOOL_DEFINITIONS.length === TOOL_NAMES.length && TOOL_DEFINITIONS.every((d) => TOOL_NAMES.includes(d.name as any)))
  check("every action tool has a validator and a definition", ACTION_TOOL_DEFINITIONS.length === ACTION_TOOL_NAMES.length && ACTION_TOOL_DEFINITIONS.every((d) => ACTION_TOOL_NAMES.includes(d.name as any)))
  check("tool names are unique", new Set(ALL_TOOL_DEFINITIONS.map((d) => d.name)).size === ALL_TOOL_DEFINITIONS.length)
  // Every object schema, nested ones included, forbids extra properties.
  const openObjects: string[] = []
  const walkSchema = (node: any, where: string) => {
    if (!node || typeof node !== "object") return
    if (node.type === "object" && node.additionalProperties !== false) openObjects.push(where)
    for (const [k, v] of Object.entries(node)) if (v && typeof v === "object") walkSchema(v, `${where}.${k}`)
  }
  for (const d of ALL_TOOL_DEFINITIONS) walkSchema(d.input_schema, d.name)
  check("every object in every tool schema forbids extra properties", openObjects.length === 0, openObjects)
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

// ── 8. Actions ────────────────────────────────────────────────────────────────

const ACCESS_REFUSAL = /don't have permission|isn't an object this person can see/

/** A "field"-route save key must be a catalog field people may edit, a custom property, or a custom-object property. */
function allowlistViolations(objectType: string, fields: EditableField[]): string[] {
  const editableNative = new Set((RECORD_FIELDS[objectType] ?? []).filter((f) => !f.readOnly).map((f) => f.key))
  const NEVER = new Set(["status", "assignedToId", "ownerId", "createdById", "updatedById", "stageId", "pipelineId", "id", "recordNumber", "objectDefId", "createdAt", "updatedAt", "referralDate"])
  return fields.filter((f) => f.route === "field").filter((f) => {
    if (isCustomObject(objectType)) return f.saveKey.startsWith("cp_") // custom-object props are bare ids
    if (f.saveKey.startsWith("cp_")) return false
    return !editableNative.has(f.saveKey) || NEVER.has(f.saveKey)
  }).map((f) => `${objectType}.${f.saveKey}`)
}

async function sampleRecordId(objectType: string): Promise<string | null> {
  const model = delegateFor(objectType)
  if (!model) return null
  const where = isCustomObject(objectType) ? { objectDef: { key: objectType.slice(3) } } : {}
  return (await model.findFirst({ where, select: { id: true } }).catch(() => null))?.id ?? null
}

async function actionChecks(objects: { key: string; label: string }[]) {
  // Field allowlist and routing, for every object.
  const violations: string[] = []
  const routes: Record<string, Record<string, string>> = {}
  for (const o of objects) {
    const fields = await editableFields(o.key)
    violations.push(...allowlistViolations(o.key, fields))
    routes[o.key] = Object.fromEntries(fields.map((f) => [f.key, f.route]))
  }
  check(`only allowlisted fields can change, on all ${objects.length} objects`, violations.length === 0, violations)
  check("special fields go through their own action",
    routes.REFERRAL?.status === "referral_status" && routes.REFERRAL?.owner === "referral_owner" && routes.REFERRAL?.pipelineId === "referral_pipeline" &&
    routes.TASK?.status === "task_status" && routes.SURGERY?.status === "surgery" && routes.PRACTICE?.owner === "owner" && !("referralDate" in (routes.REFERRAL ?? {})),
    { REFERRAL: routes.REFERRAL, TASK: routes.TASK })
  const leaky: EditableField[] = [{ key: "createdById", label: "x", type: "text", route: "field", saveKey: "createdById" }]
  check("mutation: a read-only column on the generic path is caught", allowlistViolations("REFERRAL", leaky).length === 1)

  // Value conversion.
  const users = [{ id: "u-me", name: "Pat Lee" }, { id: "u-2", name: "Sam Ortiz" }]
  const sel: EditableField = { key: "status", label: "Status", type: "select", route: "referral_status", saveKey: "status", options: [{ value: "NEW", label: "New" }, { value: "SCHEDULED", label: "Scheduled" }] }
  const conv = (f: EditableField, v: string[]): any => { try { return coerceValue(f, v, "u-me", users) } catch (e) { return { error: (e as Error).message } } }
  check("values: an option by its label", conv(sel, ["scheduled"]).value === "SCHEDULED")
  check("values: an unknown option is refused", !!conv(sel, ["Maybe"]).error)
  check("values: a date becomes a calendar day", conv({ key: "d", label: "D", type: "date", route: "field", saveKey: "appointmentDate" }, ["2026-10-09"]).value === "2026-10-09")
  check("values: a custom date property is stored at noon UTC", conv({ key: "cp_x", label: "D", type: "date", route: "field", saveKey: "cp_x" }, ["2026-10-09"]).value === "2026-10-09T12:00:00.000Z")
  check("values: a bad date is refused", !!conv({ key: "d", label: "D", type: "date", route: "field", saveKey: "appointmentDate" }, ["next tuesday-ish"]).error)
  check("values: \"@me\" and names resolve to people",
    conv({ key: "owner", label: "O", type: "user", route: "owner", saveKey: "owner" }, ["@me"]).value === "u-me" &&
    conv({ key: "owner", label: "O", type: "user", route: "owner", saveKey: "owner" }, ["sam ortiz"]).value === "u-2")
  check("values: numbers, checkboxes, multi-select",
    conv({ key: "n", label: "N", type: "number", route: "field", saveKey: "cp_n" }, ["$1,250"]).value === 1250 &&
    conv({ key: "c", label: "C", type: "checkbox", route: "field", saveKey: "cp_c" }, ["yes"]).value === true &&
    JSON.stringify(conv({ ...sel, multi: true, route: "field", saveKey: "cp_m" }, ["New", "Scheduled"]).value) === JSON.stringify(["NEW", "SCHEDULED"]))
  check("values: [] clears a field", conv(sel, []).value === null)

  // Proposals need a chat to belong to; everything made here is deleted at the end.
  const owner = "genesis-check-actions"
  const chat = await createConversation(owner, "check")
  let n = 0
  const ctx = () => ({ conversationId: chat.id, toolUseId: `check-tu-${++n}` })
  try {
    // Access: every permission set × object × kind refuses exactly when the screens would.
    const sets = await permissionSets()
    const samples = new Map<string, string | null>()
    const textField = new Map<string, string | undefined>()
    for (const o of objects) {
      samples.set(o.key, await sampleRecordId(o.key))
      textField.set(o.key, (await editableFields(o.key)).find((f) => f.route === "field" && (f.type === "text" || f.type === "long_text"))?.key)
    }
    const wrong: string[] = []
    let checked = 0
    const expect = (label: string, allowed: boolean, out: { isError?: boolean; content: string }) => {
      checked++
      const refused = !!out.isError && ACCESS_REFUSAL.test(out.content)
      if (allowed === refused) wrong.push(`${label}: expected ${allowed ? "allowed" : "refused"} — ${out.content.slice(0, 90)}`)
    }
    // One real permission set per distinct outcome on each object: the gates are
    // what's under test, and sets with the same answers would only repeat them.
    let distinct = 0
    for (const o of objects) {
      const seen = new Set<string>()
      for (const s of sets) {
        const sig = [canViewObject(s.me, o.key), canEditObject(s.me, o.key), canDeleteObject(s.me, o.key), canCreateObject(s.me, o.key), canCreateSegment(s.me, o.key), canCreateReport(s.me, [o.key])].join("")
        if (seen.has(sig)) continue
        seen.add(sig)
        distinct++
        const id = samples.get(o.key)
        const field = textField.get(o.key)
        const see = canViewObject(s.me, o.key)
        if (id && field) expect(`${s.label} update ${o.key}`, see && canEditObject(s.me, o.key), await proposeAction("propose_update_records", { object: o.key, record_ids: [id], changes: [{ field, values: ["genesis-check"] }] }, s.me, ctx()))
        if (id) expect(`${s.label} delete ${o.key}`, see && canDeleteObject(s.me, o.key), await proposeAction("propose_delete_records", { object: o.key, record_ids: [id] }, s.me, ctx()))
        expect(`${s.label} create ${o.key}`, see && canCreateObject(s.me, o.key), await proposeAction("propose_create_record", { object: o.key, values: [] }, s.me, ctx()))
        expect(`${s.label} segment ${o.key}`, see && canCreateSegment(s.me, o.key), await proposeAction("propose_create_segment", { name: "check", object: o.key, kind: "active" }, s.me, ctx()))
        expect(`${s.label} report ${o.key}`, see && canCreateReport(s.me, [o.key]), await proposeAction("propose_create_report", { name: "check", object: o.key, measure: "count", chart: "table", group_by: "nope" }, s.me, ctx()))
      }
    }
    check(`${checked} proposals (${distinct} distinct access combinations from ${sets.length} permission sets × ${objects.length} objects) are refused exactly when the screens would`, wrong.length === 0, wrong.slice(0, 8))

    // Non-vacuous: someone who may edit but not delete referrals.
    const editor: Viewer = { id: "check-editor", name: "Check", role: "STAFF", permissions: ["REFERRALS:EDIT"] }
    const refId = samples.get("REFERRAL")
    if (refId) {
      const up = await proposeAction("propose_update_records", { object: "REFERRAL", record_ids: [refId], changes: [{ field: "notes", values: ["x"] }] }, editor, ctx())
      const del = await proposeAction("propose_delete_records", { object: "REFERRAL", record_ids: [refId] }, editor, ctx())
      check("mutation guard: Edit without Delete — the update is allowed, the delete refused", !up.isError && !!del.isError && ACCESS_REFUSAL.test(del.content), [up.content.slice(0, 80), del.content.slice(0, 80)])

      // Cards warn when a change will message the patient.
      const sched = await proposeAction("propose_update_records", { object: "REFERRAL", record_ids: [refId], changes: [{ field: "status", values: ["Scheduled"] }] }, ADMIN, ctx())
      const fresh = await proposeAction("propose_update_records", { object: "REFERRAL", record_ids: [refId], changes: [{ field: "status", values: ["New"] }] }, ADMIN, ctx())
      check("a Scheduled status card warns about the patient text/email; a New one doesn't",
        !!sched.action?.card.warnings.some((w) => /texts and emails the patient/.test(w)) && !fresh.action?.card.warnings.some((w) => /patient/.test(w)), [sched.action?.card, fresh.action?.card])
      const delCard = await proposeAction("propose_delete_records", { object: "REFERRAL", record_ids: [refId] }, ADMIN, ctx())
      check("a delete card is marked dangerous and says it can't be undone", !!delCard.action?.card.danger && !!delCard.action?.card.warnings.some((w) => /can't be undone/.test(w)))
      const newRef = await proposeAction("propose_create_record", { object: "REFERRAL", values: [{ field: "patientFirstName", values: ["Check"] }, { field: "patientLastName", values: ["Only"] }] }, ADMIN, ctx())
      check("a new-referral card warns about automated patient messages", !!newRef.action?.card.warnings.some((w) => /patient messages/.test(w)), newRef.content.slice(0, 120))
      const readOnly = await proposeAction("propose_update_records", { object: "REFERRAL", record_ids: [refId], changes: [{ field: "referralDate", values: ["2026-01-01"] }] }, ADMIN, ctx())
      check("a read-only field is refused even for an admin", !!readOnly.isError && /can't be changed/.test(readOnly.content))
    }

    // Proposing changes nothing.
    const task = await prisma.task.findFirst({ where: { status: { not: "COMPLETED" } }, select: { id: true, status: true, updatedAt: true } })
    if (task) {
      const out = await proposeAction("propose_update_records", { object: "TASK", record_ids: [task.id], changes: [{ field: "status", values: ["Completed"] }] }, ADMIN, ctx())
      const after = await prisma.task.findUnique({ where: { id: task.id }, select: { status: true, updatedAt: true } })
      check("proposing \"mark complete\" changes nothing until Confirm",
        !out.isError && /Mark task/.test(out.action?.card.title ?? "") && after?.status === task.status && after?.updatedAt.getTime() === task.updatedAt.getTime(),
        { title: out.action?.card.title, before: task.status, after: after?.status })
      check("the model is told it isn't done yet", /awaiting_confirmation/.test(out.content) && /Don't say it's done/.test(out.content))
    }

    // Lifecycle: owner only, once, and it expires.
    const mk = (createdAt = new Date()) => prisma.aiPendingAction.create({
      data: { userId: owner, conversationId: chat.id, toolUseId: `life-${++n}`, kind: "add_note", payload: {}, card: { title: "Check card", lines: [], warnings: [] }, createdAt },
    })
    const a = await mk()
    check("another user can't confirm or cancel a proposal", (await claim("someone-else", a.id)) === null && (await cancel("someone-else", a.id)) === null)
    const c1 = await claim(owner, a.id)
    const c2 = await claim(owner, a.id)
    check("a proposal is claimed once — a double click runs it once", c1?.kind === "run" && c2?.kind === "settled" && c2.view.status === "RUNNING", [c1?.kind, c2?.kind])
    if (c1?.kind === "run") {
      const v = await finish(owner, c1.row, { ok: true, message: "Did it." })
      const c3 = await claim(owner, a.id)
      check("a finished proposal can't run again", v.status === "DONE" && c3?.kind === "settled" && c3.view.status === "DONE")
    }
    const b = await mk()
    const cancelled = await cancel(owner, b.id)
    check("cancel marks it cancelled and it can't then run", cancelled?.status === "CANCELLED" && (await claim(owner, b.id))?.kind === "settled")
    const old = await mk(new Date(Date.now() - ACTION_TTL_MS - 60_000))
    const ex = await claim(owner, old.id)
    check("after 30 minutes a proposal expires instead of running", ex?.kind === "settled" && ex.view.status === "EXPIRED")
    const notes = await prisma.aiMessage.findMany({ where: { conversationId: chat.id }, select: { content: true } })
    const texts = notes.map((m) => JSON.stringify(m.content))
    check("the chat is told about done, cancelled and expired proposals",
      ["it's done", "cancelled", "expired"].every((k) => texts.some((t) => t.includes("[Genesis action]") && t.includes(k))), texts.length)
    const shown = (await conversationLines(owner, chat.id))?.lines ?? []
    check("action notes are never shown as messages", !JSON.stringify(shown).includes(ACTION_NOTE_PREFIX.trim()))
  } finally {
    await prisma.aiConversation.deleteMany({ where: { id: chat.id } })
  }
  const leftover = await prisma.aiPendingAction.count({ where: { conversationId: chat.id } })
  check("every test proposal was deleted", leftover === 0, leftover)
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
  await actionChecks(objects)
  check("admin can see every object", (await viewableObjects(ADMIN)).length === objects.length)
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED")
  await prisma.$disconnect()
  process.exit(failures ? 1 : 0)
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
