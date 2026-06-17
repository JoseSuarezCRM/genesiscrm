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
