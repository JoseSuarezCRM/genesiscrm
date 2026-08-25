// Shared relative date-range catalog + resolver. Used by the report engine
// (window filtering), the builder date-range control, and dashboard date filters
// so the same presets resolve consistently and dynamically (relative to "now").

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

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
// Weeks start Sunday (getDay 0).
const startOfWeek = (d: Date) => addDays(startOfDay(d), -d.getDay())

// Resolve a preset (or custom from/to) to a [start,end] window, or null for "all".
export function resolvePreset(preset: string, from?: string, to?: string): { start: Date; end: Date } | null {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  if (preset === "all" || !preset) return null
  if (preset === "custom") {
    if (!from || !to) return null
    return { start: new Date(from), end: new Date(to + "T23:59:59") }
  }
  switch (preset) {
    case "today": return { start: startOfDay(now), end: endOfDay(now) }
    case "yesterday": { const d = addDays(now, -1); return { start: startOfDay(d), end: endOfDay(d) } }
    case "tomorrow": { const d = addDays(now, 1); return { start: startOfDay(d), end: endOfDay(d) } }
    case "this_week": { const s = startOfWeek(now); return { start: s, end: endOfDay(addDays(s, 6)) } }
    case "this_week_so_far": return { start: startOfWeek(now), end: now }
    case "last_week": { const s = addDays(startOfWeek(now), -7); return { start: s, end: endOfDay(addDays(s, 6)) } }
    case "next_week": { const s = addDays(startOfWeek(now), 7); return { start: s, end: endOfDay(addDays(s, 6)) } }
    case "this_month": return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0, 23, 59, 59, 999) }
    case "this_month_so_far": return { start: new Date(y, m, 1), end: now }
    case "last_month": return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0, 23, 59, 59, 999) }
    case "next_month": return { start: new Date(y, m + 1, 1), end: new Date(y, m + 2, 0, 23, 59, 59, 999) }
    case "this_quarter": { const q = Math.floor(m / 3) * 3; return { start: new Date(y, q, 1), end: new Date(y, q + 3, 0, 23, 59, 59, 999) } }
    case "this_quarter_so_far": { const q = Math.floor(m / 3) * 3; return { start: new Date(y, q, 1), end: now } }
    case "last_quarter": { const q = Math.floor(m / 3) * 3 - 3; return { start: new Date(y, q, 1), end: new Date(y, q + 3, 0, 23, 59, 59, 999) } }
    case "this_year": return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59, 999) }
    case "ytd": return { start: new Date(y, 0, 1), end: now }
    case "last_year": return { start: new Date(y - 1, 0, 1), end: new Date(y - 1, 11, 31, 23, 59, 59, 999) }
    case "last_7": return { start: startOfDay(addDays(now, -6)), end: now }
    case "last_30": return { start: startOfDay(addDays(now, -29)), end: now }
    case "last_60": return { start: startOfDay(addDays(now, -59)), end: now }
    case "last_90": return { start: startOfDay(addDays(now, -89)), end: now }
    case "last_180": return { start: startOfDay(addDays(now, -179)), end: now }
    case "last_365": return { start: startOfDay(addDays(now, -364)), end: now }
    case "next_7": return { start: now, end: endOfDay(addDays(now, 7)) }
    case "next_30": return { start: now, end: endOfDay(addDays(now, 30)) }
  }
  return null
}
