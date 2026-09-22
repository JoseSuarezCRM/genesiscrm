// Translate an advanced FilterState (the same model the client FilterBuilder
// produces) into a Prisma `where` object, so a server-paginated list (e.g.
// surgery) can use the identical filter UI and have it compose with pagination,
// sorting, and CSV export. Only fields that carry a `column` are translated.

import { Prisma } from "@prisma/client"
import { FilterState, FilterField, FilterGroup, Condition, isConditionActive } from "./filters"
import { resolvePreset } from "./reporting/date-presets"
import { dayStart } from "./tz"
import type { JsonResolution } from "./json-predicate"

// ── NULL handling ────────────────────────────────────────────────────────────
// Postgres is three-valued: a comparison against NULL yields `unknown`, and both
// the comparison and its negation then drop the row. The in-memory evaluator is
// two-valued and reads a blank as "" (text) or "no match" (number/date). Left
// alone the two disagree — measured on Referral.patientEmail, `NOT (… ILIKE
// '%gmail%')` returned 192 rows where the in-memory answer is 8,758: the 8,566
// rows with no email vanished.
//
// Two shapes fix it, and both are needed for different reasons:
//
//   guarded()  forces a positive condition to be FALSE rather than `unknown` for
//              a NULL row. Required so a group-level Exclude can negate it —
//              NOT(unknown) is unknown, NOT(false) is true.
//   orNull()   widens an inherently-negated operator to also match NULL rows,
//              matching the in-memory reading that an absent value "doesn't
//              contain" and "is not" whatever you typed.
//
// Both are no-ops on a non-nullable column, which is not merely an optimisation:
// Prisma REJECTS `{ col: null }` and `{ col: { not: null } }` outright there
// ("Argument `not` must not be null"), so the guard must not be emitted at all.
function guarded(col: string, field: FilterField, w: Record<string, unknown>): Record<string, unknown> {
  return field.nullable ? { AND: [{ [col]: { not: null } }, w] } : w
}
function orNull(col: string, field: FilterField, w: Record<string, unknown>): Record<string, unknown> {
  return field.nullable ? { OR: [w, { [col]: null }] } : w
}


// Custom properties live in a JSON bag, so they translate to Prisma JSON-path
// filters rather than plain column filters. Postgres compares the stored JSON
// value, so string operators are exact-case; numeric/date operators aren't
// supported on the bag and fall through as "no condition".
function jsonConditionToWhere(
  cond: Condition,
  field: FilterField,
  resolved?: JsonResolution,
): Record<string, unknown> | null {
  // Resolved upstream in raw SQL (lib/json-predicate) because Prisma's JSON
  // filters are case-sensitive and have no numeric/date operators at all. The
  // id set IS the answer for this condition, absence included.
  const pre = resolved?.[cond.id]
  if (pre) return { id: { in: pre } }
  const bag = field.jsonBag!
  const path = [field.column!]
  const op = cond.operator
  const v = cond.value
  const at = (filter: Record<string, unknown>) => ({ [bag]: { path, ...filter } })

  // A property the record never had is a MISSING KEY, which Postgres extracts as
  // SQL NULL — so the same three-valued trap as a nullable column applies, and
  // every bag field is effectively nullable. In memory an absent property reads
  // as blank, so "is false" and "is none of" are true for it; without these two
  // wrappers SQL disagreed on 8,693 referrals for a single checkbox.
  // AnyNull, not DbNull. Prisma treats them as different questions: DbNull asks
  // whether the KEY IS MISSING, JsonNull whether the VALUE IS null. Clearing a
  // property writes an explicit null rather than deleting the key, so DbNull
  // alone reported those records as having a value.
  const absent = at({ equals: Prisma.AnyNull })
  const present = (w: Record<string, unknown>) => ({ AND: [{ NOT: absent }, w] })
  const orAbsent = (w: Record<string, unknown>) => ({ OR: [w, absent] })

  // Blank has three storage forms here: key missing, value null, or a value the
  // in-memory `isBlank` treats as empty ("" from a cleared text field, [] from a
  // multi-select with nothing chosen). All three have to read as unknown, which
  // is the same rule native text columns already follow.
  const emptyish = [at({ equals: "" }), at({ equals: [] })]
  if (op === "is_known") return { AND: [{ NOT: absent }, ...emptyish.map((e) => ({ NOT: e }))] }
  if (op === "is_unknown") return { OR: [absent, ...emptyish] }

  if (field.type === "select") {
    const arr = (Array.isArray(v) ? v : v ? [v] : []).map(String)
    if (arr.length === 0) return null
    // A DROPDOWN stores the chosen value; a MULTI_SELECT stores an array of
    // them. Both arrive here as type "select", and the in-memory evaluator
    // already handles either shape — so comparing only with `equals` matched no
    // multi-select row at all (101 of 442 TPL records for a single option).
    const anyOf = { OR: arr.flatMap((s) => [at({ equals: s }), at({ array_contains: [s] })]) }
    if (op === "is_any_of") return present(anyOf)
    if (op === "is_none_of") return orAbsent({ NOT: anyOf })
    return null
  }

  if (field.type === "boolean") {
    if (op === "is_true") return present(at({ equals: true }))
    if (op === "is_false") return orAbsent(at({ equals: false }))
    return null
  }

  const s = String(v ?? "")
  if (!s) return null
  switch (op) {
    case "contains": return present(at({ string_contains: s }))
    case "not_contains": return orAbsent({ NOT: at({ string_contains: s }) })
    case "is": return present(at({ equals: s }))
    case "is_not": return orAbsent({ NOT: at({ equals: s }) })
    case "starts_with": return present(at({ string_starts_with: s }))
    case "ends_with": return present(at({ string_ends_with: s }))
  }
  return null
}

// Operators the in-memory evaluator considers SATISFIED by an absent value,
// because it reads a blank as "". A missing value "doesn't contain" and "is not"
// whatever you typed. Numeric and date operators are deliberately absent from
// this list — there, blank matches nothing, in both evaluators.
const ABSENT_SATISFIES = new Set(["not_contains", "is_not", "is_none_of", "is_false", "is_unknown"])

// Wraps the scalar/json/relation condition; for a joined field (relationPath set,
// e.g. "referringPractice") nests it as `{ referringPractice: <where> }` so a
// single-FK relation can be filtered (Prisma relation `is`).
function conditionToWhere(cond: Condition, field: FilterField, resolved?: JsonResolution): Record<string, unknown> | null {
  const w = scalarConditionToWhere(cond, field, resolved)
  if (!w || !field.relationPath) return w
  const wrapped = { [field.relationPath]: w }
  // No related row at all: Prisma's relation filter excludes it, but in-memory
  // the joined value is simply blank — so for the operators a blank satisfies,
  // rows with no relation have to be added back.
  if (field.relationNullable && ABSENT_SATISFIES.has(cond.operator)) {
    return { OR: [wrapped, { [field.relationPath]: null }] }
  }
  return wrapped
}

function scalarConditionToWhere(cond: Condition, field: FilterField, resolved?: JsonResolution): Record<string, unknown> | null {
  const op = cond.operator
  const v = cond.value

  // Many-to-many relation (e.g. tags): map the `select` operators to some/none.
  // Checked BEFORE the `column` guard below — a relation field has no column of
  // its own, so testing for one first silently dropped every tag filter.
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

  const col = field.column
  if (!col) return null
  if (field.jsonBag) return jsonConditionToWhere(cond, field, resolved)

  // "Is known" / "is unknown" on a NON-nullable column. Prisma rejects a null
  // check there outright ("Argument `not` is missing"), and the question is
  // answerable statically anyway: a required column always has a value, so the
  // test is a constant. `{ in: [] }` is the match-nothing form.
  if (op === "is_known" || op === "is_unknown") {
    const known = op === "is_known"
    // `nullable` is a TRI-STATE here, and the check below is deliberately
    // `=== false` rather than falsy. The older per-list field builders
    // (referral-filter-fields, surgery-filter-fields, object-columns …) don't
    // populate it at all, and treating their `undefined` as "not nullable"
    // would silently rewrite what those lists return. Unknown means "behave
    // exactly as before"; only a definite false takes the constant-folded path.
    if (field.nullable === false) {
      // The in-memory side counts "" as blank, so a required text column still
      // has a real test to run; any other required column is simply always known.
      if (field.type === "text") return known ? { [col]: { not: "" } } : { [col]: "" }
      // Constant true/false — but written so they survive a group-level Exclude.
      // `{}` is the obvious "match everything" and is WRONG here: Prisma treats
      // `{ NOT: {} }` as a no-op, so negating it matched every row instead of none.
      // "not in the empty set" negates cleanly to "in the empty set".
      const none = { [col]: { in: [] } }
      return known ? { NOT: none } : none
    }
    if (field.type === "text") {
      return known
        ? { AND: [{ [col]: { not: null } }, { [col]: { not: "" } }] }
        : { OR: [{ [col]: null }, { [col]: "" }] }
    }
    return known ? { [col]: { not: null } } : { [col]: null }
  }

  switch (field.type) {
    case "text": {
      const s = String(v ?? "")
      if (!s) return null
      switch (op) {
        case "contains": return guarded(col, field, { [col]: { contains: s, mode: "insensitive" } })
        case "not_contains": return orNull(col, field, { NOT: { [col]: { contains: s, mode: "insensitive" } } })
        case "is": return guarded(col, field, { [col]: { equals: s, mode: "insensitive" } })
        case "is_not": return orNull(col, field, { NOT: { [col]: { equals: s, mode: "insensitive" } } })
        case "starts_with": return guarded(col, field, { [col]: { startsWith: s, mode: "insensitive" } })
        case "ends_with": return guarded(col, field, { [col]: { endsWith: s, mode: "insensitive" } })
      }
      return null
    }
    case "number": {
      const n = Number(v)
      if (Number.isNaN(n)) return null
      // Every numeric operator is guarded, `neq` included: the in-memory side
      // treats a blank as "matches nothing" for all six, so an absent value must
      // be definitively false here too or a group Exclude would drop those rows.
      switch (op) {
        case "eq": return guarded(col, field, { [col]: n })
        case "neq": return guarded(col, field, { NOT: { [col]: n } })
        case "gt": return guarded(col, field, { [col]: { gt: n } })
        case "gte": return guarded(col, field, { [col]: { gte: n } })
        case "lt": return guarded(col, field, { [col]: { lt: n } })
        case "lte": return guarded(col, field, { [col]: { lte: n } })
      }
      return null
    }
    case "select": {
      const arr = Array.isArray(v) ? v : v ? [v] : []
      if (arr.length === 0) return null
      switch (op) {
        case "is_any_of": return guarded(col, field, { [col]: { in: arr } })
        // Postgres NOT IN drops NULLs; in-memory reads an absent value as "" and
        // so counts it as "none of" whatever was chosen. Match the latter.
        case "is_none_of": return orNull(col, field, { [col]: { notIn: arr } })
      }
      return null
    }
    case "boolean": {
      if (op === "is_true") return guarded(col, field, { [col]: true })
      // `isBlank(raw)` counts as false in-memory, so an unset flag is "is false".
      if (op === "is_false") return orNull(col, field, { [col]: false })
      return null
    }
    case "date": {
      // No orNull anywhere here: in-memory bails at `Number.isNaN(a) → false` for
      // an absent date, so a missing date matches nothing — `not_between` included.
      // Explicit day boundaries, when the field says what kind of date it is.
      // A DATE column's day starts at UTC midnight (that's how the value is
      // stored); a DATETIME column's day starts at Chicago midnight. The same
      // instants are used by evalBoundedDate in lib/filters, so the two sides
      // agree by construction. Fields that don't declare it fall through to the
      // legacy branch below, untouched.
      if (field.dateOnly !== undefined) {
        const S = (val: unknown, off = 0) => dayStart(String(val ?? ""), field.dateOnly as boolean, off)
        if (op === "between" || op === "not_between") {
          const arr = Array.isArray(cond.value) ? cond.value : []
          const from = arr[0] ? S(arr[0]) : null
          const to = arr[1] ? S(arr[1], 1) : null
          if (!from || !to) return null
          const w = { [col]: { gte: from, lt: to } }
          return guarded(col, field, op === "between" ? w : { NOT: w })
        }
        if (op === "relative") {
          const win = resolvePreset(String(v ?? ""))
          if (!win) return null
          return guarded(col, field, { [col]: { gte: win.start, lte: win.end } })
        }
        const start = v ? S(v) : null
        const next = v ? S(v, 1) : null
        if (!start || !next) return null
        switch (op) {
          case "on": return guarded(col, field, { [col]: { gte: start, lt: next } })
          case "after": return guarded(col, field, { [col]: { gte: next } })
          case "on_or_after": return guarded(col, field, { [col]: { gte: start } })
          case "before": return guarded(col, field, { [col]: { lt: start } })
          case "on_or_before": return guarded(col, field, { [col]: { lt: next } })
        }
        return null
      }
      if (op === "between" || op === "not_between") {
        const arr = Array.isArray(cond.value) ? cond.value : []
        const from = arr[0] ? new Date(arr[0]) : null
        const to = arr[1] ? new Date(String(arr[1]) + "T23:59:59") : null
        if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null
        const w = { [col]: { gte: from, lte: to } }
        return guarded(col, field, op === "between" ? w : { NOT: w })
      }
      if (op === "relative") {
        const win = resolvePreset(String(cond.value ?? ""))
        if (!win) return null
        return guarded(col, field, { [col]: { gte: win.start, lte: win.end } })
      }
      const s = String(v ?? "")
      if (!s) return null
      const d = new Date(s)
      if (Number.isNaN(d.getTime())) return null
      switch (op) {
        case "after": return guarded(col, field, { [col]: { gt: d } })
        case "on_or_after": return guarded(col, field, { [col]: { gte: d } })
        case "before": return guarded(col, field, { [col]: { lt: d } })
        case "on_or_before": return guarded(col, field, { [col]: { lte: d } })
        case "on": {
          const start = new Date(d); start.setHours(0, 0, 0, 0)
          const end = new Date(start); end.setDate(end.getDate() + 1)
          return guarded(col, field, { [col]: { gte: start, lt: end } })
        }
      }
      return null
    }
  }
  return null
}

function groupToWhere(group: FilterGroup, byKey: Record<string, FilterField>, resolved?: JsonResolution): Record<string, unknown> | null {
  const parts = group.conditions
    .map((c) => { const f = byKey[c.field]; return f ? conditionToWhere(c, f, resolved) : null })
    .filter((x): x is Record<string, unknown> => x !== null)
  // An empty group restricts nothing, and `not` must not turn that into "match
  // nothing" — otherwise ticking Exclude on a half-built group blanks the list.
  // Returning null here already means "no restriction", so there's nothing to negate.
  if (parts.length === 0) return null
  const inner = group.combinator === "OR" ? { OR: parts } : { AND: parts }
  // Safe because every condition above is null-guarded, so `inner` is true/false
  // per row and never `unknown` — see the NULL handling note at the top.
  return group.not ? { NOT: inner } : inner
}

// Returns a Prisma `where` fragment (or {} when there are no active conditions).
export function filterStateToWhere(
  state: FilterState | null | undefined,
  fields: FilterField[],
  resolved?: JsonResolution,
): Record<string, unknown> {
  if (!state) return {}
  const byKey: Record<string, FilterField> = Object.fromEntries(fields.map((f) => [f.key, f]))
  const groups = state.groups
    .map((g) => groupToWhere(g, byKey, resolved))
    .filter((x): x is Record<string, unknown> => x !== null)
  if (groups.length === 0) return {}
  return state.combinator === "OR" ? { OR: groups } : { AND: groups }
}

// ── Which conditions actually reached the database ───────────────────────────
// Every translation above can return null, and a null is silently dropped: the
// condition simply stops restricting. In a list that shows up as "this filter
// did nothing"; in a saved segment it would mean the stated size is wrong with
// no indication why. This reports what was dropped and why, so callers can
// either refine those conditions in memory (lib/object-query) or say so in the UI.

export type UntranslatableReason =
  | "unknown-field"      // the condition names a field the schema doesn't have
  | "no-column"          // field carries no DB column (client-only criterion)
  | "relation-count"     // Prisma `where` has no count comparison, only some/none/every
  | "json-typed-op"      // number/date operator on a JSON bag property
  | "unsupported-operator"

export interface FilterExplanation {
  translated: number
  untranslatable: { field: string; label: string; operator: string; reason: UntranslatableReason }[]
}

export function explainFilterState(
  state: FilterState | null | undefined,
  fields: FilterField[],
  resolved?: JsonResolution,
): FilterExplanation {
  const byKey: Record<string, FilterField> = Object.fromEntries(fields.map((f) => [f.key, f]))
  const out: FilterExplanation = { translated: 0, untranslatable: [] }
  if (!state) return out

  for (const g of state.groups ?? []) {
    for (const c of g.conditions ?? []) {
      if (!isConditionActive(c, fields)) continue
      const f = byKey[c.field]
      if (!f) {
        out.untranslatable.push({ field: c.field, label: c.field, operator: c.operator, reason: "unknown-field" })
        continue
      }
      if (conditionToWhere(c, f, resolved) !== null) { out.translated++; continue }
      let reason: UntranslatableReason = "unsupported-operator"
      if ((f as any).relationCount) reason = "relation-count"
      else if (!f.column && !f.relationSome) reason = "no-column"
      else if (f.jsonBag && (f.type === "number" || f.type === "date")) reason = "json-typed-op"
      out.untranslatable.push({ field: c.field, label: f.label, operator: c.operator, reason })
    }
  }
  return out
}

// decodeFilterParam lives in lib/filters (pure) so client components can parse
// the URL param without importing the Prisma client.
export { decodeFilterParam } from "./filters"
