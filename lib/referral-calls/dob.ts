/**
 * Dates of birth: what the form shows, what gets stored, and what gets refused.
 *
 * The form shows MM/DD/YYYY, as the original tool and every hospital page do.
 * Storage follows the CRM's rule for calendar days — noon UTC — so the day
 * reads the same in every timezone.
 *
 * Validation comes first, because the CRM's `clinicDateOnlyValue` builds dates
 * with `Date.UTC`, which quietly rolls "02/31/1950" over to March 3. A wrong
 * date of birth on a consult is worse than an empty one: it can attach a call
 * to the wrong patient in Epic.
 */

export interface Ymd {
  y: number
  m: number
  d: number
}

const pad = (n: number) => String(n).padStart(2, "0")

function isRealDate({ y, m, d }: Ymd): boolean {
  if (m < 1 || m > 12 || d < 1 || y < 1850) return false
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/**
 * A two-digit year as the most recent year it could be. For a date of birth
 * that is always right: nobody on a consult was born in the future.
 */
function expandYear(yy: number, now: Date): number {
  const current = now.getUTCFullYear()
  const century = Math.floor(current / 100) * 100
  const candidate = century + yy
  return candidate > current ? candidate - 100 : candidate
}

/**
 * Reads what a person or a parser typed. Accepts M/D/YY, M/D/YYYY (with /, -
 * or . as separators) and YYYY-MM-DD. Null for anything that is not a real,
 * past date — including an ambiguous or impossible one.
 */
export function parseDob(input: string, now: Date = new Date()): Ymd | null {
  const s = input.trim()
  if (!s) return null

  let ymd: Ymd | null = null
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  const us = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/.exec(s)
  if (iso) ymd = { y: +iso[1]!, m: +iso[2]!, d: +iso[3]! }
  else if (us) {
    const rawYear = us[3]!
    const y = rawYear.length === 2 ? expandYear(+rawYear, now) : +rawYear
    ymd = { y, m: +us[1]!, d: +us[2]! }
  }
  if (!ymd || !isRealDate(ymd)) return null
  if (Date.UTC(ymd.y, ymd.m - 1, ymd.d) > now.getTime()) return null
  return ymd
}

/** "01/02/1945" */
export function formatDob({ y, m, d }: Ymd): string {
  return `${pad(m)}/${pad(d)}/${y}`
}

/** The stored form: noon UTC on that day, as an ISO string. */
export function dobToIso(input: string, now?: Date): string | null {
  const ymd = parseDob(input, now)
  return ymd ? new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d, 12)).toISOString() : null
}

/**
 * The stored value back to MM/DD/YYYY. Reads the literal year, month and day
 * from the string rather than going through `new Date()`, which would shift a
 * midnight-UTC value to the previous day in Chicago.
 */
export function isoToDob(value: unknown): string {
  if (typeof value !== "string") return ""
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return m ? `${m[2]}/${m[3]}/${m[1]}` : ""
}

/** Tidies a typed date into MM/DD/YYYY when it is valid; leaves it alone otherwise. */
export function normalizeDobInput(input: string, now?: Date): string {
  const ymd = parseDob(input, now)
  return ymd ? formatDob(ymd) : input
}
