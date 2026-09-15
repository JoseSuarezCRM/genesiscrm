// Provider colouring and the availability predicates the whole planner reads:
// is this person active, on PTO, out, covering, or starting late on a given day.
// Ported from docs/GenesisDashboard-3.html (version 10).
//
// The prototype reads module globals; every function here takes what it needs, so
// the same logic can run in a server component or a test.

import { d, ymd, addDays } from "./dates"
import { DAYS } from "./constants"
import type {
  ClinicMeta, Provider, PtoEntry, RecurringRule, ScheduleOverride, WeekSchedule,
} from "./types"

export const PALETTE = [
  "#3b82f6", "#ef4444", "#22c55e", "#a855f7", "#f97316", "#14b8a6", "#ec4899", "#0ea5e9",
  "#84cc16", "#f59e0b", "#6366f1", "#10b981", "#f43f5e", "#8b5cf6", "#06b6d4",
]

export function defaultColor(idx: number): string {
  return PALETTE[idx % PALETTE.length]
}

export function getProvColor(init: string, providers: Provider[]): string {
  const i = providers.findIndex((p) => p.init === init)
  if (i < 0) return "#aaa"
  return providers[i].color || defaultColor(i)
}

/** Black or white text, whichever reads on the given background. */
export function chipTextColor(hex: string): string {
  if (!hex || hex.length < 7) return "#fff"
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? "#0B1C31" : "#fff"
}

/** Contracted providers are flagged "(CSA)" in their name and chip dashed. */
export function isCSAProvider(init: string, providers: Provider[]): boolean {
  const p = providers.find((pr) => pr.init === init)
  return !!p?.name?.includes("(CSA)")
}

/** Is the provider on the roster during this week (start date / leave window)? */
export function providerActive(p: Provider, weekStart: Date): boolean {
  const weekEnd = addDays(weekStart, 6)
  const s = d(p.start)
  if (s && s.getTime() > weekEnd.getTime()) return false
  const lv = d(p.leave)
  const rt = d(p.ret)
  if (lv && lv.getTime() <= weekEnd.getTime()) {
    if (!rt) return false
    if (rt.getTime() > weekEnd.getTime()) return false
  }
  return true
}

/**
 * Whether a recurring rule fires on a given date. "every-other" counts whole
 * weeks from the rule's start date (or the prototype's 2026-01-05 anchor).
 */
export function isRecurringRuleMatch(rule: RecurringRule, date: Date): boolean {
  if (date.getDay() !== rule.dayOfWeek) return false
  if (rule.startDate) {
    const start = d(rule.startDate)
    if (start && date < start) return false
  }
  const freq = rule.freq
  if (freq === "every") return true
  if (freq === "every-other") {
    const ref = (rule.startDate ? d(rule.startDate) : null) ?? new Date(2026, 0, 5)
    const diff = Math.floor((date.getTime() - ref.getTime()) / (7 * 24 * 60 * 60 * 1000))
    return diff % 2 === 0
  }
  const dayOfMonth = date.getDate()
  const nth = Math.ceil(dayOfMonth / 7)
  if (freq === "1st") return nth === 1
  if (freq === "2nd") return nth === 2
  if (freq === "3rd") return nth === 3
  if (freq === "4th") return nth === 4
  if (freq === "last") {
    const nextWeek = new Date(date)
    nextWeek.setDate(dayOfMonth + 7)
    return nextWeek.getMonth() !== date.getMonth()
  }
  return false
}

export function getRecurringRulesForDate(
  init: string, date: Date, recurringRules: RecurringRule[],
): RecurringRule[] {
  return recurringRules.filter((r) => r.person === init && isRecurringRuleMatch(r, date))
}

/** PTO entry or an all-day recurring rule. */
export function isOnPTO(
  init: string, date: Date, ptoEntries: PtoEntry[], recurringRules: RecurringRule[],
): boolean {
  const onPto = ptoEntries.some((pto) => {
    if (pto.person !== init) return false
    const s = d(pto.startDate)
    const e = d(pto.endDate || pto.startDate)
    if (!s || !e) return false
    return date.getTime() >= s.getTime() && date.getTime() <= e.getTime()
  })
  if (onPto) return true
  return recurringRules.some(
    (r) => r.person === init && r.action === "out-all" && isRecurringRuleMatch(r, date)
  )
}

/**
 * Out of this clinic on this date — a one-off override (all-clinic or this one)
 * or a recurring out-clinic rule. A late start is NOT out; see getLateStart.
 */
export function isOutOverride(
  init: string, date: Date, clinic: string,
  scheduleOverrides: ScheduleOverride[], recurringRules: RecurringRule[],
): boolean {
  const ds = ymd(date)
  const hasOverride = scheduleOverrides.some((e) => {
    if (e.init !== init) return false
    if (e.action === "cover" || e.action === "late-start") return false
    if (e.date !== ds) return false
    return e.clinic === "" || e.clinic === clinic
  })
  if (hasOverride) return true
  return recurringRules.some(
    (r) => r.person === init && r.action === "out-clinic" && r.clinic === clinic && isRecurringRuleMatch(r, date)
  )
}

/** The "HH:MM" a provider starts late at this clinic, or null. New in v10. */
export function getLateStart(
  init: string, date: Date | string, clinic: string, scheduleOverrides: ScheduleOverride[],
): string | null {
  const ds = typeof date === "string" ? date : ymd(date)
  const ov = scheduleOverrides.find(
    (e) => e.init === init && e.action === "late-start" && e.date === ds && (e.clinic === "" || e.clinic === clinic)
  )
  return ov ? ov.time || "11:00" : null
}

/** Trim a "HH:MM" for the chip badge — "09:30" → "9:30", "11:00" → "11". */
export function shortTime(t: string): string {
  return t.replace(/^0/, "").replace(/:00$/, "")
}

/** Providers drafted in to cover this clinic-day. */
export function getCoverOverrides(
  date: Date, clinic: string, scheduleOverrides: ScheduleOverride[],
): { init: string; note?: string }[] {
  const ds = ymd(date)
  return scheduleOverrides
    .filter((e) => e.action === "cover" && e.date === ds && e.clinic === clinic)
    .map((e) => ({ init: e.init, note: e.note }))
}

/** Comma-separated clinic codes a provider appears at in either A or B week. */
export function getProviderClinicsFromSchedule(
  init: string, scheduleA: WeekSchedule, scheduleB: WeekSchedule, clinicMeta: Record<string, ClinicMeta>,
): string {
  if (!init) return ""
  const clinics = new Set<string>()
  for (const sched of [scheduleA, scheduleB]) {
    for (const code of Object.keys(sched)) {
      if (clinicMeta[code]?.isSurgery) continue
      for (const day of DAYS) {
        if (sched[code]?.[day]?.includes(init)) clinics.add(code)
      }
    }
  }
  return Array.from(clinics).join(",")
}
