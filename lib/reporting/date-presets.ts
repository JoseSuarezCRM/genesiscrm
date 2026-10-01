// Shared relative date-range catalog + resolver. Used by the report engine
// (window filtering), the builder date-range control, and dashboard date filters
// so the same presets resolve consistently and dynamically (relative to "now").

import { CLINIC_TZ, zonedParts, zonedWallToUtc } from "@/lib/tz"

export interface DatePresetDef { value: string; label: string; group: string }

export const DATE_PRESET_GROUPS: DatePresetDef[] = [
  { value: "all", label: "All time", group: "Common" },
  { value: "today", label: "Today", group: "Day" },
  { value: "yesterday", label: "Yesterday", group: "Day" },
  { value: "tomorrow", label: "Tomorrow", group: "Day" },
  { value: "this_week", label: "This week", group: "Week" },
  { value: "this_week_so_far", label: "This week so far", group: "Week" },
  { value: "last_week", label: "Last week", group: "Week" },
  { value: "next_week", label: "Next week", group: "Week" },
  { value: "this_month", label: "This month", group: "Month" },
  { value: "this_month_so_far", label: "This month so far", group: "Month" },
  { value: "last_month", label: "Last month", group: "Month" },
  { value: "next_month", label: "Next month", group: "Month" },
  { value: "this_quarter", label: "This quarter", group: "Quarter" },
  { value: "this_quarter_so_far", label: "This quarter so far", group: "Quarter" },
  { value: "last_quarter", label: "Last quarter", group: "Quarter" },
  { value: "this_year", label: "This year", group: "Year" },
  { value: "ytd", label: "Year to date", group: "Year" },
  { value: "last_year", label: "Last year", group: "Year" },
  { value: "last_7", label: "Last 7 days", group: "Rolling" },
  { value: "last_30", label: "Last 30 days", group: "Rolling" },
  { value: "last_60", label: "Last 60 days", group: "Rolling" },
  { value: "last_90", label: "Last 90 days", group: "Rolling" },
  { value: "last_180", label: "Last 180 days", group: "Rolling" },
  { value: "last_365", label: "Last 365 days", group: "Rolling" },
  { value: "next_7", label: "Next 7 days", group: "Rolling" },
  { value: "next_30", label: "Next 30 days", group: "Rolling" },
  { value: "custom", label: "Custom range", group: "Common" },
]

/*
 * Every window is built on the CLINIC's calendar (America/Chicago), whatever
 * timezone the code runs in. Built in host time, "today" meant the UTC day on
 * Vercel (7 pm Chicago onwards counted as tomorrow) and the viewer's day in the
 * browser, so the same filter answered differently in a small list (filtered in
 * the browser) and a large one (filtered on the server).
 *
 * Besides the instants, a window carries its first and last CALENDAR days.
 * Date-only values compare against those directly: the end instant of a
 * Chicago day is 04:59 UTC the next morning, which any reader that turns an
 * instant back into a day in another timezone would get wrong.
 */

export interface DateWindow {
  start: Date
  end: Date
  /** First calendar day of the window, YYYY-MM-DD, clinic time. */
  startDay: string
  /** Last calendar day of the window, YYYY-MM-DD, clinic time. */
  endDay: string
}

interface Day { y: number; m: number; d: number } // m 0-based

const dayOf = (y: number, m: number, d: number): Day => {
  const t = new Date(Date.UTC(y, m, d))
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() }
}
const addDays = (x: Day, n: number) => dayOf(x.y, x.m, x.d + n)
const startOf = (x: Day) => zonedWallToUtc(x.y, x.m, x.d, 0, 0, CLINIC_TZ)
const endOf = (x: Day) => new Date(startOf(addDays(x, 1)).getTime() - 1)
const iso = (x: Day) => `${x.y}-${String(x.m + 1).padStart(2, "0")}-${String(x.d).padStart(2, "0")}`
/** Sunday on or before the day — weeks start Sunday. */
const weekStart = (x: Day) => addDays(x, -new Date(Date.UTC(x.y, x.m, x.d)).getUTCDay())
const lastOfMonth = (y: number, m: number) => dayOf(y, m + 1, 0)

function win(first: Day, last: Day, opts: { start?: Date; end?: Date } = {}): DateWindow {
  return { start: opts.start ?? startOf(first), end: opts.end ?? endOf(last), startDay: iso(first), endDay: iso(last) }
}

function parseDay(s: string | undefined): Day | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ""))
  if (!m) return null
  const x = dayOf(+m[1]!, +m[2]! - 1, +m[3]!)
  return iso(x) === `${m[1]}-${m[2]}-${m[3]}` ? x : null
}

// Resolve a preset (or custom from/to) to a window, or null for "all".
export function resolvePreset(preset: string, from?: string, to?: string, now: Date = new Date()): DateWindow | null {
  if (preset === "all" || !preset) return null
  if (preset === "custom") {
    const a = parseDay(from), b = parseDay(to)
    return a && b ? win(a, b) : null
  }
  const p = zonedParts(now, CLINIC_TZ)
  const today = dayOf(p.year, p.month, p.day)
  const y = today.y, m = today.m
  const q = Math.floor(m / 3) * 3
  switch (preset) {
    case "today": return win(today, today)
    case "yesterday": { const d = addDays(today, -1); return win(d, d) }
    case "tomorrow": { const d = addDays(today, 1); return win(d, d) }
    case "this_week": { const s = weekStart(today); return win(s, addDays(s, 6)) }
    case "this_week_so_far": return win(weekStart(today), today, { end: now })
    case "last_week": { const s = addDays(weekStart(today), -7); return win(s, addDays(s, 6)) }
    case "next_week": { const s = addDays(weekStart(today), 7); return win(s, addDays(s, 6)) }
    case "this_month": return win(dayOf(y, m, 1), lastOfMonth(y, m))
    case "this_month_so_far": return win(dayOf(y, m, 1), today, { end: now })
    case "last_month": return win(dayOf(y, m - 1, 1), lastOfMonth(y, m - 1))
    case "next_month": return win(dayOf(y, m + 1, 1), lastOfMonth(y, m + 1))
    case "this_quarter": return win(dayOf(y, q, 1), lastOfMonth(y, q + 2))
    case "this_quarter_so_far": return win(dayOf(y, q, 1), today, { end: now })
    case "last_quarter": return win(dayOf(y, q - 3, 1), lastOfMonth(y, q - 1))
    case "this_year": return win(dayOf(y, 0, 1), dayOf(y, 11, 31))
    case "ytd": return win(dayOf(y, 0, 1), today, { end: now })
    case "last_year": return win(dayOf(y - 1, 0, 1), dayOf(y - 1, 11, 31))
    case "last_7": return win(addDays(today, -6), today, { end: now })
    case "last_30": return win(addDays(today, -29), today, { end: now })
    case "last_60": return win(addDays(today, -59), today, { end: now })
    case "last_90": return win(addDays(today, -89), today, { end: now })
    case "last_180": return win(addDays(today, -179), today, { end: now })
    case "last_365": return win(addDays(today, -364), today, { end: now })
    case "next_7": return win(today, addDays(today, 7), { start: now })
    case "next_30": return win(today, addDays(today, 30), { start: now })
  }
  return null
}
