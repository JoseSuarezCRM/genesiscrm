// ─── Advanced filter engine ──────────────────────────────────────────────────
// A generic, type-aware filter model shared by every object list (HubSpot/Airtable
// style). A list passes a schema of FilterField[] (one per column/property, custom
// properties included) and an in-memory FilterState; `matchesFilter` evaluates a row.
//
// Structure: a FilterState is a set of groups joined by an outer combinator (AND/OR).
// Each group holds conditions joined by the group's own combinator. This gives the
// "groups with AND/OR logic" the product needs without a full query language.

import { resolvePreset } from "./reporting/date-presets"
import { dayStart } from "./tz"

export type FieldType = "text" | "number" | "select" | "boolean" | "date"

export interface FilterFieldOption { label: string; value: string }

export interface FilterField {
  key: string
  label: string
  type: FieldType
  options?: FilterFieldOption[] // for `select`
  // Pulls the comparable value out of a record. Return string | number | boolean |
  // Date | null. For `select` return the option `value`.
  getValue: (row: any) => unknown
  // Optional DB column name — set when the filter is evaluated server-side by
  // translating the FilterState into a Prisma `where` (see lib/filter-to-prisma).
  column?: string
  // When the value lives inside a JSON bag (custom properties), this is the bag's
  // column and `column` is the key within it.
  jsonBag?: string
  // For a many-to-many relation (e.g. tags): server-side translation maps the
  // `select` operators to Prisma `{ [relation]: { some|none: { [key]: { in } } } }`.
  relationSome?: { relation: string; key: string }
  // Set for a joined single-FK field: the Prisma relation to nest the condition
  // under (e.g. "referringPractice"). See lib/filter-to-prisma conditionToWhere.
  relationPath?: string
  /**
   * A count of related rows. Carried so the SQL translator can recognise it and
   * lib/object-query can refine it in memory — Prisma's `where` offers only
   * some/none/every, so "more than 5 referrals" has no SQL form.
   */
  relationCount?: { relation: string }
  /**
   * For a `relationPath` field: can the related row be absent? Distinct from
   * `nullable`, which describes the joined COLUMN — a location's practice name
   * is a required column on an optional relation, and the two need opposite
   * treatment. An activity with no practice reads as blank in memory, so
   * "practice doesn't contain X" is true for it, while a Prisma relation filter
   * drops it.
   */
  relationNullable?: boolean
  /**
   * Is the underlying column nullable? Populated from Prisma's DMMF by
   * lib/object-fields-server, never by hand.
   *
   * Postgres `NOT (x ILIKE …)` yields `unknown` for a NULL x and drops the row,
   * while the in-memory evaluator reads null as "" and keeps it — measured on
   * Referral.patientEmail as 8,566 rows silently disappearing. filter-to-prisma
   * compensates, but only where it's allowed to: Prisma REJECTS `{ col: null }`
   * on a non-nullable column, so the compensation has to know which is which.
   */
  nullable?: boolean
  /**
   * For a date field: is the column a CALENDAR value or a real instant?
   *
   * A DATE column (date of birth, referral date) stores its value at UTC
   * midnight and means the same day everywhere. A DATETIME column (created at,
   * surgery date) is an instant, and which day it belongs to is a clinic
   * question — a referral created at 8pm Chicago is that day's, not tomorrow's.
   * Anchoring both to the host timezone made "created between Aug 30 and Aug 30"
   * mean a UTC day on Vercel while the record card showed a Chicago one.
   *
   * TRI-STATE, like `nullable`: `undefined` means the older per-list field
   * builders didn't say, and those keep their existing behaviour untouched.
   */
  dateOnly?: boolean
}

export interface Operator {
  value: string
  label: string
  noValue?: boolean // operator takes no operand (is known / is unknown / is true …)
  multi?: boolean   // operand is a list (is any of / is none of)
  range?: boolean   // operand is a [from, to] pair (is between)
  relative?: boolean // operand is a relative date preset key (is in the last …)
}

export const OPERATORS: Record<FieldType, Operator[]> = {
  text: [
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "doesn't contain" },
    { value: "is", label: "is exactly" },
    { value: "is_not", label: "is not" },
    { value: "starts_with", label: "starts with" },
    { value: "ends_with", label: "ends with" },
    { value: "is_known", label: "is known", noValue: true },
    { value: "is_unknown", label: "is unknown", noValue: true },
  ],
  number: [
    { value: "eq", label: "is equal to" },
    { value: "neq", label: "is not equal to" },
    { value: "gt", label: "is greater than" },
    { value: "gte", label: "is greater or equal" },
    { value: "lt", label: "is less than" },
    { value: "lte", label: "is less or equal" },
    { value: "is_known", label: "is known", noValue: true },
    { value: "is_unknown", label: "is unknown", noValue: true },
  ],
  select: [
    { value: "is_any_of", label: "is any of", multi: true },
    { value: "is_none_of", label: "is none of", multi: true },
    { value: "is_known", label: "is known", noValue: true },
    { value: "is_unknown", label: "is unknown", noValue: true },
  ],
  boolean: [
    { value: "is_true", label: "is true", noValue: true },
    { value: "is_false", label: "is false", noValue: true },
  ],
  date: [
    { value: "on", label: "is on" },
    { value: "between", label: "is between", range: true },
    { value: "not_between", label: "is not between", range: true },
    { value: "relative", label: "is in the range", relative: true },
    { value: "after", label: "is after" },
    { value: "on_or_after", label: "is on or after" },
    { value: "before", label: "is before" },
    { value: "on_or_before", label: "is on or before" },
    { value: "is_known", label: "is known", noValue: true },
    { value: "is_unknown", label: "is unknown", noValue: true },
  ],
}

export type Combinator = "AND" | "OR"

export interface Condition {
  id: string
  field: string
  operator: string
  value: string | string[]
}

export interface FilterGroup {
  id: string
  combinator: Combinator
  conditions: Condition[]
  /**
   * Exclude: negate the whole group ("NOT (a AND b)").
   *
   * Optional so every FilterState already stored in CustomObjectView / TaskView /
   * ReferralView / SurgeryView / SavedReport stays valid and reads as false.
   * An unhandled `not` does not throw — it silently returns the UN-negated set,
   * i.e. it over-includes — so every evaluator of a group must honour it.
   */
  not?: boolean
}

export interface FilterState {
  combinator: Combinator
  groups: FilterGroup[]
}

let _uid = 0
export function uid(prefix = "f"): string {
  _uid += 1
  return `${prefix}${_uid}`
}

export function emptyCondition(field = ""): Condition {
  return { id: uid("c"), field, operator: "", value: "" }
}

export function emptyGroup(): FilterGroup {
  return { id: uid("g"), combinator: "AND", conditions: [emptyCondition()] }
}

export function emptyFilter(): FilterState {
  return { combinator: "AND", groups: [emptyGroup()] }
}

function isBlank(v: unknown): boolean {
  return (
    v === null ||
    v === undefined ||
    v === "" ||
    (Array.isArray(v) && v.length === 0)
  )
}

function defaultOperator(field: FilterField): string {
  return OPERATORS[field.type][0]?.value ?? ""
}

export { defaultOperator }

// A condition counts as "active" once it has a field + operator (and, for operators
// that take an operand, a non-empty value).
export function isConditionActive(cond: Condition, fields: FilterField[]): boolean {
  const field = fields.find((f) => f.key === cond.field)
  if (!field || !cond.operator) return false
  const op = OPERATORS[field.type].find((o) => o.value === cond.operator)
  if (!op) return false
  if (op.noValue) return true
  if (op.range) { const a = Array.isArray(cond.value) ? cond.value : []; return !isBlank(a[0]) && !isBlank(a[1]) }
  return !isBlank(cond.value)
}

export function activeConditionCount(state: FilterState, fields: FilterField[]): number {
  return state.groups.reduce(
    (n, g) => n + g.conditions.filter((c) => isConditionActive(c, fields)).length,
    0,
  )
}

// ── Calendar days ────────────────────────────────────────────────────────────
// A DATE custom property stores a calendar day as a STRING — "2026-08-24" from a
// date picker, "08/24/2026" from a spreadsheet import (appointments' Visit Date
// holds 11,267 of the latter and 1,292 of the former). Reading one with
// `new Date()` turns it into an instant and then re-reads the day in the host's
// timezone: `new Date("2026-08-24T00:00:00.000Z").getDate()` is 23 in Chicago and
// 24 on a UTC host, so the same filter answered differently in dev and on Vercel.
//
// So string dates are compared as calendar days, with no timezone in the path.
// Real Date values (native DateTime columns) keep their instant semantics.
function dayFromParts(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d)
}
function dayOf(v: unknown): number {
  // Host-local parts on purpose: the only Dates reaching here are relative-preset
  // window bounds from resolvePreset, which are themselves built in host time,
  // and json-predicate formats those same bounds the same way. Reading them in a
  // different zone than they were built in is what makes the two sides disagree.
  if (v instanceof Date) return dayFromParts(v.getFullYear(), v.getMonth() + 1, v.getDate())
  const s = String(v ?? "")
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (iso) return dayFromParts(+iso[1], +iso[2], +iso[3])
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (us) return dayFromParts(+us[3], +us[1], +us[2])
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? NaN : dayFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

function evalCalendarDate(raw: unknown, cond: Condition): boolean {
  const a = dayOf(raw)
  if (Number.isNaN(a)) return false
  if (cond.operator === "between" || cond.operator === "not_between") {
    const arr = Array.isArray(cond.value) ? cond.value : []
    const from = arr[0] ? dayOf(arr[0]) : NaN
    const to = arr[1] ? dayOf(arr[1]) : NaN
    if (Number.isNaN(from) || Number.isNaN(to)) return true
    const inside = a >= from && a <= to
    return cond.operator === "between" ? inside : !inside
  }
  if (cond.operator === "relative") {
    const win = resolvePreset(String(cond.value || ""))
    if (!win) return true
    return a >= dayOf(win.start) && a <= dayOf(win.end)
  }
  const b = cond.value ? dayOf(cond.value) : NaN
  if (Number.isNaN(b)) return true
  switch (cond.operator) {
    case "on": return a === b
    case "after": return a > b
    case "on_or_after": return a >= b
    case "before": return a < b
    case "on_or_before": return a <= b
  }
  return true
}


/**
 * Date comparison against explicit day boundaries.
 *
 * Deliberately compares the value's instant against the same boundary instants
 * that filter-to-prisma puts in the `where`, rather than comparing calendar
 * numbers — that way the two evaluators agree by construction instead of by
 * two implementations happening to round the same way.
 */
function evalBoundedDate(a: number, cond: Condition, dateOnly: boolean): boolean {
  const S = (v: unknown, off = 0) => {
    const d = dayStart(String(v ?? ""), dateOnly, off)
    return d ? d.getTime() : NaN
  }
  if (cond.operator === "between" || cond.operator === "not_between") {
    const arr = Array.isArray(cond.value) ? cond.value : []
    const from = S(arr[0]), to = S(arr[1], 1)
    if (Number.isNaN(from) || Number.isNaN(to)) return true
    const inside = a >= from && a < to
    return cond.operator === "between" ? inside : !inside
  }
  if (cond.operator === "relative") {
    const win = resolvePreset(String(cond.value || ""))
    if (!win) return true
    return a >= win.start.getTime() && a <= win.end.getTime()
  }
  const start = S(cond.value), next = S(cond.value, 1)
  if (Number.isNaN(start)) return true
  switch (cond.operator) {
    case "on": return a >= start && a < next
    case "after": return a >= next
    case "on_or_after": return a >= start
    case "before": return a < start
    case "on_or_before": return a < next
  }
  return true
}

function evalCondition(row: any, cond: Condition, fields: FilterField[]): boolean {
  const field = fields.find((f) => f.key === cond.field)
  if (!field) return true
  const raw = field.getValue(row)

  if (cond.operator === "is_known") return !isBlank(raw)
  if (cond.operator === "is_unknown") return isBlank(raw)

  switch (field.type) {
    case "text": {
      const a = String(raw ?? "").toLowerCase()
      const b = String(cond.value ?? "").toLowerCase()
      switch (cond.operator) {
        case "contains": return a.includes(b)
        case "not_contains": return !a.includes(b)
        case "is": return a === b
        case "is_not": return a !== b
        case "starts_with": return a.startsWith(b)
        case "ends_with": return a.endsWith(b)
      }
      return true
    }
    case "number": {
      // Not `Number(raw)`: Number(null) is 0, which made an empty numeric column
      // compare equal to zero and satisfy "is less than 5". Blank means absent,
      // and absent matches no numeric comparison — which is also what SQL does,
      // so the two evaluators agree without the where needing to compensate.
      const a = isBlank(raw) ? NaN : Number(raw)
      const b = Number(cond.value)
      if (Number.isNaN(b)) return true
      if (Number.isNaN(a)) return false
      switch (cond.operator) {
        case "eq": return a === b
        case "neq": return a !== b
        case "gt": return a > b
        case "gte": return a >= b
        case "lt": return a < b
        case "lte": return a <= b
      }
      return true
    }
    case "select": {
      const vals = Array.isArray(cond.value) ? cond.value : cond.value ? [cond.value] : []
      if (vals.length === 0) return true
      // The record's value may be a single value or an array (e.g. a multi-select
      // custom property), so compare the operand against every value it holds.
      const rawArr = Array.isArray(raw) ? raw.map((x) => String(x)) : [String(raw ?? "")]
      switch (cond.operator) {
        case "is_any_of": return rawArr.some((a) => vals.includes(a))
        case "is_none_of": return !rawArr.some((a) => vals.includes(a))
      }
      return true
    }
    case "boolean": {
      switch (cond.operator) {
        case "is_true": return raw === true
        case "is_false": return raw === false || isBlank(raw)
      }
      return true
    }
    case "date": {
      // A string value is a stored calendar day; a Date is a real instant.
      if (typeof raw === "string" && raw) return evalCalendarDate(raw, cond)
      const a = raw ? new Date(raw as any).getTime() : NaN
      if (Number.isNaN(a)) return false
      if (field.dateOnly !== undefined) return evalBoundedDate(a, cond, field.dateOnly)
      if (cond.operator === "between" || cond.operator === "not_between") {
        const arr = Array.isArray(cond.value) ? cond.value : []
        const from = arr[0] ? new Date(arr[0]).getTime() : NaN
        const to = arr[1] ? new Date(String(arr[1]) + "T23:59:59").getTime() : NaN
        if (Number.isNaN(from) || Number.isNaN(to)) return true
        const inside = a >= from && a <= to
        return cond.operator === "between" ? inside : !inside
      }
      if (cond.operator === "relative") {
        const win = resolvePreset(String(cond.value || ""))
        if (!win) return true
        return a >= win.start.getTime() && a <= win.end.getTime()
      }
      const b = cond.value ? new Date(cond.value as string).getTime() : NaN
      if (Number.isNaN(b)) return true
      switch (cond.operator) {
        case "after": return a > b
        case "on_or_after": return a >= b
        case "before": return a < b
        case "on_or_before": return a <= b
        case "on": {
          const da = new Date(a), db = new Date(b)
          return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
        }
      }
      return true
    }
  }
  return true
}

function evalGroup(row: any, group: FilterGroup, fields: FilterField[]): boolean {
  const active = group.conditions.filter((c) => isConditionActive(c, fields))
  // An empty group matches everything. Negating that would return false and blank
  // the list the moment someone ticks Exclude on a group they haven't filled in
  // yet, so `not` only applies once there's something to exclude.
  if (active.length === 0) return true
  const hit = group.combinator === "OR"
    ? active.some((c) => evalCondition(row, c, fields))
    : active.every((c) => evalCondition(row, c, fields))
  return group.not ? !hit : hit
}

export function matchesFilter(row: any, state: FilterState, fields: FilterField[]): boolean {
  const active = state.groups.filter((g) => g.conditions.some((c) => isConditionActive(c, fields)))
  if (active.length === 0) return true
  return state.combinator === "OR"
    ? active.some((g) => evalGroup(row, g, fields))
    : active.every((g) => evalGroup(row, g, fields))
}

// ── Custom properties → filter fields ────────────────────────────────────────
// Turn an entity's custom-property definitions into FilterFields so any new
// property automatically becomes a filter criterion (per the standard-list rule).
// Values are read from a JSON bag on the row (default `customProperties`), keyed
// by the property id.
export interface CustomPropDef { id: string; name: string; type: string; options?: string[]; numberFormat?: string | null }

const CP_TYPE_TO_FIELD: Record<string, FieldType> = {
  TEXT: "text", LONG_TEXT: "text", EMAIL: "text", PHONE: "text", URL: "text",
  // DATE_TIME was missing and fell through to "text", so a date-and-time
  // property offered "contains" / "starts with" instead of date operators.
  NUMBER: "number", DATE: "date", DATE_TIME: "date", CHECKBOX: "boolean",
  DROPDOWN: "select", MULTI_SELECT: "select",
}

export function customPropertyFilterFields(defs: CustomPropDef[], bagKey = "customProperties"): FilterField[] {
  return defs.map((d) => {
    const type = CP_TYPE_TO_FIELD[d.type] ?? "text"
    return {
      key: `cp_${d.id}`,
      label: d.name,
      type,
      options: type === "select" ? (d.options ?? []).map((o) => ({ label: o, value: o })) : undefined,
      getValue: (row: any) => row?.[bagKey]?.[d.id],
      // Lets server-paginated lists (e.g. surgery) translate this into a Prisma
      // JSON-path filter; in-memory lists just use getValue and ignore these.
      column: d.id,
      jsonBag: bagKey,
    }
  })
}

// The filter travels in the URL as a JSON string param. Parse it defensively.
export function decodeFilterParam(param: string | null | undefined): FilterState | null {
  if (!param) return null
  try {
    const obj = JSON.parse(param)
    if (obj && Array.isArray(obj.groups) && typeof obj.combinator === "string") return obj as FilterState
    return null
  } catch {
    return null
  }
}
