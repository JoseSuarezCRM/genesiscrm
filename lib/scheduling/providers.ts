// Provider / availability helpers ported from the original dashboard. Globals the
// original read are now passed in explicitly so these stay pure.
import { DAYS } from "./constants"
import { d, addDays, toISODate } from "./dates"
import type {
  Provider, PtoEntry, RecurringRule, ScheduleOverride, WeekSchedule, ClinicMeta,
} from "./types"

export function chipTextColor(hex?: string): string {
  if (!hex || hex.length < 7) return "#fff"
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? "#1a1a2e" : "#fff"
}

export const PALETTE = [
  "#3b82f6", "#ef4444", "#22c55e", "#a855f7", "#f97316", "#14b8a6", "#ec4899",
  "#0ea5e9", "#84cc16", "#f59e0b", "#6366f1", "#10b981", "#f43f5e", "#8b5cf6", "#06b6d4",
]
export function defaultColor(idx: number): string {
  return PALETTE[idx % PALETTE.length]
}

export function getProvColor(init: string, providers: Provider[]): string {
  const p = providers.find((pr) => pr.init === init)
  if (!p) return "#aaa"
  if (p.color) return p.color
  return defaultColor(providers.indexOf(p))
}

export function isCSAProvider(init: string, providers: Provider[]): boolean {
  const p = providers.find((pr) => pr.init === init)
  return !!(p && p.name && p.name.includes("(CSA)"))
}

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

export function isRecurringRuleMatch(rule: RecurringRule, date: Date): boolean {
  if (date.getDay() !== rule.dayOfWeek) return false
  if (rule.startDate) {
    const start = d(rule.startDate)
    if (start && date < start) return false
  }
  const freq = rule.freq
  if (freq === "every") return true
  if (freq === "every-other") {
    const ref = rule.startDate ? d(rule.startDate)! : new Date(2026, 0, 5)
    const diff = Math.floor((date.getTime() - ref.getTime()) / (7 * 24 * 60 * 60 * 1000))
    return diff % 2 === 0
  }
  const dayOfMonth = date.getDate()
  const nthOccurrence = Math.ceil(dayOfMonth / 7)
  if (freq === "1st") return nthOccurrence === 1
  if (freq === "2nd") return nthOccurrence === 2
  if (freq === "3rd") return nthOccurrence === 3
  if (freq === "4th") return nthOccurrence === 4
  if (freq === "last") {
    const nextWeek = new Date(date)
    nextWeek.setDate(dayOfMonth + 7)
    return nextWeek.getMonth() !== date.getMonth()
  }
  return false
}

export function getRecurringRulesForDate(
  init: string, date: Date, recurringRules: RecurringRule[]
): RecurringRule[] {
  return recurringRules.filter((r) => r.person === init && isRecurringRuleMatch(r, date))
}

export function isOnPTO(
  init: string, date: Date, ptoEntries: PtoEntry[], recurringRules: RecurringRule[]
): boolean {
  const hasPTO = ptoEntries.some((pto) => {
    if (pto.person !== init) return false
    const s = d(pto.startDate)!
    const e = d(pto.endDate || pto.startDate)!
    return date.getTime() >= s.getTime() && date.getTime() <= e.getTime()
  })
  if (hasPTO) return true
  return recurringRules.some(
    (r) => r.person === init && r.action === "out-all" && isRecurringRuleMatch(r, date)
  )
}

export function isOutOverride(
  init: string, date: Date, clinic: string,
  scheduleOverrides: ScheduleOverride[], recurringRules: RecurringRule[]
): boolean {
  const ds = toISODate(date)
  if (
    scheduleOverrides.some((e) => {
      if (e.init !== init || e.action === "cover") return false
      if (e.date !== ds) return false
      return e.clinic === "" || e.clinic === clinic
    })
  )
    return true
  if (
    recurringRules.some(
      (r) =>
        r.person === init && r.action === "out-clinic" && r.clinic === clinic &&
        isRecurringRuleMatch(r, date)
    )
  )
    return true
  return false
}

export function getCoverOverrides(
  date: Date, clinic: string, scheduleOverrides: ScheduleOverride[]
): { init: string; note: string }[] {
  const ds = toISODate(date)
  return scheduleOverrides
    .filter((e) => e.action === "cover" && e.date === ds && e.clinic === clinic)
    .map((e) => ({ init: e.init, note: e.note }))
}

export function getProviderClinicsFromSchedule(
  init: string, scheduleA: WeekSchedule, scheduleB: WeekSchedule,
  clinicMeta: Record<string, ClinicMeta>
): string {
  if (!init) return ""
  const clinics = new Set<string>()
  ;[scheduleA, scheduleB].forEach((sched) => {
    Object.keys(sched).forEach((code) => {
      if (clinicMeta[code]?.isSurgery) return
      DAYS.forEach((day) => {
        if (sched[code][day] && sched[code][day].includes(init)) clinics.add(code)
      })
    })
  })
  return Array.from(clinics).join(",")
}
