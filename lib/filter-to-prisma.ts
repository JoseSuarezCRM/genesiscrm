// Translate an advanced FilterState (the same model the client FilterBuilder
// produces) into a Prisma `where` object, so a server-paginated list (e.g.
// surgery) can use the identical filter UI and have it compose with pagination,
// sorting, and CSV export. Only fields that carry a `column` are translated.

import { Prisma } from "@prisma/client"
import { FilterState, FilterField, FilterGroup, Condition } from "./filters"

// Custom properties live in a JSON bag, so they translate to Prisma JSON-path
// filters rather than plain column filters. Postgres compares the stored JSON
// value, so string operators are exact-case; numeric/date operators aren't
// supported on the bag and fall through as "no condition".
function jsonConditionToWhere(cond: Condition, field: FilterField): Record<string, unknown> | null {
  const bag = field.jsonBag!
  const path = [field.column!]
  const op = cond.operator
  const v = cond.value
  const at = (filter: Record<string, unknown>) => ({ [bag]: { path, ...filter } })

  if (op === "is_known") return { NOT: at({ equals: Prisma.DbNull }) }
  if (op === "is_unknown") return at({ equals: Prisma.DbNull })

  if (field.type === "select") {
    const arr = (Array.isArray(v) ? v : v ? [v] : []).map(String)
    if (arr.length === 0) return null
    const anyOf = { OR: arr.map((s) => at({ equals: s })) }
    if (op === "is_any_of") return anyOf
    if (op === "is_none_of") return { NOT: anyOf }
    return null
  }

  if (field.type === "boolean") {
    if (op === "is_true") return at({ equals: true })
    if (op === "is_false") return at({ equals: false })
    return null
  }

  const s = String(v ?? "")
  if (!s) return null
  switch (op) {
    case "contains": return at({ string_contains: s })
    case "not_contains": return { NOT: at({ string_contains: s }) }
    case "is": return at({ equals: s })
    case "is_not": return { NOT: at({ equals: s }) }
    case "starts_with": return at({ string_starts_with: s })
    case "ends_with": return at({ string_ends_with: s })
  }
  return null
}

// Wraps the scalar/json/relation condition; for a joined field (relationPath set,
// e.g. "referringPractice") nests it as `{ referringPractice: <where> }` so a
// single-FK relation can be filtered (Prisma relation `is`).
function conditionToWhere(cond: Condition, field: FilterField): Record<string, unknown> | null {
  const w = scalarConditionToWhere(cond, field)
  if (w && field.relationPath) return { [field.relationPath]: w }
  return w
}

function scalarConditionToWhere(cond: Condition, field: FilterField): Record<string, unknown> | null {
  const col = field.column
  if (!col) return null
  if (field.jsonBag) return jsonConditionToWhere(cond, field)
  const op = cond.operator
  const v = cond.value

  // Many-to-many relation (e.g. tags): map the `select` operators to some/none.
  if (field.relationSome) {
    const { relation, key } = field.relationSome
    if (op === "is_known") return { [relation]: { some: {} } }
    if (op === "is_unknown") return { [relation]: { none: {} } }
    const arr = Array.isArray(v) ? v : v ? [v] : []
    if (arr.length === 0) return null
    if (op === "is_any_of") return { [relation]: { some: { [key]: { in: arr } } } }
    if (op === "is_none_of") return { [relation]: { none: { [key]: { in: arr } } } }
    return null
  }

  if (op === "is_known") {
    return field.type === "text"
      ? { AND: [{ [col]: { not: null } }, { [col]: { not: "" } }] }
      : { [col]: { not: null } }
  }
  if (op === "is_unknown") {
    return field.type === "text"
      ? { OR: [{ [col]: null }, { [col]: "" }] }
      : { [col]: null }
  }

  switch (field.type) {
    case "text": {
      const s = String(v ?? "")
      if (!s) return null
      switch (op) {
        case "contains": return { [col]: { contains: s, mode: "insensitive" } }
        case "not_contains": return { NOT: { [col]: { contains: s, mode: "insensitive" } } }
        case "is": return { [col]: { equals: s, mode: "insensitive" } }
        case "is_not": return { NOT: { [col]: { equals: s, mode: "insensitive" } } }
        case "starts_with": return { [col]: { startsWith: s, mode: "insensitive" } }
        case "ends_with": return { [col]: { endsWith: s, mode: "insensitive" } }
      }
      return null
    }
    case "number": {
      const n = Number(v)
      if (Number.isNaN(n)) return null
      switch (op) {
        case "eq": return { [col]: n }
        case "neq": return { NOT: { [col]: n } }
        case "gt": return { [col]: { gt: n } }
        case "gte": return { [col]: { gte: n } }
        case "lt": return { [col]: { lt: n } }
        case "lte": return { [col]: { lte: n } }
      }
      return null
    }
    case "select": {
      const arr = Array.isArray(v) ? v : v ? [v] : []
      if (arr.length === 0) return null
      switch (op) {
        case "is_any_of": return { [col]: { in: arr } }
        case "is_none_of": return { [col]: { notIn: arr } }
      }
      return null
    }
    case "boolean": {
      if (op === "is_true") return { [col]: true }
      if (op === "is_false") return { [col]: false }
      return null
    }
    case "date": {
      const s = String(v ?? "")
      if (!s) return null
      const d = new Date(s)
      if (Number.isNaN(d.getTime())) return null
      switch (op) {
        case "after": return { [col]: { gt: d } }
        case "on_or_after": return { [col]: { gte: d } }
        case "before": return { [col]: { lt: d } }
        case "on_or_before": return { [col]: { lte: d } }
        case "on": {
          const start = new Date(d); start.setHours(0, 0, 0, 0)
          const end = new Date(start); end.setDate(end.getDate() + 1)
          return { [col]: { gte: start, lt: end } }
        }
      }
      return null
    }
  }
  return null
}

function groupToWhere(group: FilterGroup, byKey: Record<string, FilterField>): Record<string, unknown> | null {
  const parts = group.conditions
    .map((c) => { const f = byKey[c.field]; return f ? conditionToWhere(c, f) : null })
    .filter((x): x is Record<string, unknown> => x !== null)
  if (parts.length === 0) return null
  return group.combinator === "OR" ? { OR: parts } : { AND: parts }
}

// Returns a Prisma `where` fragment (or {} when there are no active conditions).
export function filterStateToWhere(state: FilterState | null | undefined, fields: FilterField[]): Record<string, unknown> {
  if (!state) return {}
  const byKey: Record<string, FilterField> = Object.fromEntries(fields.map((f) => [f.key, f]))
  const groups = state.groups
    .map((g) => groupToWhere(g, byKey))
    .filter((x): x is Record<string, unknown> => x !== null)
  if (groups.length === 0) return {}
  return state.combinator === "OR" ? { OR: groups } : { AND: groups }
}

// decodeFilterParam lives in lib/filters (pure) so client components can parse
// the URL param without importing the Prisma client.
export { decodeFilterParam } from "./filters"
