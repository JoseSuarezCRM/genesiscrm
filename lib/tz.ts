// Clinic-local timezone helpers. Surgery dates/times and time-of-day delays are
// entered and shown in the clinic's wall clock (Central Time, Chicago), but
// stored as absolute UTC instants. These helpers convert between the two,
// DST-aware, with no external dependencies.

export const CLINIC_TZ = "America/Chicago"

// Wall-clock parts of an instant in a given timezone.
export function zonedParts(date: Date, tz: string = CLINIC_TZ) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  })
  const m: Record<string, number> = {}
  for (const p of dtf.formatToParts(date)) if (p.type !== "literal") m[p.type] = Number(p.value)
  return { year: m.year, month: m.month - 1, day: m.day, hour: m.hour === 24 ? 0 : m.hour, minute: m.minute, second: m.second }
}

// Convert a wall-clock time in `tz` to the corresponding UTC instant (DST-aware).
export function zonedWallToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string = CLINIC_TZ): Date {
  const guess = Date.UTC(y, mo, d, h, mi, 0)
  const p = zonedParts(new Date(guess), tz)
  const asUtcOfParts = Date.UTC(p.year, p.month, p.day, p.hour, p.minute, p.second)
  const offset = asUtcOfParts - guess // tz offset at that instant
  return new Date(guess - offset)
}

const pad = (n: number) => String(n).padStart(2, "0")

// Format an instant as a datetime-local input value (YYYY-MM-DDTHH:mm) in the
// clinic timezone, so the picker always shows Chicago wall time.
export function clinicDatetimeLocalValue(date: Date): string {
  const p = zonedParts(date, CLINIC_TZ)
  return `${p.year}-${pad(p.month + 1)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

// Interpret a datetime-local value (YYYY-MM-DDTHH:mm) as clinic wall time and
// return the corresponding UTC ISO string for storage. Empty → null.
export function clinicDatetimeLocalToISO(value: string | null | undefined): string | null {
  if (!value) return null
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return null
  const [, y, mo, d, h, mi] = m.map(Number)
  return zonedWallToUtc(y, mo - 1, d, h, mi, CLINIC_TZ).toISOString()
}

// ── Day boundaries for date filtering ────────────────────────────────────────
// A date filter needs the instant a day starts, and which instant that is
// depends on what the column means:
//
//   • A DATE column holds a calendar value stored at UTC midnight (a date of
//     birth is the 21st everywhere, not an instant). Its day starts at UTC
//     midnight, and reading it in Chicago would move it to the 20th.
//   • A DATETIME column holds a real instant, so its day is a CLINIC day — a
//     referral created at 8pm Chicago belongs to that day, not the next one.
//
// Anchoring both to the host's timezone is what made "created between Aug 30 and
// Aug 30" mean a UTC day on Vercel while the record card showed a Chicago one.

/** Parse a "YYYY-MM-DD" (or leading-ISO) operand into calendar parts. */
export function parseDayParts(value: string): { y: number; mo: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""))
  if (m) return { y: +m[1], mo: +m[2] - 1, d: +m[3] }
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(value ?? ""))
  if (us) return { y: +us[3], mo: +us[1] - 1, d: +us[2] }
  const dt = new Date(String(value ?? ""))
  if (Number.isNaN(dt.getTime())) return null
  return { y: dt.getFullYear(), mo: dt.getMonth(), d: dt.getDate() }
}

/**
 * The instant a filter's day begins.
 * `offsetDays` shifts by whole days, for the exclusive upper bound of a range.
 */
export function dayStart(value: string, dateOnly: boolean, offsetDays = 0): Date | null {
  const p = parseDayParts(value)
  if (!p) return null
  return dateOnly
    ? new Date(Date.UTC(p.y, p.mo, p.d + offsetDays))
    : zonedWallToUtc(p.y, p.mo, p.d + offsetDays, 0, 0, CLINIC_TZ)
}

/** Which calendar day an instant falls on, per the same rule. */
export function dayKeyOf(v: Date, dateOnly: boolean): number {
  if (dateOnly) return Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())
  const p = zonedParts(v, CLINIC_TZ)
  return Date.UTC(p.year, p.month, p.day)
}

/**
 * Normalise a date-only value for storage: NOON UTC on the calendar day picked.
 *
 * Midnight UTC is the obvious choice and the wrong one — it falls on the
 * previous day anywhere west of UTC, so a date of birth picked as the 11th was
 * stored as 1976-10-11T00:00:00Z and read back as the 10th by any formatter
 * that rendered it in clinic time. Noon is the same calendar day everywhere
 * from UTC-12 to UTC+11, so the day survives no matter which timezone reads it
 * and no reader needs timezone logic to get it right.
 *
 * This is the convention custom properties already use (surgery's helper date
 * props store "…T12:00:00.000Z"); this brings the native columns in line.
 *
 * A value carrying a real time is an instant, not a calendar day, and is
 * returned untouched.
 */
export function clinicDateOnlyValue(input: string | Date | null | undefined): Date | null {
  if (input === null || input === undefined || input === "") return null
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null
    const bare =
      input.getUTCHours() === 0 && input.getUTCMinutes() === 0 &&
      input.getUTCSeconds() === 0 && input.getUTCMilliseconds() === 0
    if (!bare) return input
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate(), 12))
  }
  const s = String(input)
  // "YYYY-MM-DD" from a date input — a calendar day, with no time to preserve.
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3], 12))
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (us) return new Date(Date.UTC(+us[3], +us[1] - 1, +us[2], 12))
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return clinicDateOnlyValue(d)
}
