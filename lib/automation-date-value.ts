// A workflow field value expressed as a date relative to something — "one year from
// when the workflow runs", "the hire date plus 90 days".
//
// Two rules, both learned the hard way in this codebase:
//   * Months and years are added on the CALENDAR PARTS, not by adding milliseconds.
//     A month is not 30 days, and 31 Jan + 1 month is 28 Feb, not 3 March.
//   * A calendar date is never round-tripped through `new Date(...)` — a stored
//     "07/15/2026" or "2026-07-15" parsed that way lands a day off once the viewer's
//     timezone and the display timezone disagree.

import { dayNumber } from "@/lib/date-values"

export type DateOffsetUnit = "days" | "weeks" | "months" | "years"

export interface RelativeDateValue {
  /** "now" = when the workflow runs; otherwise a date property on the triggering record. */
  base: "now" | string
  offset: { n: number; unit: DateOffsetUnit }
}

export const DATE_OFFSET_UNITS: { value: DateOffsetUnit; label: string }[] = [
  { value: "days", label: "days" },
  { value: "weeks", label: "weeks" },
  { value: "months", label: "months" },
  { value: "years", label: "years" },
]

function partsOf(dayNum: number): { y: number; m: number; d: number } {
  const dt = new Date(dayNum * 864e5)
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
}

/** "yyyy-mm-dd" for a day number. */
function ymdOf(dayNum: number): string {
  const { y, m, d } = partsOf(dayNum)
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

/**
 * Shift a day number by a calendar offset. Days/weeks are plain arithmetic; months
 * and years move the parts and clamp the day into the target month.
 */
export function shiftDay(dayNum: number, n: number, unit: DateOffsetUnit): number {
  if (unit === "days") return dayNum + n
  if (unit === "weeks") return dayNum + n * 7
  const { y, m, d } = partsOf(dayNum)
  const months = (unit === "years" ? n * 12 : n) + (m - 1)
  const ty = y + Math.floor(months / 12)
  const tm = ((months % 12) + 12) % 12 + 1
  const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate() // day 0 of next month
  const td = Math.min(d, lastDay)
  return Math.floor(Date.UTC(ty, tm - 1, td) / 864e5)
}

/** True when a stored field value is a relative-date spec rather than a literal. */
export function isRelativeDateValue(v: unknown): v is RelativeDateValue {
  const o = v as any
  return !!o && typeof o === "object" && typeof o.base === "string" && !!o.offset && typeof o.offset.n === "number"
}

/**
 * Resolve to the storage form DATE properties use — a plain calendar day at UTC
 * midnight, matching what the importer writes. Returns null when the base property
 * is empty or unreadable, so the caller can skip the field rather than write a
 * nonsense date.
 */
export function resolveRelativeDate(
  spec: RelativeDateValue,
  readBaseProperty: (key: string) => unknown,
  now: Date = new Date(),
): string | null {
  let base: number | null
  if (spec.base === "now") {
    base = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5)
  } else {
    base = dayNumber(readBaseProperty(spec.base))
  }
  if (base == null) return null
  const n = Number(spec.offset?.n)
  const shifted = shiftDay(base, isNaN(n) ? 0 : n, spec.offset?.unit ?? "days")
  return `${ymdOf(shifted)}T00:00:00.000Z`
}
