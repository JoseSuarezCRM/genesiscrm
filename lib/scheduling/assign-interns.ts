// Intern/MA/FD assignment engine ported from the original dashboard, refactored to
// pure functions. State is passed in; results are returned for the caller to persist.
import { WEEKDAYS } from "./constants"
import { addDays, getSchedForWeek } from "./dates"
import { providerActive, isOnPTO, isOutOverride, getCoverOverrides } from "./providers"
import { getStaffingRequirement } from "./staffing"
import { ROLE_CAN_FILL } from "./constants"
import type { SchedulingData } from "./types"

export interface ActiveIntern {
  name: string
  init: string
  key: string
  avail: number
  dayAvail: Record<string, string>
  role: string
  lastResort: boolean
  canFillRoles: string[]
}

export interface WeekDay {
  dayIdx: number
  label: string
  dateStr: string
  date: Date
  dayName: string
}

export function iaGetWeekDays(weekStart: Date): WeekDay[] {
  const days: WeekDay[] = []
  for (let i = 0; i < 5; i++) {
    const dt = addDays(weekStart, i)
    days.push({
      dayIdx: i,
      label: WEEKDAYS[i],
      dateStr: dt.getMonth() + 1 + "/" + dt.getDate(),
      date: dt,
      dayName: WEEKDAYS[i],
    })
  }
  return days
}

export function iaProviderAtClinic(
  data: SchedulingData, clinicCode: string, dayName: string, weekStart: Date
): string[] {
  const sched = getSchedForWeek(weekStart, data.settings.startWeek, data.scheduleA, data.scheduleB)
  return (sched[clinicCode] && sched[clinicCode][dayName]) || []
}

export function iaGetActiveInterns(data: SchedulingData, weekStart: Date): ActiveIntern[] {
  const active: ActiveIntern[] = []
  const weekEnd = addDays(weekStart, 4)
  data.currentStaff.forEach((s) => {
    if (s.role === "XR Tech") return
    const ld = s.lastDay ? new Date(s.lastDay + "T00:00:00") : null
    if (ld && ld < weekStart) return
    const canFill = ROLE_CAN_FILL[s.role] || ["MA", "FD"]
    active.push({
      name: s.name, init: s.init || s.name, key: s.init || s.name, avail: s.avail,
      dayAvail: (s.dayAvail as any) || {}, role: s.role, lastResort: !!s.lastResort, canFillRoles: canFill,
    })
  })
  const orientDays = +data.settings.orientDays || 7
  data.incomingInterns.forEach((s) => {
    const st = s.start ? new Date(s.start + "T00:00:00") : null
    if (!st || st > weekEnd) return
    const orientEnd = addDays(st, orientDays)
    if (orientEnd > weekEnd) return
    active.push({ name: s.name, init: s.name, key: s.name, avail: s.avail, dayAvail: {}, role: "Incoming", lastResort: false, canFillRoles: ["MA", "FD"] })
  })
  active.sort((a, b) => (a.lastResort ? 1 : 0) - (b.lastResort ? 1 : 0))
  return active
}

export function iaGetAvailableForDay(interns: ActiveIntern[], dayIdx: number): ActiveIntern[] {
  const dayKey = WEEKDAYS[dayIdx]
  return interns
    .filter((intern) => {
      const dayState = (intern.dayAvail || {})[dayKey] || "available"
      return dayState !== "unavailable"
    })
    .map((intern) => {
      const dayState = (intern.dayAvail || {})[dayKey] || "available"
      return { ...intern, lastResort: dayState === "lastresort" || intern.lastResort }
    })
}

export function isClinicInRegion(data: SchedulingData, code: string, regionName: string): boolean {
  if (regionName === "City") {
    const assigned = new Set<string>()
    Object.entries(data.clinicRegions).forEach(([name, list]) => { if (name !== "City") list.forEach((c) => assigned.add(c)) })
    return data.clinicOrder.filter((c) => !assigned.has(c) && !data.clinicMeta[c]?.isSurgery).includes(code)
  }
  return (data.clinicRegions[regionName] || []).includes(code)
}

// Ensure every active intern has a preference list (returns updated maps).
export function ensureInternPreferences(data: SchedulingData): {
  iaPreferences: Record<string, string[]>
  iaExcludedClinics: Record<string, string[]>
} {
  const iaPreferences: Record<string, string[]> = structuredClone(data.iaPreferences)
  const iaExcludedClinics: Record<string, string[]> = structuredClone(data.iaExcludedClinics)
  const weekStart = new Date()
  const allInterns = iaGetActiveInterns(data, weekStart)
  allInterns.forEach((intern) => {
    if (!iaExcludedClinics[intern.key]) iaExcludedClinics[intern.key] = []
    const excluded = iaExcludedClinics[intern.key]
    if (!iaPreferences[intern.key]) {
      iaPreferences[intern.key] = data.clinicOrder.filter((c) => !excluded.includes(c))
    }
    data.clinicOrder.forEach((code) => {
      if (!iaPreferences[intern.key].includes(code) && !excluded.includes(code)) iaPreferences[intern.key].push(code)
    })
    iaPreferences[intern.key] = iaPreferences[intern.key].filter((c) => data.clinicOrder.includes(c) && !excluded.includes(c))
    iaExcludedClinics[intern.key] = excluded.filter((c) => data.clinicOrder.includes(c))
  })
  return { iaPreferences, iaExcludedClinics }
}

// Generate a week of intern assignments. Returns the per-(intern-day) map plus the
// updated cumulative rotation history.
export function generateInternAssignments(
  data: SchedulingData,
  weekStart: Date,
  iaVolumes: Record<string, number>,
  iaManualOverrides: Record<string, string>
): { assignments: Record<string, string>; rotationHistory: Record<string, Record<string, number>> } {
  const days = iaGetWeekDays(weekStart)
  const allInterns = iaGetActiveInterns(data, weekStart)
  const iaAssignments: Record<string, string> = {}
  const iaPreferences = ensureInternPreferences(data).iaPreferences
  const excluded = data.iaExcludedClinics

  days.forEach((dd) => {
    const activeClinics = data.clinicOrder.filter((code) => {
      if (data.clinicMeta[code]?.isSurgery) return false
      const vol = iaVolumes[code + "-" + dd.dayIdx] || 0
      if (vol <= 0) return false
      const provs = iaProviderAtClinic(data, code, dd.dayName, weekStart)
      const activeProvs = provs.filter((init) => {
        const p = data.providers.find((pr) => pr.init === init)
        if (p && !providerActive(p, weekStart)) return false
        if (isOnPTO(init, dd.date, data.ptoEntries, data.recurringRules)) return false
        if (isOutOverride(init, dd.date, code, data.scheduleOverrides, data.recurringRules)) return false
        return true
      })
      const covers = getCoverOverrides(dd.date, code, data.scheduleOverrides)
      return activeProvs.length + covers.length > 0
    })

    const clinicNeed: Record<string, number> = {}
    activeClinics.forEach((code) => {
      const vol = iaVolumes[code + "-" + dd.dayIdx] || 0
      const req = getStaffingRequirement(vol, data.staffingRules, data.staffingRulesExtra)
      const xrSlots = data.clinicMeta[code]?.xrNeed ? 1 : 0
      clinicNeed[code] = Math.max(1, req.totalStaff - xrSlots)
    })

    const available = iaGetAvailableForDay(allInterns, dd.dayIdx)
    const internAssignment: Record<string, string> = {}
    const clinicAssigned: Record<string, string[]> = {}
    activeClinics.forEach((c) => (clinicAssigned[c] = []))

    const regularStaff = available.filter((i) => !i.lastResort)
    const lastResortStaff = available.filter((i) => i.lastResort)

    available.forEach((intern) => {
      const oKey = intern.key + "-" + dd.dayIdx
      if (iaManualOverrides[oKey]) {
        const ov = iaManualOverrides[oKey]
        internAssignment[intern.key] = ov
        if (clinicAssigned[ov]) clinicAssigned[ov].push(intern.key)
      }
    })

    const sortedClinics = [...activeClinics].sort((a, b) => (clinicNeed[b] || 1) - (clinicNeed[a] || 1))
    const maxPasses = Math.max(...Object.values(clinicNeed), 1)
    for (let pass = 0; pass < maxPasses; pass++) {
      sortedClinics.forEach((code) => {
        const need = clinicNeed[code] || 1
        if ((clinicAssigned[code] || []).length >= need) return
        let bestCandidate: ActiveIntern | null = null
        let bestScore = Infinity
        regularStaff.forEach((intern) => {
          if (internAssignment[intern.key]) return
          if ((excluded[intern.key] || []).includes(code)) return
          const prefs = iaPreferences[intern.key] || []
          let prefIdx = prefs.indexOf(code)
          if (prefIdx < 0) prefIdx = 99
          const histCount = (data.iaRotationHistory[intern.key] || {})[code] || 0
          const regionBonus = data.staffRegions[intern.key] && isClinicInRegion(data, code, data.staffRegions[intern.key]) ? -30 : 0
          const score = prefIdx + histCount * 10 + regionBonus
          if (score < bestScore) { bestScore = score; bestCandidate = intern }
        })
        if (bestCandidate) {
          const bc = bestCandidate as ActiveIntern
          internAssignment[bc.key] = code
          clinicAssigned[code].push(bc.key)
        }
      })
    }

    regularStaff.forEach((intern) => { if (!internAssignment[intern.key]) internAssignment[intern.key] = "Extra/Admin" })

    const underStaffed = activeClinics.filter((c) => (clinicAssigned[c] || []).length < (clinicNeed[c] || 1))
    const unassignedLR = lastResortStaff.filter((i) => !internAssignment[i.key])
    underStaffed.forEach((code) => {
      while ((clinicAssigned[code] || []).length < (clinicNeed[code] || 1) && unassignedLR.length) {
        const best = unassignedLR.shift()!
        internAssignment[best.key] = code
        clinicAssigned[code].push(best.key)
      }
    })
    lastResortStaff.forEach((intern) => { if (!internAssignment[intern.key]) internAssignment[intern.key] = "Extra/Admin" })

    Object.entries(internAssignment).forEach(([key, clinic]) => { iaAssignments[key + "-" + dd.dayIdx] = clinic })
    allInterns.forEach((intern) => {
      if (!available.some((i) => i.key === intern.key)) iaAssignments[intern.key + "-" + dd.dayIdx] = "Off"
    })
  })

  // Update rotation history cumulatively.
  const rotationHistory: Record<string, Record<string, number>> = structuredClone(data.iaRotationHistory)
  days.forEach((dd) => {
    allInterns.forEach((intern) => {
      const a = iaAssignments[intern.key + "-" + dd.dayIdx]
      if (a && a !== "Extra/Admin" && a !== "Off") {
        if (!rotationHistory[intern.key]) rotationHistory[intern.key] = {}
        rotationHistory[intern.key][a] = (rotationHistory[intern.key][a] || 0) + 1
      }
    })
  })

  return { assignments: iaAssignments, rotationHistory }
}
