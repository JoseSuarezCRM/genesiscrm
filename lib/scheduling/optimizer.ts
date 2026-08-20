// AI schedule optimizer ported from the original dashboard, refactored to a pure
// function returning recommendations + proposed A/B schedules (no DOM).
import { DAYS } from "./constants"
import { d, monday, freqMult } from "./dates"
import { recentAvg, clinicVolumeData } from "./volume"
import type { SchedulingData, WeekSchedule, ScheduleLock, OptimizerRule, Provider } from "./types"

const WD = DAYS.filter((x) => x !== "SAT")

export function isLocked(locks: ScheduleLock[], init: string, clinic: string, day: string, week: string): boolean {
  return locks.some((l) => l.init === init && l.clinic === clinic && l.day === day && (l.week === "both" || l.week === week))
}

export function getClinicScheduledDays(data: SchedulingData, code: string): number {
  const aDays = WD.filter((day) => (data.scheduleA[code]?.[day] || []).length > 0).length
  const bDays = WD.filter((day) => (data.scheduleB[code]?.[day] || []).length > 0).length
  const avg = (aDays + bDays) / 2
  return avg > 0 ? avg : data.clinicMeta[code]?.daysOpen || 5
}

export function clinicAvgDaily(data: SchedulingData, code: string): number {
  const entries = clinicVolumeData(code, data.rawVolume)
  if (!entries.length) return 0
  const recent = entries.slice(-3)
  const avgMonthly = recent.reduce((s, v) => s + v.visits, 0) / recent.length
  const daysOpen = getClinicScheduledDays(data, code)
  return Math.round(avgMonthly / (4.3 * daysOpen))
}

function getProviderDaysInSchedule(init: string, sched: WeekSchedule): number {
  let count = 0
  Object.keys(sched).forEach((clinic) => { DAYS.forEach((day) => { if ((sched[clinic]?.[day] || []).includes(init)) count++ }) })
  return count
}

function isSurgeon(data: SchedulingData, init: string): boolean {
  const surgClinics = data.clinicOrder.filter((c) => data.clinicMeta[c]?.isSurgery)
  for (const sc of surgClinics) for (const day of DAYS) {
    if ((data.scheduleA[sc]?.[day] || []).includes(init)) return true
    if ((data.scheduleB[sc]?.[day] || []).includes(init)) return true
  }
  return false
}

function ruleAppliesToProvider(data: SchedulingData, rule: OptimizerRule, init: string): boolean {
  if (rule.target === "_all_") return true
  if (rule.target === "_surgeons_") return isSurgeon(data, init)
  return rule.target === init
}

interface Violation { rule: OptimizerRule; init: string; type: string; clinic?: string; days?: string[]; count?: number; max?: number; allowedClinic?: string; regions?: string[]; msg: string }

function checkRuleViolations(data: SchedulingData, init: string, sched: WeekSchedule): Violation[] {
  const violations: Violation[] = []
  data.optimizerRules.forEach((rule) => {
    if (!ruleAppliesToProvider(data, rule, init)) return
    const prov = data.providers.find((p) => p.init === init)
    const provName = prov ? prov.name : init
    if (rule.type === "unique-clinics") {
      const clinicsByDay: Record<string, string[]> = {}
      Object.keys(sched).forEach((code) => {
        if (data.clinicMeta[code]?.isSurgery) return
        WD.forEach((day) => { if ((sched[code]?.[day] || []).includes(init)) { (clinicsByDay[day] = clinicsByDay[day] || []).push(code) } })
      })
      const clinicDays: Record<string, string[]> = {}
      Object.entries(clinicsByDay).forEach(([day, cls]) => cls.forEach((c) => { (clinicDays[c] = clinicDays[c] || []).push(day) }))
      Object.entries(clinicDays).forEach(([c, days]) => { if (days.length > 1) violations.push({ rule, init, type: "unique-clinics", clinic: c, days, msg: `${provName} is at ${c} on ${days.length} days (${days.join(", ")}) — rule requires a different clinic each day` }) })
    }
    if (rule.type === "max-days-at-clinic") {
      Object.keys(sched).forEach((code) => {
        if (data.clinicMeta[code]?.isSurgery) return
        const count = WD.filter((day) => (sched[code]?.[day] || []).includes(init)).length
        if (count > rule.extra) violations.push({ rule, init, type: "max-days-at-clinic", clinic: code, count, max: rule.extra, msg: `${provName} is at ${code} ${count} days/wk (max: ${rule.extra})` })
      })
    }
    if (rule.type === "same-region") {
      const regions = new Set<string>()
      Object.keys(sched).forEach((code) => {
        if (data.clinicMeta[code]?.isSurgery) return
        if (WD.some((day) => (sched[code]?.[day] || []).includes(init))) {
          const region = Object.entries(data.clinicRegions).find(([, cls]) => cls.includes(code))
          if (region) regions.add(region[0])
        }
      })
      if (regions.size > 1) violations.push({ rule, init, type: "same-region", regions: Array.from(regions), msg: `${provName} spans ${regions.size} regions (${Array.from(regions).join(", ")})` })
    }
    if (rule.type === "single-clinic-only" && rule.clinic) {
      Object.keys(sched).forEach((code) => {
        if (code === rule.clinic || data.clinicMeta[code]?.isSurgery) return
        const otherDays = WD.filter((day) => (sched[code]?.[day] || []).includes(init))
        if (otherDays.length) violations.push({ rule, init, type: "single-clinic-only", clinic: code, allowedClinic: rule.clinic, days: otherDays, msg: `${provName} should only be at ${rule.clinic} but is also at ${code} (${otherDays.join(", ")})` })
      })
    }
    if (rule.type === "no-clinic" && rule.clinic) {
      if (WD.some((day) => (sched[rule.clinic]?.[day] || []).includes(init))) violations.push({ rule, init, type: "no-clinic", clinic: rule.clinic, msg: `${provName} is assigned to ${rule.clinic} but the rule prohibits it` })
    }
  })
  return violations
}

export interface Recommendation {
  type: "move" | "add" | "remove" | "dayswap"
  week: "A" | "B"
  day?: string
  fromDay?: string
  toDay?: string
  from?: string
  to?: string
  clinic?: string
  init: string
  reason: string
  impact: number
  priority: "high" | "medium" | "low"
  ruleFlag?: boolean
}

export interface OptimizerResult {
  recommendations: Recommendation[]
  proposedA: WeekSchedule
  proposedB: WeekSchedule
  clinicAnalysis: { code: string; avgDaily: number; full: string }[]
  activeProviders: Provider[]
  targetDateStr: string
}

export function runOptimizer(data: SchedulingData, targetDateStr: string): OptimizerResult {
  const targetDate = targetDateStr ? d(targetDateStr)! : new Date()
  const targetMon = monday(targetDate)
  const clinics = data.clinicOrder.filter((c) => !data.clinicMeta[c]?.isSurgery)
  const activeProviders = data.providers.filter((p) => {
    if (p.clinicDays === 0) return false
    if (p.start && d(p.start)! > targetMon) return false
    if (p.leave && p.ret && d(p.leave)! <= targetDate && d(p.ret)! > targetDate) return false
    return true
  })

  const clinicAnalysis = clinics.map((code) => ({ code, avgDaily: clinicAvgDaily(data, code), full: data.clinicMeta[code]?.full || code }))
  const recommendations: Recommendation[] = []
  const weekLabels: ("A" | "B")[] = ["A", "B"]

  const capOf = (provs: string[]) => provs.reduce((s, init) => { const p = data.providers.find((pr) => pr.init === init); return s + (p ? p.ptsDay : 30) }, 0)

  // Understaffed / overstaffed moves
  weekLabels.forEach((wk) => {
    const sched = wk === "A" ? data.scheduleA : data.scheduleB
    clinics.forEach((code) => {
      const avgDaily = clinicAvgDaily(data, code)
      if (avgDaily === 0) return
      WD.forEach((day) => {
        const provs = [...(sched[code]?.[day] || [])]
        const totalCapacity = capOf(provs)
        const deficit = avgDaily - totalCapacity
        const ratio = totalCapacity > 0 ? avgDaily / totalCapacity : 999
        if (ratio > 1.15 && deficit > 5) {
          const candidates = activeProviders.filter((p) => {
            if (provs.includes(p.init)) return false
            const assignedClinics = p.clinics.split(",").map((s) => s.trim()).filter(Boolean)
            if (!assignedClinics.includes(code) && assignedClinics.length > 0) return false
            if (isLocked(data.scheduleLocks, p.init, code, day, wk)) return false
            let busy = false
            Object.keys(sched).forEach((oc) => { if ((sched[oc]?.[day] || []).includes(p.init)) busy = true })
            return !busy
          })
          let moveCandidate: string | null = null
          let moveFrom: string | null = null
          clinics.forEach((otherCode) => {
            if (otherCode === code) return
            const otherProvs = [...(sched[otherCode]?.[day] || [])]
            if (otherProvs.length < 2) return
            const otherAvg = clinicAvgDaily(data, otherCode)
            const otherCap = capOf(otherProvs)
            if (otherCap > otherAvg * 1.3) {
              otherProvs.forEach((init) => {
                if (moveCandidate) return
                if (isLocked(data.scheduleLocks, init, otherCode, day, wk)) return
                const p = data.providers.find((pr) => pr.init === init)
                if (!p) return
                const ac = p.clinics.split(",").map((s) => s.trim()).filter(Boolean)
                if (ac.includes(code) || ac.length === 0) { moveCandidate = init; moveFrom = otherCode }
              })
            }
          })
          if (moveCandidate) {
            recommendations.push({ type: "move", week: wk, day, from: moveFrom!, to: code, init: moveCandidate, reason: `${code} is understaffed (${avgDaily} pts/day, ${totalCapacity} capacity). ${moveFrom} is overstaffed.`, impact: Math.min(deficit, 25), priority: deficit > 15 ? "high" : "medium" })
          } else if (candidates.length > 0) {
            const scored = candidates.map((p) => {
              const days = getProviderDaysInSchedule(p.init, sched)
              const maxDays = p.clinicDays * freqMult(p.freq)
              const regionMatch = (p.mainRegion || p.secondRegion) ? (Object.entries(data.clinicRegions).some(([rn, cls]) => (rn === p.mainRegion || rn === p.secondRegion) && cls.includes(code)) ? 2 : 0) : 0
              return { p, score: regionMatch - days / maxDays, currentDays: days, maxDays }
            }).sort((a, b) => b.score - a.score)
            const best = scored[0]
            if (best.currentDays < best.maxDays) {
              recommendations.push({ type: "add", week: wk, day, clinic: code, init: best.p.init, reason: `${code} understaffed on ${day} (${avgDaily} pts/day, ${totalCapacity} cap). ${best.p.name} has capacity.`, impact: Math.min(deficit, best.p.ptsDay), priority: deficit > 15 ? "high" : "medium" })
            }
          }
        } else if (ratio < 0.65 && provs.length > 1) {
          const removable = provs.filter((init) => !isLocked(data.scheduleLocks, init, code, day, wk))
          if (removable.length > 0) {
            const bestRemove = removable.map((init) => { const p = data.providers.find((pr) => pr.init === init); return { init, ptsDay: p ? p.ptsDay : 30 } }).sort((a, b) => a.ptsDay - b.ptsDay)[0]
            let reassignTo: string | null = null
            clinics.forEach((otherCode) => {
              if (otherCode === code || reassignTo) return
              const otherAvg = clinicAvgDaily(data, otherCode)
              const otherCap = capOf([...(sched[otherCode]?.[day] || [])])
              if (otherAvg > otherCap * 1.1) {
                const p = data.providers.find((pr) => pr.init === bestRemove.init)
                const ac = p ? p.clinics.split(",").map((s) => s.trim()).filter(Boolean) : []
                if (ac.includes(otherCode) || ac.length === 0) reassignTo = otherCode
              }
            })
            if (reassignTo) recommendations.push({ type: "move", week: wk, day, from: code, to: reassignTo, init: bestRemove.init, reason: `${code} overstaffed on ${day}. ${reassignTo} needs coverage.`, impact: bestRemove.ptsDay, priority: "medium" })
          }
        }
      })
    })
  })

  // Rule-violation fixes (simplified to move/remove to a highest-deficit clinic)
  weekLabels.forEach((wk) => {
    const sched = wk === "A" ? data.scheduleA : data.scheduleB
    activeProviders.forEach((p) => {
      checkRuleViolations(data, p.init, sched).forEach((v) => {
        const findAlt = (day: string, excludeCode: string) => {
          let altClinic: string | null = null; let bestDeficit = -999
          clinics.forEach((code) => {
            if (code === excludeCode) return
            if ((sched[code]?.[day] || []).includes(p.init)) return
            const deficit = clinicAvgDaily(data, code) - capOf([...(sched[code]?.[day] || [])])
            if (deficit > bestDeficit) { bestDeficit = deficit; altClinic = code }
          })
          return { altClinic, bestDeficit }
        }
        if ((v.type === "unique-clinics" || v.type === "max-days-at-clinic") && v.days) {
          const extraDays = v.type === "unique-clinics" ? v.days.slice(1) : v.days.filter((day) => !isLocked(data.scheduleLocks, p.init, v.clinic!, day, wk)).slice(0, (v.count || 0) - (v.max || 0))
          extraDays.forEach((day) => {
            if (isLocked(data.scheduleLocks, p.init, v.clinic!, day, wk)) return
            const { altClinic, bestDeficit } = findAlt(day, v.clinic!)
            if (altClinic && !recommendations.find((r) => r.init === p.init && r.day === day && r.week === wk && (r.to === altClinic || r.clinic === altClinic))) {
              recommendations.push({ type: "move", week: wk, day, from: v.clinic!, to: altClinic, init: p.init, reason: `Rule: ${v.msg}. Moving ${day} to ${altClinic}.`, impact: Math.max(bestDeficit, 5), priority: "medium", ruleFlag: true })
            }
          })
        }
        if (v.type === "single-clinic-only" && v.days) {
          v.days.forEach((day) => {
            if (isLocked(data.scheduleLocks, p.init, v.clinic!, day, wk)) return
            const atAllowed = (sched[v.allowedClinic!]?.[day] || []).includes(p.init)
            if (!atAllowed) recommendations.push({ type: "move", week: wk, day, from: v.clinic!, to: v.allowedClinic!, init: p.init, reason: `Rule: ${v.msg}. Moving to ${v.allowedClinic}.`, impact: 10, priority: "medium", ruleFlag: true })
            else recommendations.push({ type: "remove", week: wk, day, clinic: v.clinic!, init: p.init, reason: `Rule: ${v.msg}. Removing from ${v.clinic}.`, impact: 5, priority: "medium", ruleFlag: true })
          })
        }
        if (v.type === "no-clinic") {
          WD.filter((day) => (sched[v.clinic!]?.[day] || []).includes(p.init)).forEach((day) => {
            if (isLocked(data.scheduleLocks, p.init, v.clinic!, day, wk)) return
            const { altClinic, bestDeficit } = findAlt(day, v.clinic!)
            if (altClinic) recommendations.push({ type: "move", week: wk, day, from: v.clinic!, to: altClinic, init: p.init, reason: `Rule: ${v.msg}. Reassigning to ${altClinic}.`, impact: Math.max(bestDeficit, 5), priority: "high", ruleFlag: true })
          })
        }
      })
    })
  })

  // Dedup
  const seen = new Set<string>()
  const deduped = recommendations.filter((r) => {
    const key = `${r.type}-${r.init}-${r.week}-${r.day || ""}-${r.from || ""}-${r.to || r.clinic || ""}-${r.fromDay || ""}-${r.toDay || ""}`
    if (seen.has(key)) return false
    seen.add(key); return true
  })
  const prioOrder = { high: 0, medium: 1, low: 2 }
  deduped.sort((a, b) => (prioOrder[a.priority] - prioOrder[b.priority]) || b.impact - a.impact)

  // Build proposed schedules
  const proposedA: WeekSchedule = structuredClone(data.scheduleA)
  const proposedB: WeekSchedule = structuredClone(data.scheduleB)
  deduped.forEach((rec) => {
    const sched = rec.week === "A" ? proposedA : proposedB
    if (rec.type === "move") {
      const fromArr = sched[rec.from!]?.[rec.day!]
      if (fromArr) { const fi = fromArr.indexOf(rec.init); if (fi >= 0) fromArr.splice(fi, 1) }
      if (!sched[rec.to!]) sched[rec.to!] = {}
      if (!sched[rec.to!][rec.day!]) sched[rec.to!][rec.day!] = []
      if (!sched[rec.to!][rec.day!].includes(rec.init)) sched[rec.to!][rec.day!].push(rec.init)
    } else if (rec.type === "add") {
      if (!sched[rec.clinic!]) sched[rec.clinic!] = {}
      if (!sched[rec.clinic!][rec.day!]) sched[rec.clinic!][rec.day!] = []
      if (!sched[rec.clinic!][rec.day!].includes(rec.init)) sched[rec.clinic!][rec.day!].push(rec.init)
    } else if (rec.type === "remove") {
      const arr = sched[rec.clinic!]?.[rec.day!]
      if (arr) { const fi = arr.indexOf(rec.init); if (fi >= 0) arr.splice(fi, 1) }
    }
  })

  return { recommendations: deduped, proposedA, proposedB, clinicAnalysis, activeProviders, targetDateStr }
}
