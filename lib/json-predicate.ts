// ─── Custom-property conditions that Prisma can't express ────────────────────
// Custom properties live in a JSON bag, and Prisma's JSON path filters are far
// weaker than the column filters beside them. Two consequences, both measured
// on live data:
//
//   • `string_contains` is case-SENSITIVE and takes no `mode` — Prisma 5.22
//     rejects `mode: "insensitive"` on a JSON path outright. Searching the
//     appointments "First Name" property for the same four letters returned 2
//     for "Nish", 0 for "NISH" and 10 for "nish", where the right answer is 12.
//     Results were being partitioned by capitalisation, silently.
//   • Number and date operators have no JSON translation at all, so they
//     compiled to `null` and were dropped — the filter simply did nothing.
//
// Rather than denormalise (a lowercased shadow key would need a backfill plus a
// change to every write path, where one miss breaks filtering invisibly), the
// predicate is evaluated in raw parameterised SQL that returns ids. Those ids
// compose back into an ordinary Prisma `where` as `{ id: { in: [...] } }`, so
// they still nest inside AND/OR/NOT groups untouched.
//
// Each query expresses the FULL semantics of its operator, absence included, so
// the caller never has to post-process — which is what keeps it in step with the
// in-memory evaluator (see scripts/filter-parity.ts).

import { prisma } from "@/lib/prisma"
import type { Condition, FilterField } from "@/lib/filters"
import { resolvePreset } from "@/lib/reporting/date-presets"

/** Above this, inlining ids costs more than refining the rows in memory. */
export const ID_INLINE_CAP = 20_000

/** Operators this module handles. Everything else stays on Prisma's JSON filters. */
export function needsRawResolution(field: FilterField, op: string): boolean {
  if (!field.jsonBag || !field.column) return false
  if (field.type === "text") {
    return ["contains", "not_contains", "is", "is_not", "starts_with", "ends_with"].includes(op)
  }
  if (field.type === "number") return ["eq", "neq", "gt", "gte", "lt", "lte"].includes(op)
  if (field.type === "date") {
    return ["on", "between", "not_between", "relative", "after", "on_or_after", "before", "on_or_before"].includes(op)
  }
  // A dropdown stores a scalar, a multi-select an array, and Prisma's JSON
  // filters can't express "either shape contains this" in a form that survives
  // negation — `array_contains` against a scalar yields unknown, so NOT(...)
  // silently dropped every non-matching row (416 of 442 on one TPL property).
  if (field.type === "select") return ["is_any_of", "is_none_of"].includes(op)
  return false
}

// `~ '^…$'` guards the cast: a bag holds whatever was typed, so an unguarded
// ::numeric raises "invalid input syntax" for the whole query the moment one row
// has a stray character in a number field.
// The guard has to accept everything JS `Number()` accepts and Postgres `numeric`
// parses, or the two sides disagree on which rows even have a value. Scientific
// notation matters in practice: 58 appointment MRNs are stored as "1.11016E+11"
// because Excel wrote them that way on export.
const NUM = (bag: string) =>
  `(CASE WHEN trim("${bag}"->>$2) ~ '^[-+]?([0-9]+(\\.[0-9]*)?|\\.[0-9]+)([eE][-+]?[0-9]+)?$'
         THEN trim("${bag}"->>$2)::numeric END)`
// Dates reach the bag in two shapes and both are real: ISO from date pickers and
// imports, and `mm/dd/yyyy` from spreadsheet imports (appointments' Visit Date is
// stored that way). Accepting only ISO silently matched none of the second kind —
// 912 of 14,445 appointment records for one relative-date filter.
// `to_date` rather than `to_timestamp`: it yields a plain date with no timezone
// interpretation, so a calendar value can't shift a day on the way through.
// A DATE property is a CALENDAR DAY, and it arrives in two shapes: ISO (from date
// pickers) and mm/dd/yyyy (from spreadsheet imports). Both are reduced to a
// `date`, never a timestamp — the moment a calendar value passes through a
// timestamp with a timezone it can shift a day, which is the failure mode this
// codebase has been bitten by before. Bounds are bound as literal 'YYYY-MM-DD'
// strings for the same reason: a JS Date parameter would arrive as timestamptz
// and be converted using the session timezone.
const TS = (bag: string) => `(CASE
    WHEN "${bag}"->>$2 ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN substring("${bag}"->>$2 from 1 for 10)::date
    WHEN "${bag}"->>$2 ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$' THEN to_date("${bag}"->>$2, 'MM/DD/YYYY')
  END)`

/** A Date's calendar day as 'YYYY-MM-DD', read from its LOCAL parts (no UTC shift). */
function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
/** The calendar day of a stored/entered value, however it was written. */
function dayString(v: unknown): string | null {
  const s = String(v ?? "")
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : ymd(d)
}
const TXT = (bag: string) => `lower("${bag}"->>$2)`
const ABSENT = (bag: string) => `("${bag}"->>$2) IS NULL`

/** SQL predicate + extra bound params for one condition. Returns null if unsupported. */
function predicateFor(field: FilterField, cond: Condition): { sql: string; params: unknown[] } | null {
  const bag = field.jsonBag!
  const op = cond.operator
  const v = cond.value

  if (field.type === "text") {
    const s = String(v ?? "")
    if (!s) return null
    const esc = s.replace(/([%_\\])/g, "\\$1")
    const pat =
      op === "starts_with" ? `${esc}%` :
      op === "ends_with" ? `%${esc}` :
      op === "is" || op === "is_not" ? esc : `%${esc}%`
    const like = `${TXT(bag)} LIKE lower($3)`
    // In memory an absent value reads as "", so it "doesn't contain" and "is not"
    // whatever was typed — those two have to keep rows with no value at all.
    if (op === "not_contains" || op === "is_not") return { sql: `(NOT (${like}) OR ${ABSENT(bag)})`, params: [pat] }
    return { sql: like, params: [pat] }
  }

  if (field.type === "number") {
    const n = Number(v)
    if (Number.isNaN(n)) return null
    const col = NUM(bag)
    // No absence clause anywhere here: in memory a blank is NaN and matches no
    // numeric comparison, `neq` included.
    const cmp: Record<string, string> = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" }
    if (!cmp[op]) return null
    return { sql: `${col} IS NOT NULL AND ${col} ${cmp[op]} $3::numeric`, params: [n] }
  }

  if (field.type === "select") {
    const arr = (Array.isArray(v) ? v : v ? [v] : []).map(String)
    if (!arr.length) return null
    // Handles both storage shapes in one predicate, and stays two-valued so the
    // negation below is exact: a scalar that doesn't match yields false, not null.
    const clauses = arr.map((_, i) =>
      `("${bag}"->>$2 = $${3 + i} OR (jsonb_typeof("${bag}"->$2) = 'array' AND "${bag}"->$2 @> to_jsonb($${3 + i}::text)))`)
    const anyOf = `(${clauses.join(" OR ")})`
    if (op === "is_any_of") return { sql: anyOf, params: arr }
    // In memory an absent value is "none of" anything chosen, so it must stay in.
    if (op === "is_none_of") return { sql: `(NOT ${anyOf} OR ${ABSENT(bag)})`, params: arr }
    return null
  }

  if (field.type === "date") {
    const col = TS(bag)
    const notNull = `${col} IS NOT NULL`
    if (op === "between" || op === "not_between") {
      const arr = Array.isArray(v) ? v : []
      const from = arr[0] ? dayString(arr[0]) : null
      const to = arr[1] ? dayString(arr[1]) : null
      if (!from || !to) return null
      const inside = `${col} >= $3::date AND ${col} <= $4::date`
      // In memory an absent date returns false for every operator, `not_between`
      // included — so this stays inside the NOT-NULL guard rather than escaping it.
      return { sql: `${notNull} AND ${op === "between" ? `(${inside})` : `NOT (${inside})`}`, params: [from, to] }
    }
    if (op === "relative") {
      const win = resolvePreset(String(v ?? ""))
      if (!win) return null
      return { sql: `${notNull} AND ${col} >= $3::date AND ${col} <= $4::date`, params: [ymd(win.start), ymd(win.end)] }
    }
    const day = v ? dayString(v) : null
    if (!day) return null
    if (op === "on") return { sql: `${notNull} AND ${col} = $3::date`, params: [day] }
    const cmp: Record<string, string> = { after: ">", on_or_after: ">=", before: "<", on_or_before: "<=" }
    if (!cmp[op]) return null
    return { sql: `${notNull} AND ${col} ${cmp[op]} $3::date`, params: [day] }
  }

  return null
}

/** conditionId → the ids satisfying it (already the final answer, absence included). */
export type JsonResolution = Record<string, string[]>

export async function resolveJsonPredicates(opts: {
  /** Postgres table, i.e. the Prisma model name — these models carry no @@map. */
  table: string
  /** Restricts custom-object rows to one object definition. */
  scope?: { column: string; value: string } | null
  items: { cond: Condition; field: FilterField }[]
}): Promise<JsonResolution> {
  const out: JsonResolution = {}
  for (const { cond, field } of opts.items) {
    const p = predicateFor(field, cond)
    if (!p) continue
    // $1 is the scope value and $2 the property key in every predicate above, so
    // the fragments can be written without tracking parameter numbers. Property
    // ids are BOUND, never interpolated — they come from a definition row, but a
    // filter compiler is the wrong place to rely on that.
    const scopeSql = opts.scope ? `"${opts.scope.column}" = $1` : `$1 = $1`
    const sql = `SELECT id FROM "${opts.table}" WHERE ${scopeSql} AND (${p.sql})`
    const params = [opts.scope?.value ?? "1", field.column, ...p.params]
    const rows: { id: string }[] = await prisma.$queryRawUnsafe(sql, ...params)
    out[cond.id] = rows.map((r) => r.id)
  }
  return out
}
