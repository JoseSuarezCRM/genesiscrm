// Date helpers ported from docs/GenesisDashboard-3.html (version 10).
//
// Every date in the planner is a *calendar* date, never an instant: "2026-09-14"
// means that day at the clinic, whatever the viewer's clock says. So a Date here
// is always local midnight, and a date key is always built from the local y/m/d
// parts.
//
// The prototype builds its date keys with `date.toISOString().slice(0,10)`, which
// is a UTC round-trip: for a viewer east of UTC, local midnight is the *previous*
// day in UTC, so an override saved on the 14th comes back as the 13th. `ymd()`
// below replaces every such call — never reintroduce toISOString() here.

import { chicagoYmd } from "@/lib/intakeq-weeks"
import type { WeekSchedule } from "./types"

/** Parse "yyyy-mm-dd" as local midnight. Empty/invalid → null. */
export function d(s: string | null | undefined): Date | null {
  if (!s) return null
  const dt = new Date(s + "T00:00:00")
  return isNaN(dt.getTime()) ? null : dt
}

/** The calendar date of a Date, as "yyyy-mm-dd", from its LOCAL parts. */
export function ymd(dt: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}

/** Today at the clinic (America/Chicago), as a local-midnight Date. */
export function clinicToday(): Date {
  return d(chicagoYmd(new Date()))!
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export function fmtShort(dt: Date): string {
  return `${MONTHS_SHORT[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`
}

/** The Monday of the week containing `dt`. */
export function monday(dt: Date): Date {
  const r = new Date(dt)
  const day = r.getDay()
  r.setDate(r.getDate() - day + (day === 0 ? -6 : 1))
  r.setHours(0, 0, 0, 0)
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

/** Every-other-week providers count as half a provider in capacity math. */
export function freqMult(f: string): number {
  return f === "eow" ? 0.5 : 1.0
}

/**
 * Which half of the A/B rotation a week falls on. The prototype reads the
 * settings input directly; here the anchor is passed in so this stays pure.
 */
export function weekType(weekStart: Date, startWeekValue: string): "A" | "B" {
  const base = d(startWeekValue) || monday(clinicToday())
  const diff = Math.round((monday(weekStart).getTime() - monday(base).getTime()) / (7 * 86400000))
  // JS % keeps the sign, so weeks before the anchor would give -1.
  return Math.abs(diff % 2) === 0 ? "A" : "B"
}

export function getSchedForWeek(
  weekStart: Date,
  startWeekValue: string,
  scheduleA: WeekSchedule,
  scheduleB: WeekSchedule,
): WeekSchedule {
  return weekType(weekStart, startWeekValue) === "A" ? scheduleA : scheduleB
}

/** The Monday key (yyyy-mm-dd) a week is stored under (on-call PA, surgery weeks). */
export function weekKey(weekStart: Date): string {
  return ymd(monday(weekStart))
}
