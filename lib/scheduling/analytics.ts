// Analytics/computation helpers ported from the original dashboard (clinicCalcs,
// getLiveCoverage, buildTimeline). Pure — all state passed in via `data`.
import { DAYS } from "./constants"
import { d, monday, addDays, dateLe, weekType, getSchedForWeek, freqMult } from "./dates"
import { providerActive, isOnPTO } from "./providers"
import { recentAvg, volumeTrend, clinicVolumeData } from "./volume"
import type { SchedulingData } from "./types"

export interface LiveCoverage {
  normalDays: number
  activeDays: number
  gaps: { day: string; absent: string[] }[]
  pct: number
  liveProviders: string[]
}

export function getLiveCoverage(
  data: SchedulingData, weekStart: Date
): Record<string, LiveCoverage> {
  const sched = getSchedForWeek(weekStart, data.settings.startWeek, data.scheduleA, data.scheduleB)
  const result: Record<string, LiveCoverage> = {}
  for (const code of data.clinicOrder) {
    const s = sched[code] || {}
    let normalDays = 0, activeDays = 0
    const gaps: { day: string; absent: string[] }[] = []
    const liveProviders = new Set<string>()
    for (let di = 0; di < DAYS.length; di++) {
      const day = DAYS[di]
      const date = addDays(weekStart, di)
      const baseProvs = s[day] || []
      if (!baseProvs.length) continue
      normalDays++
      const activeToday = baseProvs.filter((init) => {
        const p = data.providers.find((pr) => pr.init === init)
        if (p && !providerActive(p, weekStart)) return false
        if (isOnPTO(init, date, data.ptoEntries, data.recurringRules)) return false
        return true
      })
      if (activeToday.length > 0) {
        activeDays++
        activeToday.forEach((i) => liveProviders.add(i))
      } else {
        const absent = baseProvs.filter((init) => {
          const p = data.providers.find((pr) => pr.init === init)
          if (p && !providerActive(p, weekStart)) return true
          return isOnPTO(init, date, data.ptoEntries, data.recurringRules)
        })
        gaps.push({ day, absent })
      }
    }
    result[code] = {
      normalDays, activeDays, gaps,
      pct: normalDays > 0 ? Math.round((activeDays / normalDays) * 100) : 100,
      liveProviders: Array.from(liveProviders),
    }
  }
  return result
}

export interface ClinicCalc {
  code: string
  meta: SchedulingData["clinicMeta"][string]
  avgVol: number
  trend: number | null
  allVols: ReturnType<typeof clinicVolumeData>
  provDays: number
  assignedProvs: { init: string; name: string; ptsDay: number; daysHere: number }[]
  weeklyCapacity: number
  monthlyCapacity: number
  utilization: number
  ptsPerProvDay: number
  gap: number
  status: "understaffed" | "overstaffed" | "balanced"
  live: LiveCoverage
  liveProvDays: number
  liveCapacity: number
  liveUtil: number
}

export function clinicCalcs(
  data: SchedulingData, now: Date, clinicBaseWeek: "A" | "B"
): ClinicCalc[] {
  const target = +data.settings.targetPts || 30
  const dpm = +data.settings.daysPerMonth || 21
  const sched = clinicBaseWeek === "B" ? data.scheduleB : data.scheduleA
  let liveWeek = d(data.settings.startWeek) || monday(new Date())
  liveWeek = monday(liveWeek)
  const liveCov = getLiveCoverage(data, liveWeek)
  const results: ClinicCalc[] = []
  for (const code of data.clinicOrder) {
    const meta = data.clinicMeta[code]
    if (!meta) continue
    const avgVol = recentAvg(code, data.rawVolume)
    const trend = volumeTrend(code, data.rawVolume)
    const allVols = clinicVolumeData(code, data.rawVolume)
    const s = sched[code] || {}
    let provDays = 0
    const assignedProvs: ClinicCalc["assignedProvs"] = []
    const seen = new Set<string>()
    for (const day of DAYS) {
      ;(s[day] || []).forEach((init) => {
        provDays++
        if (!seen.has(init)) {
          seen.add(init)
          const p = data.providers.find((pr) => pr.init === init)
          const dh = DAYS.filter((dd) => (s[dd] || []).includes(init)).length
          assignedProvs.push({ init, name: p ? p.name : init, ptsDay: p ? p.ptsDay : target, daysHere: dh })
        }
      })
    }
    const weeklyCapacity = provDays * target
    const monthlyCapacity = Math.round(weeklyCapacity * (dpm / 5))
    const utilization = monthlyCapacity > 0 ? Math.round((avgVol / monthlyCapacity) * 100) : 0
    const ptsPerProvDay = provDays > 0 ? Math.round((avgVol / dpm / provDays) * 5 * 10) / 10 : 0
    const gap = Math.round(avgVol - monthlyCapacity)
    const status = utilization > 110 ? "understaffed" : utilization < 70 ? "overstaffed" : "balanced"
    const live = liveCov[code] || { normalDays: provDays, activeDays: provDays, pct: 100, gaps: [], liveProviders: [] }
    const liveProvDays = live.activeDays
    const liveCapacity = Math.round(liveProvDays * target * (dpm / 5))
    const liveUtil = liveCapacity > 0 ? Math.round((avgVol / liveCapacity) * 100) : utilization
    results.push({
      code, meta, avgVol, trend, allVols, provDays, assignedProvs,
      weeklyCapacity: Math.round(weeklyCapacity), monthlyCapacity, utilization, ptsPerProvDay,
      gap, status, live, liveProvDays, liveCapacity, liveUtil,
    })
  }
  return results.sort((a, b) => b.utilization - a.utilization)
}

export interface OrgKpis {
  activeCount: number
  rosterCount: number
  totalVol: number
  totalCap: number
  totalUtil: number
  under: number
  over: number
  clinicCount: number
}

export function orgKpis(data: SchedulingData, calcs: ClinicCalc[]): OrgKpis {
  const totalVol = calcs.reduce((s, c) => s + c.avgVol, 0)
  const totalCap = calcs.reduce((s, c) => s + c.monthlyCapacity, 0)
  const totalUtil = totalCap > 0 ? Math.round((totalVol / totalCap) * 100) : 0
  const activeCount = data.providers.filter((p) => providerActive(p, monday(new Date()))).length
  return {
    activeCount,
    rosterCount: data.providers.length,
    totalVol,
    totalCap,
    totalUtil,
    under: calcs.filter((c) => c.utilization > 110).length,
    over: calcs.filter((c) => c.utilization < 70).length,
    clinicCount: data.clinicOrder.length,
  }
}

export interface TimelineRow {
  weekStart: Date
  wType: "A" | "B"
  activeNames: string[]
  activeCount: number
  totalProvDays: number
  weeklyCapacity: number
  projVolume: number
  surplus: number
  util: number
  events: string[]
}

export function buildTimeline(data: SchedulingData): {
  rows: TimelineRow[]
  worstUtil: number
  worstWeek: Date | null
  weeksOver100: number
} {
  let startDate = d(data.settings.startWeek) || monday(new Date())
  startDate = monday(startDate)
  const weeks = +data.settings.weeksProject || 26
  const target = +data.settings.targetPts || 30
  const dpm = +data.settings.daysPerMonth || 21
  const growthMo = (+data.settings.growthPct || 0) / 100
  const baseWeekly: Record<string, number> = {}
  for (const code of data.clinicOrder) baseWeekly[code] = recentAvg(code, data.rawVolume) / (dpm / 5)
  let worstUtil = 0
  let worstWeek: Date | null = null
  let weeksOver100 = 0
  const rows: TimelineRow[] = []
  for (let i = 0; i < weeks; i++) {
    const ws = addDays(startDate, i * 7)
    const wType = weekType(ws, data.settings.startWeek)
    const growthFactor = Math.pow(1 + growthMo, i / 4.33)
    let totalProvDays = 0
    let activeCount = 0
    const activeNames: string[] = []
    data.providers.forEach((p) => {
      if (!providerActive(p, ws)) return
      activeCount++
      activeNames.push(p.init)
      totalProvDays += p.clinicDays * freqMult(p.freq)
    })
    const weeklyCapacity = totalProvDays * target
    const projVolume = Math.round(
      Object.values(baseWeekly).reduce((s, v) => s + v * growthFactor, 0)
    )
    const surplus = weeklyCapacity - projVolume
    const util = weeklyCapacity > 0 ? Math.round((projVolume / weeklyCapacity) * 100) : 0
    if (util > worstUtil) { worstUtil = util; worstWeek = ws }
    if (util > 100) weeksOver100++
    const events: string[] = []
    const weekEnd = addDays(ws, 6)
    data.providers.forEach((p) => {
      const lv = d(p.leave); if (lv && dateLe(ws, lv) && dateLe(lv, weekEnd)) events.push(p.init + " leave")
      const rt = d(p.ret); if (rt && dateLe(ws, rt) && dateLe(rt, weekEnd)) events.push(p.init + " returns")
      const st = d(p.start); if (st && dateLe(ws, st) && dateLe(st, weekEnd)) events.push(p.init + " starts")
    })
    rows.push({ weekStart: ws, wType, activeNames, activeCount, totalProvDays, weeklyCapacity, projVolume, surplus, util, events })
  }
  return { rows, worstUtil, worstWeek, weeksOver100 }
}
