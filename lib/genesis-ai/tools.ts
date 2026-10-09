// Genesis AI's tools: read-only, and every one acts as the person asking.
// Server only.
//
// Rules every tool follows:
// - The object must be one the person can View (lib/genesis-ai/access.ts), and
//   every field it filters, shows, groups or measures must come from an object
//   they can View. Anything else is refused with a message the model can relay.
// - The tool definitions are fixed text: no admin wording, no names, no PHI —
//   the compliance rule for anything schema-like sent to the API
//   (lib/referral-calls/ai-prompt.ts). Values are always string arrays, so no
//   schema has a union.
// - Results are capped (rows, cell length, total size) and carry each record's
//   link, so answers can point at the record instead of repeating it.

import type Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { OPERATORS, uid, type Condition, type FieldType, type FilterState } from "@/lib/filters"
import { describeFilter, toFilterFields, type ObjectFieldDef } from "@/lib/object-fields"
import { DATE_PRESET_GROUPS } from "@/lib/reporting/date-presets"
import { buildObjectWhere, countObjectMatches, queryObjectIds } from "@/lib/object-query"
import { loadSegmentRows, type SegmentColumn } from "@/lib/segment-table"
import { runReport } from "@/lib/reporting/query"
import { REPORT_OBJECTS, reportFieldsFor } from "@/lib/reporting/objects"
import { recordHref } from "@/lib/record-href"
import { delegateFor, isCustomObject, recordLabel } from "@/lib/automation-records"
import { allowedColumns, allowedFilterDefs, canViewObject, viewableObjects, FK_TARGET, RELATION_TARGET, type Viewer } from "./access"

// ── Limits ────────────────────────────────────────────────────────────────────

export const LIMITS = {
  rows: 50,
  findRows: 25,
  groups: 100,
  cell: 300,
  recordCell: 2000,
  timeline: 15,
  timelineBody: 600,
  associations: 25,
  resultChars: 20_000,
  options: 60,
  aggregateRows: 25_000,
} as const

// ── Definitions (sent to the model; fixed text only) ─────────────────────────

const OBJECT = { type: "string", description: "Object key from list_objects, e.g. \"REFERRAL\", or \"CO:<key>\" for a custom object." }
const FILTER = {
  type: "object",
  description: "Which records to include. Field keys come from describe_object's filter_fields.",
  properties: {
    match: { type: "string", enum: ["all", "any"], description: "all = every condition must hold; any = at least one. Default all." },
    conditions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: { type: "string", description: "A filter_fields key." },
          operator: { type: "string", description: "An operator valid for the field's type (see the system prompt)." },
          values: {
            type: "array", items: { type: "string" },
            description: "Operand(s). One value for most operators; several for is_any_of / is_none_of; [from, to] for between; a preset key for relative; [] for is_known / is_unknown / is_true / is_false. Dates are yyyy-mm-dd. Use \"@me\" in a person field for the person asking.",
          },
        },
        required: ["field", "operator", "values"],
        additionalProperties: false,
      },
    },
  },
  required: ["conditions"],
  additionalProperties: false,
}

export const TOOL_DEFINITIONS: Anthropic.Messages.Tool[] = [
  {
    name: "list_objects",
    description: "List the kinds of records this person can see (built-in and custom objects), with how many records each has. Call this first when unsure which object holds the answer.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "describe_object",
    description: "The fields of one object that this person may use: filter_fields (for filters) and display_fields (for columns, grouping and sums), with types and options. Call before filtering or grouping on an object you haven't described in this conversation.",
    input_schema: { type: "object", properties: { object: OBJECT }, required: ["object"], additionalProperties: false },
  },
  {
    name: "find_records",
    description: "Find records by name or other text (patient name, MRN, phone, email, practice or provider name). Returns matches with their ids and links. Use it to locate a specific record before get_record.",
    input_schema: {
      type: "object",
      properties: {
        object: OBJECT,
        text: { type: "string", description: "What to look for. Every word must match some text field." },
        limit: { type: "integer", description: "At most 25. Default 10." },
      },
      required: ["object", "text"],
      additionalProperties: false,
    },
  },
  {
    name: "query_records",
    description: "List records matching a filter, with chosen columns, plus the total number that match. Use for \"which / show me / list\" questions. At most 50 rows are returned; the total is always exact.",
    input_schema: {
      type: "object",
      properties: {
        object: OBJECT,
        filter: FILTER,
        columns: { type: "array", items: { type: "string" }, description: "display_fields keys to show. Default: a few useful ones." },
        sort_by: { type: "string", description: "A filter_fields key of a plain field (not a custom property or a joined field). Default: newest created first." },
        sort_direction: { type: "string", enum: ["asc", "desc"] },
        limit: { type: "integer", description: "Rows to return, at most 50. Default 20." },
      },
      required: ["object"],
      additionalProperties: false,
    },
  },
  {
    name: "aggregate",
    description: "Count, sum, average, min or max over the records matching a filter, optionally grouped by a field (and by day/week/month/quarter/year for a date field) and broken down by a second field. Use for \"how many / total / average / by month / by practice\" questions.",
    input_schema: {
      type: "object",
      properties: {
        object: OBJECT,
        filter: FILTER,
        measure: { type: "string", enum: ["count", "sum", "avg", "min", "max"] },
        measure_field: { type: "string", description: "A number display_fields key; required unless measure is count." },
        group_by: { type: "string", description: "A display_fields key marked groupable." },
        date_bucket: { type: "string", enum: ["day", "week", "month", "quarter", "year"], description: "When group_by is a date field." },
        breakdown_by: { type: "string", description: "A second groupable display_fields key, splitting each group." },
        limit: { type: "integer", description: "Groups to return, at most 100. Default 25." },
      },
      required: ["object", "measure"],
      additionalProperties: false,
    },
  },
  {
    name: "get_record",
    description: "Everything this person can see about one record: its fields, linked records, and its latest notes, tasks and activities.",
    input_schema: {
      type: "object",
      properties: { object: OBJECT, id: { type: "string", description: "The record id (from find_records or query_records)." } },
      required: ["object", "id"],
      additionalProperties: false,
    },
  },
]

// ── Input validation (the server never trusts the model's input) ─────────────

const FilterInput = z.object({
  match: z.enum(["all", "any"]).optional(),
  conditions: z.array(z.object({ field: z.string().min(1), operator: z.string().min(1), values: z.array(z.string()).max(200) })).max(20),
}).strict()

const Inputs = {
  list_objects: z.object({}).strict(),
  describe_object: z.object({ object: z.string().min(1) }).strict(),
  find_records: z.object({ object: z.string().min(1), text: z.string().min(1).max(200), limit: z.number().int().optional() }).strict(),
  query_records: z.object({
    object: z.string().min(1), filter: FilterInput.optional(), columns: z.array(z.string()).max(30).optional(),
    sort_by: z.string().optional(), sort_direction: z.enum(["asc", "desc"]).optional(), limit: z.number().int().optional(),
  }).strict(),
  aggregate: z.object({
    object: z.string().min(1), filter: FilterInput.optional(), measure: z.enum(["count", "sum", "avg", "min", "max"]),
    measure_field: z.string().optional(), group_by: z.string().optional(),
    date_bucket: z.enum(["day", "week", "month", "quarter", "year"]).optional(), breakdown_by: z.string().optional(),
    limit: z.number().int().optional(),
  }).strict(),
  get_record: z.object({ object: z.string().min(1), id: z.string().min(1).max(64) }).strict(),
} as const

export type ToolName = keyof typeof Inputs
export const TOOL_NAMES = Object.keys(Inputs) as ToolName[]

// ── Results ───────────────────────────────────────────────────────────────────

export interface ToolOutcome {
  /** JSON text for the model. */
  content: string
  isError?: boolean
  /** A short line for the chat UI ("Counted Referrals · 132"). */
  status: string
  /** Objects read, and records opened one by one — for the audit log. */
  objects: string[]
  recordIds: string[]
}

class ToolError extends Error {}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const clamp = (n: number | undefined, dflt: number, max: number) => Math.min(Math.max(1, Math.floor(n ?? dflt)), max)
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`

/** JSON within the size cap: trims a `rows`/`groups`/`records` list from the end if needed. */
function fit(obj: Record<string, unknown>): string {
  let s = JSON.stringify(obj)
  const key = ["rows", "groups", "records", "timeline"].find((k) => Array.isArray(obj[k]))
  while (s.length > LIMITS.resultChars && key && (obj[key] as unknown[]).length > 1) {
    const list = obj[key] as unknown[]
    obj[key] = list.slice(0, Math.max(1, Math.floor(list.length * 0.7)))
    obj.truncated = `Only the first ${(obj[key] as unknown[]).length} fit; narrow the question for more.`
    s = JSON.stringify(obj)
  }
  return s.length > LIMITS.resultChars ? s.slice(0, LIMITS.resultChars) : s
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** The object key the model meant: a key ("REFERRAL", "CO:athletes") or a label ("Referrals"). */
async function resolveObject(me: Viewer, input: string): Promise<{ key: string; label: string }> {
  const objects = await viewableObjects(me)
  const q = input.trim().toLowerCase()
  const hit = objects.find((o) => o.key.toLowerCase() === q)
    ?? objects.find((o) => o.label.toLowerCase() === q)
    ?? objects.find((o) => `co:${o.label.toLowerCase()}` === q)
  if (hit) return hit
  throw new ToolError(`"${input}" isn't an object this person can see. Objects they can see: ${objects.map((o) => `${o.key} (${o.label})`).join(", ") || "none"}.`)
}

const PERSON_FIELDS = new Set(Object.entries(FK_TARGET).filter(([, t]) => t === "USER").map(([k]) => k))
const isPersonField = (d: ObjectFieldDef) => d.key === "__owner" || (!!d.column && PERSON_FIELDS.has(d.column) && d.type === "select")
const PRESETS = new Set(DATE_PRESET_GROUPS.map((p) => p.value).filter((v) => v !== "custom"))

/**
 * The model's filter as the CRM's FilterState, validated against the fields the
 * person may use. Option labels are accepted for option values ("New" → "NEW"),
 * and "@me" in a person field means the person asking.
 */
function toFilterState(input: z.infer<typeof FilterInput> | undefined, defs: ObjectFieldDef[], me: Viewer): FilterState | null {
  if (!input?.conditions?.length) return null
  const byKey = new Map(defs.map((d) => [d.key, d]))
  const conditions: Condition[] = input.conditions.map((c) => {
    const def = byKey.get(c.field)
    if (!def) throw new ToolError(`Unknown or unavailable filter field "${c.field}". Use a filter_fields key from describe_object.`)
    const op = OPERATORS[def.type as FieldType]?.find((o) => o.value === c.operator)
    if (!op) throw new ToolError(`"${c.operator}" isn't valid for ${def.label} (${def.type}). Valid: ${(OPERATORS[def.type as FieldType] ?? []).map((o) => o.value).join(", ")}.`)
    let values = c.values.map((v) => v.trim())
    if (isPersonField(def)) values = values.map((v) => (v.toLowerCase() === "@me" ? me.id : v))
    if (def.type === "select" && def.options?.length) {
      values = values.map((v) => {
        const exact = def.options!.find((o) => o.value === v)
        if (exact) return v
        const byLabel = def.options!.find((o) => o.label.toLowerCase() === v.toLowerCase())
        return byLabel ? byLabel.value : v
      })
    }
    if (op.relative && !PRESETS.has(values[0] ?? "")) throw new ToolError(`"${values[0] ?? ""}" isn't a date preset. Valid: ${Array.from(PRESETS).join(", ")}.`)
    if (op.range && values.length !== 2) throw new ToolError(`${c.operator} needs [from, to].`)
    if (!op.noValue && !values.length) throw new ToolError(`${def.label} ${c.operator} needs a value.`)
    const value: string | string[] = op.noValue ? "" : op.multi || op.range ? values : values[0]
    return { id: uid("ai"), field: def.key, operator: op.value, value }
  })
  return { combinator: "AND", groups: [{ id: uid("aig"), combinator: input.match === "any" ? "OR" : "AND", conditions }] }
}

function columnOrThrow(cols: SegmentColumn[], key: string, what: string): SegmentColumn {
  const c = cols.find((x) => x.key === key)
  if (!c) throw new ToolError(`Unknown or unavailable ${what} "${key}". Use a display_fields key from describe_object.`)
  return c
}

/** The created-date column records sort by when nothing else is asked. */
function createdColumn(objectType: string): string {
  return isCustomObject(objectType) ? "createdAt" : REPORT_OBJECTS[objectType]?.createdAtField ?? "createdAt"
}

/** Report keys a column can be grouped by (the report engine's own field list). */
async function groupableKeys(objectType: string): Promise<Set<string>> {
  const keys = new Set((await reportFieldsFor(objectType)).filter((f) => !f.stageDuration).map((f) => f.key))
  for (const a of REPORT_OBJECTS[objectType]?.associations ?? []) if (a.target !== "USER") keys.add(`${a.path}.name`)
  return keys
}

async function rowsFor(objectType: string, ids: string[], cols: SegmentColumn[], cellMax: number) {
  const rows = await loadSegmentRows(objectType, ids, cols)
  return rows.map((r) => {
    const values: Record<string, string> = {}
    cols.forEach((c, i) => { if (r.cells[i]) values[c.label] = clip(r.cells[i], cellMax) })
    return { id: r.id, name: r.label, link: recordHref(objectType, r.id), values }
  })
}

// ── The tools ─────────────────────────────────────────────────────────────────

async function listObjects(me: Viewer): Promise<ToolOutcome> {
  const objects = await viewableObjects(me)
  const withCounts = await Promise.all(objects.map(async (o) => ({ ...o, records: (await countObjectMatches(o.key, null).catch(() => ({ total: 0 }))).total })))
  return {
    content: fit({ objects: withCounts.map((o) => ({ object: o.key, label: o.label, records: o.records })) }),
    status: `Looked at what you can access · ${plural(objects.length, "object")}`,
    objects: objects.map((o) => o.key),
    recordIds: [],
  }
}

async function describeObject(me: Viewer, input: z.infer<typeof Inputs.describe_object>): Promise<ToolOutcome> {
  const obj = await resolveObject(me, input.object)
  const [defs, cols, groupable] = await Promise.all([allowedFilterDefs(me, obj.key), allowedColumns(me, obj.key), groupableKeys(obj.key)])
  const opts = (o?: { value: string; label: string }[]) => {
    if (!o?.length) return undefined
    const shown = o.slice(0, LIMITS.options).map((x) => (x.value === x.label ? x.value : `${x.label} = ${x.value}`))
    return o.length > LIMITS.options ? [...shown, `…and ${o.length - LIMITS.options} more (filter on the name field instead)`] : shown
  }
  return {
    content: fit({
      object: obj.key,
      label: obj.label,
      filter_fields: defs.map((d) => ({ key: d.key, label: d.label, type: d.type, ...(isPersonField(d) ? { person: true } : {}), ...(d.options ? { options: opts(d.options) } : {}) })),
      display_fields: cols.map((c) => ({
        key: c.key, label: c.label, type: c.type,
        ...(groupable.has(c.key) ? { groupable: true } : {}),
        ...(c.options?.length ? { options: opts(c.options) } : {}),
      })),
    }),
    status: `Read the ${obj.label} fields`,
    objects: [obj.key],
    recordIds: [],
  }
}

async function findRecords(me: Viewer, input: z.infer<typeof Inputs.find_records>): Promise<ToolOutcome> {
  const obj = await resolveObject(me, input.object)
  const defs = await allowedFilterDefs(me, obj.key)
  const textFields = defs.filter((d) => d.type === "text" && !d.relationPath && !d.relationCount && d.key !== "__id").slice(0, 16)
  if (!textFields.length) throw new ToolError(`${obj.label} has no text fields to search.`)
  const words = input.text.trim().split(/\s+/).filter(Boolean).slice(0, 5)
  // Every word must match some text field: "jane doe" finds first name Jane + last name Doe.
  const state: FilterState = {
    combinator: "AND",
    groups: words.map((w) => ({ id: uid("aig"), combinator: "OR" as const, conditions: textFields.map((f) => ({ id: uid("ai"), field: f.key, operator: "contains", value: w })) })),
  }
  const res = await queryObjectIds(obj.key, state, { defs })
  const limit = clamp(input.limit, 10, LIMITS.findRows)
  const cols = (await allowedColumns(me, obj.key)).filter((c) => !c.joinPath && c.key !== "__id").slice(0, 4)
  const records = await rowsFor(obj.key, res.ids.slice(0, limit), cols, LIMITS.cell)
  return {
    content: fit({ object: obj.key, matches: res.total, showing: records.length, records }),
    status: `Searched ${obj.label} · ${plural(res.total, "match", "matches")}`,
    objects: [obj.key],
    recordIds: [],
  }
}

async function queryRecords(me: Viewer, input: z.infer<typeof Inputs.query_records>): Promise<ToolOutcome> {
  const obj = await resolveObject(me, input.object)
  const [defs, allCols] = await Promise.all([allowedFilterDefs(me, obj.key), allowedColumns(me, obj.key)])
  const state = toFilterState(input.filter, defs, me)
  const cols = input.columns?.length
    ? input.columns.map((k) => columnOrThrow(allCols, k, "column"))
    : allCols.filter((c) => !c.joinPath && c.key !== "__id").slice(0, 5)

  let orderColumn = createdColumn(obj.key)
  if (input.sort_by) {
    const d = defs.find((x) => x.key === input.sort_by)
    if (!d || !d.column || d.jsonBag || d.relationPath || d.relationCount || d.relationSome) {
      throw new ToolError(`Can't sort by "${input.sort_by}": choose a plain field from filter_fields (not a custom property or a joined field).`)
    }
    orderColumn = d.column
  }
  const orderBy = { [orderColumn]: input.sort_direction ?? "desc" }
  const limit = clamp(input.limit, 20, LIMITS.rows)
  const model = delegateFor(obj.key)
  if (!model) throw new ToolError(`${obj.label} can't be listed.`)

  const fields = toFilterFields(defs)
  const { where, explanation } = await buildObjectWhere(obj.key, state, fields)
  let total: number, exact = true, ids: string[]
  if (!explanation.untranslatable.length) {
    total = await model.count({ where })
    ids = (await model.findMany({ where, orderBy, take: limit, select: { id: true } })).map((r: any) => r.id)
  } else {
    const res = await queryObjectIds(obj.key, state, { defs })
    total = res.total; exact = res.exact
    ids = (await model.findMany({ where: { id: { in: res.ids } }, orderBy, take: limit, select: { id: true } })).map((r: any) => r.id)
  }
  const rows = await rowsFor(obj.key, ids, cols, LIMITS.cell)
  return {
    content: fit({ object: obj.key, filter: describeFilter(state, defs), total, ...(exact ? {} : { total_is_at_least: true }), showing: rows.length, rows }),
    status: `Listed ${obj.label} · ${plural(total, "match", "matches")}`,
    objects: [obj.key, ...cols.filter((c) => c.joinPath).map((c) => RELATION_TARGET[c.joinPath!]).filter((t) => t && t !== "USER")],
    recordIds: [],
  }
}

async function aggregate(me: Viewer, input: z.infer<typeof Inputs.aggregate>): Promise<ToolOutcome> {
  const obj = await resolveObject(me, input.object)
  const [defs, cols, groupable] = await Promise.all([allowedFilterDefs(me, obj.key), allowedColumns(me, obj.key), groupableKeys(obj.key)])
  const state = toFilterState(input.filter, defs, me)
  const summary = describeFilter(state, defs)

  // A plain count is exact at any size.
  if (input.measure === "count" && !input.group_by && !input.breakdown_by) {
    const r = await countObjectMatches(obj.key, state, { defs })
    return {
      content: fit({ object: obj.key, filter: summary, count: r.total, ...(r.exact ? {} : { count_is_at_least: true }) }),
      status: `Counted ${obj.label} · ${r.total.toLocaleString("en-US")}`,
      objects: [obj.key],
      recordIds: [],
    }
  }

  const groupCol = (key: string | undefined, what: string) => {
    if (!key) return null
    const c = columnOrThrow(cols, key, what)
    if (!groupable.has(c.key)) throw new ToolError(`"${c.label}" can't be grouped. Choose a display_fields key marked groupable.`)
    return c
  }
  const g = groupCol(input.group_by, "group_by field")
  const b = groupCol(input.breakdown_by, "breakdown field")
  if (input.date_bucket && g?.type !== "date") throw new ToolError("date_bucket needs group_by to be a date field.")
  let mField: SegmentColumn | null = null
  if (input.measure !== "count") {
    if (!input.measure_field) throw new ToolError(`${input.measure} needs measure_field (a number field).`)
    mField = columnOrThrow(cols, input.measure_field, "measure field")
    if (mField.type !== "number" || mField.joinPath) throw new ToolError(`"${mField.label}" isn't a number field of ${obj.label}.`)
  }

  // The same matching set as query_records (lib/object-query), handed to the
  // report engine — so a count by month adds up to the count of the list.
  const ids = state ? (await queryObjectIds(obj.key, state, { defs })).ids : null
  const toRef = (c: SegmentColumn) => ({ source: c.joinPath && RELATION_TARGET[c.joinPath] !== "USER" ? c.joinPath : obj.key, key: c.key })
  const sources = [g, b].filter((c): c is SegmentColumn => !!c?.joinPath && RELATION_TARGET[c.joinPath!] !== "USER")
    .map((c) => ({ objectKey: RELATION_TARGET[c.joinPath!], joinPath: c.joinPath! }))
  const limit = clamp(input.limit, 25, LIMITS.groups)

  const result = await runReport({
    primary: obj.key,
    sources: sources.filter((s, i) => sources.findIndex((x) => x.joinPath === s.joinPath) === i),
    viz: "table",
    tableMode: "summarized",
    columns: [],
    measures: [{ source: obj.key, key: mField ? mField.key : "*", agg: input.measure }],
    dimensions: g ? [{ ...toRef(g), ...(input.date_bucket ? { dateFrequency: input.date_bucket } : {}) }] : [],
    breakdown: b ? toRef(b) : null,
    filters: null,
    recordIds: ids,
    rowCap: LIMITS.aggregateRows,
    sort: { by: "value", dir: "desc" },
    limit,
  })
  const header = result.columns.map((c) => c.label)
  const groups = result.rows.map((r) => Object.fromEntries(r.map((v, i) => [header[i] ?? `col${i}`, v])))
  return {
    content: fit({
      object: obj.key, filter: summary,
      measure: input.measure === "count" ? "count" : `${input.measure} of ${mField!.label}`,
      records_included: result.total,
      ...(result.capped ? { note: `Based on the first ${LIMITS.aggregateRows.toLocaleString("en-US")} matching records only — narrow the filter for a complete answer.` } : {}),
      groups,
    }),
    status: `Summarized ${obj.label}${g ? ` by ${g.label}` : ""} · ${plural(result.total, "record")}`,
    objects: [obj.key, ...sources.map((s) => s.objectKey)],
    recordIds: [],
  }
}

async function getRecord(me: Viewer, input: z.infer<typeof Inputs.get_record>): Promise<ToolOutcome> {
  const obj = await resolveObject(me, input.object)
  const model = delegateFor(obj.key)
  if (!model) throw new ToolError(`${obj.label} records can't be opened.`)
  const scope = isCustomObject(obj.key)
    ? { objectDef: { key: obj.key.slice(3) } }
    : {}
  const exists = await model.findFirst({ where: { id: input.id, ...scope }, select: { id: true } }).catch(() => null)
  if (!exists) throw new ToolError(`No ${obj.label} record with id ${input.id}.`)

  const cols = (await allowedColumns(me, obj.key)).filter((c) => c.key !== "__id")
  const [row] = await loadSegmentRows(obj.key, [input.id], cols)
  const fields: Record<string, string> = {}
  cols.forEach((c, i) => { if (row?.cells[i]) fields[c.label] = clip(row.cells[i], LIMITS.recordCell) })

  // Linked records — only of objects this person can View.
  const links = await prisma.objectAssociation.findMany({
    where: { OR: [{ fromType: obj.key, fromId: input.id }, { toType: obj.key, toId: input.id }] },
    take: 200,
  })
  const linked: { object: string; name: string; link: string | null }[] = []
  const seenObjects = new Set<string>()
  for (const l of links) {
    const [type, id] = l.fromType === obj.key && l.fromId === input.id ? [l.toType, l.toId] : [l.fromType, l.fromId]
    if (type === "EMAIL" || type === "TASK" || type === "ACTIVITY") continue // engagements: the timeline below
    if (!canViewObject(me, type) || linked.length >= LIMITS.associations) continue
    seenObjects.add(type)
    linked.push({ object: type, name: await recordLabel(type, id).catch(() => id), link: recordHref(type, id) })
  }

  // Timeline: notes (this record's View is enough), tasks (Tasks View),
  // activities (Activities View). Email and SMS bodies are left out.
  const timeline: { kind: string; date: string; by: string | null; title: string; body: string }[] = []
  const notes = await prisma.recordNote.findMany({
    where: { recordType: obj.key, recordId: input.id }, orderBy: { createdAt: "desc" }, take: LIMITS.timeline,
    include: { createdBy: { select: { name: true, email: true } } },
  })
  for (const n of notes) timeline.push({ kind: n.kind, date: (n.occurredAt ?? n.createdAt).toISOString(), by: n.createdBy?.name ?? n.createdBy?.email ?? null, title: n.title ?? n.kind.toLowerCase(), body: clip(n.body, LIMITS.timelineBody) })
  if (obj.key === "PROVIDER") {
    const pn = await prisma.providerNote.findMany({ where: { providerId: input.id }, orderBy: { createdAt: "desc" }, take: LIMITS.timeline, include: { createdBy: { select: { name: true, email: true } } } })
    for (const n of pn) timeline.push({ kind: "NOTE", date: n.createdAt.toISOString(), by: n.createdBy?.name ?? n.createdBy?.email ?? null, title: "note", body: clip(n.content, LIMITS.timelineBody) })
  }
  const linkedIds = (kind: string) => links.map((l) => (l.fromType === obj.key && l.fromId === input.id && l.toType === kind ? l.toId : l.toType === obj.key && l.toId === input.id && l.fromType === kind ? l.fromId : null)).filter((x): x is string => !!x)
  if (canViewObject(me, "TASK")) {
    const taskWhere = obj.key === "REFERRAL" ? { OR: [{ referralId: input.id }, { id: { in: linkedIds("TASK") } }] } : { id: { in: linkedIds("TASK") } }
    const tasks = await prisma.task.findMany({ where: taskWhere, orderBy: { createdAt: "desc" }, take: LIMITS.timeline, include: { assignedTo: { select: { name: true, email: true } } } })
    for (const t of tasks) timeline.push({ kind: "TASK", date: t.createdAt.toISOString(), by: t.assignedTo?.name ?? t.assignedTo?.email ?? null, title: clip(t.title, 200), body: [`status ${t.status}`, t.dueDate ? `due ${t.dueDate.toISOString().slice(0, 10)}` : ""].filter(Boolean).join(", ") })
  }
  if (canViewObject(me, "ACTIVITY")) {
    const native = obj.key === "PROVIDER" ? { providers: { some: { doctorId: input.id } } } : obj.key === "PRACTICE" ? { practiceId: input.id } : obj.key === "LOCATION" ? { locationId: input.id } : null
    const ids = linkedIds("ACTIVITY")
    const where = native && ids.length ? { OR: [native, { id: { in: ids } }] } : native ?? (ids.length ? { id: { in: ids } } : null)
    if (where) {
      const acts = await prisma.activity.findMany({ where: where as any, orderBy: { date: "desc" }, take: LIMITS.timeline, include: { createdBy: { select: { name: true, email: true } } } })
      for (const a of acts) timeline.push({ kind: "ACTIVITY", date: a.date.toISOString(), by: a.createdBy?.name ?? a.createdBy?.email ?? null, title: a.flyer ?? "activity", body: clip([a.nextStep ? `next step: ${a.nextStep}` : "", a.notes ?? ""].filter(Boolean).join(" — "), LIMITS.timelineBody) })
    }
  }
  timeline.sort((a, b) => b.date.localeCompare(a.date))

  return {
    content: fit({ object: obj.key, id: input.id, name: row?.label ?? input.id, link: recordHref(obj.key, input.id), fields, linked_records: linked, timeline: timeline.slice(0, LIMITS.timeline) }),
    status: `Opened a ${obj.label} record`,
    objects: [obj.key, ...Array.from(seenObjects)],
    recordIds: [`${obj.key}:${input.id}`],
  }
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

const STATUS_FAILED = "Couldn't complete a lookup"

/** Run one tool call for `me`. Never throws: problems come back as is_error results. */
export async function runTool(name: string, rawInput: unknown, me: Viewer): Promise<ToolOutcome> {
  const schema = (Inputs as Record<string, z.ZodTypeAny>)[name]
  if (!schema) return { content: `Unknown tool "${name}".`, isError: true, status: STATUS_FAILED, objects: [], recordIds: [] }
  const parsed = schema.safeParse(rawInput ?? {})
  if (!parsed.success) {
    // Paths only — zod's messages echo the values it rejected.
    const where = parsed.error.issues.map((i) => i.path.join(".") || "(input)").join(", ")
    return { content: `Invalid input for ${name} at: ${where}. Check the tool's parameters and try again.`, isError: true, status: STATUS_FAILED, objects: [], recordIds: [] }
  }
  try {
    switch (name as ToolName) {
      case "list_objects": return await listObjects(me)
      case "describe_object": return await describeObject(me, parsed.data)
      case "find_records": return await findRecords(me, parsed.data)
      case "query_records": return await queryRecords(me, parsed.data)
      case "aggregate": return await aggregate(me, parsed.data)
      case "get_record": return await getRecord(me, parsed.data)
    }
  } catch (e) {
    if (e instanceof ToolError) return { content: e.message, isError: true, status: STATUS_FAILED, objects: [], recordIds: [] }
    // Database errors echo their arguments (PHI) — never pass them on.
    return { content: `${name} failed on the server. Try a simpler question.`, isError: true, status: STATUS_FAILED, objects: [], recordIds: [] }
  }
  return { content: `Unknown tool "${name}".`, isError: true, status: STATUS_FAILED, objects: [], recordIds: [] }
}
