// Activity date/time helpers. Activities historically stored a date-only value at
// UTC midnight (formatted in UTC so the picked calendar day never shifts in a
// negative-offset zone). New activities carry a real timestamp (Chicago wall time
// → UTC via DatePicker). We tell them apart by whether the stored time is exactly
// UTC 00:00:00: legacy → date-only in UTC; otherwise → date + time in Chicago.

const TZ = "America/Chicago"

export function hasActivityTime(date: string | Date): boolean {
  const d = new Date(date)
  if (isNaN(d.getTime())) return false
  return !(d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0)
}

// Full "when": date, plus time when the record has a real timestamp.
export function fmtActivityWhen(date: string | Date): string {
  const d = new Date(date)
  if (isNaN(d.getTime())) return ""
  const withTime = hasActivityTime(date)
  const tz = withTime ? TZ : "UTC"
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz })
  if (!withTime) return day
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })
  return `${day} · ${time}`
}

// Just the time (Chicago) for a timestamped activity, else "".
export function fmtActivityTime(date: string | Date): string {
  if (!hasActivityTime(date)) return ""
  const d = new Date(date)
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ })
}

// A Date positioned at the record's calendar day in its effective zone — used by
// the card block, sorting, and date-range filtering so they agree with the display.
export function activityLocalDate(date: string | Date): Date {
  const d = new Date(date)
  if (isNaN(d.getTime())) return new Date(NaN)
  const tz = hasActivityTime(date) ? TZ : "UTC"
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  return new Date(get("year"), get("month") - 1, get("day"))
}
