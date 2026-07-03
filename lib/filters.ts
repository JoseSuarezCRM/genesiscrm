// ─── Advanced filter engine ──────────────────────────────────────────────────
// A generic, type-aware filter model shared by every object list (HubSpot/Airtable
// style). A list passes a schema of FilterField[] (one per column/property, custom
// properties included) and an in-memory FilterState; `matchesFilter` evaluates a row.
//
// Structure: a FilterState is a set of groups joined by an outer combinator (AND/OR).
// Each group holds conditions joined by the group's own combinator. This gives the
// "groups with AND/OR logic" the product needs without a full query language.

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
}

export interface Operator {
  value: string
  label: string
  noValue?: boolean // operator takes no operand (is known / is unknown / is true …)
  multi?: boolean   // operand is a list (is any of / is none of)
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
    { value: "after", label: "is after" },
    { value: "before", label: "is before" },
    { value: "on", label: "is on" },
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
  return !isBlank(cond.value)
}

export function activeConditionCount(state: FilterState, fields: FilterField[]): number {
  return state.groups.reduce(
    (n, g) => n + g.conditions.filter((c) => isConditionActive(c, fields)).length,
    0,
  )
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
      const a = Number(raw)
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
      const a = raw ? new Date(raw as any).getTime() : NaN
      const b = cond.value ? new Date(cond.value as string).getTime() : NaN
      if (Number.isNaN(b)) return true
      if (Number.isNaN(a)) return false
      switch (cond.operator) {
        case "after": return a > b
        case "before": return a < b
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
  if (active.length === 0) return true
  return group.combinator === "OR"
    ? active.some((c) => evalCondition(row, c, fields))
    : active.every((c) => evalCondition(row, c, fields))
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
export interface CustomPropDef { id: string; name: string; type: string; options?: string[] }

const CP_TYPE_TO_FIELD: Record<string, FieldType> = {
  TEXT: "text", LONG_TEXT: "text", EMAIL: "text", PHONE: "text", URL: "text",
  NUMBER: "number", DATE: "date", CHECKBOX: "boolean",
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
    }
  })
}
