// Translate an advanced FilterState (the same model the client FilterBuilder
// produces) into a Prisma `where` object, so a server-paginated list (e.g.
// surgery) can use the identical filter UI and have it compose with pagination,
// sorting, and CSV export. Only fields that carry a `column` are translated.

import { FilterState, FilterField, FilterGroup, Condition } from "./filters"

function conditionToWhere(cond: Condition, field: FilterField): Record<string, unknown> | null {
  const col = field.column
  if (!col) return null
  const op = cond.operator
  const v = cond.value

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
        case "before": return { [col]: { lt: d } }
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
