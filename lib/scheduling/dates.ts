// Date helpers ported verbatim from the original dashboard. Dates are handled as
// local-midnight Date objects (same as the original) to keep week math identical.
import type { WeekSchedule } from "./types"

export function d(s?: string | null): Date | null {
  return s ? new Date(s + "T00:00:00") : null
}

const MON_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
export function fmtShort(dt: Date): string {
  return MON_ABBR[dt.getMonth()] + " " + dt.getDate() + ", " + dt.getFullYear()
}

export function monday(dt: Date): Date {
  const r = new Date(dt)
  const day = r.getDay()
  r.setDate(r.getDate() - day + (day === 0 ? -6 : 1))
  return r
}

export function addDays(dt: Date, n: number): Date {
  const r = new Date(dt)
  r.setDate(r.getDate() + n)
  return r
}

export function dateLe(a: Date, b: Date): boolean {
  return a.getTime() <= b.getTime()
}

export function freqMult(f: string): number {
  return f === "eow" ? 0.5 : 1.0
}

export function toISODate(dt: Date): string {
  return dt.toISOString().slice(0, 10)
}

// Which A/B rotation a given week falls on, relative to the configured start week.
export function weekType(weekStart: Date, startWeekValue: string): "A" | "B" {
  const base = d(startWeekValue) || monday(new Date())
  const diff = Math.round(
    (monday(weekStart).getTime() - monday(base).getTime()) / (7 * 86400000)
  )
  return diff % 2 === 0 ? "A" : "B"
}

export function getSchedForWeek(
  weekStart: Date,
  startWeekValue: string,
  scheduleA: WeekSchedule,
  scheduleB: WeekSchedule
): WeekSchedule {
  return weekType(weekStart, startWeekValue) === "A" ? scheduleA : scheduleB
}
