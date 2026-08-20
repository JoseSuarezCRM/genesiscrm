// XRT assignment engine ported from the original dashboard, as pure functions.
import { WEEKDAYS } from "./constants"
import { addDays } from "./dates"
import { providerActive, isOnPTO, isOutOverride, getCoverOverrides } from "./providers"
import { getStaffingRequirement } from "./staffing"
import { iaGetWeekDays, iaProviderAtClinic } from "./assign-interns"
import type { SchedulingData } from "./types"

export interface ActiveXRT {
  name: string
  init: string
  key: string
  avail: number
  dayAvail: Record<string, string>
  role: string
  lastResort: boolean
  lastDay: string
}

export function xrtGetXrClinics(data: SchedulingData): string[] {
  return data.clinicOrder.filter((code) => data.clinicMeta[code]?.xrNeed)
}

export function xrtGetActiveXRTs(data: SchedulingData, weekStart: Date): ActiveXRT[] {
  const active: ActiveXRT[] = []
  data.currentStaff.forEach((s) => {
    if (s.role !== "XR Tech") return
    const ld = s.lastDay ? new Date(s.lastDay + "T00:00:00") : null
    if (ld && ld < weekStart) return
    active.push({ name: s.name, init: s.init || s.name, key: s.init || s.name, avail: s.avail, dayAvail: (s.dayAvail as any) || {}, role: s.role, lastResort: !!s.lastResort, lastDay: s.lastDay || "" })
  })
  active.sort((a, b) => (a.lastResort ? 1 : 0) - (b.lastResort ? 1 : 0))
  return active
}

export function ensureXrtPreferences(data: SchedulingData, weekStart: Date): Record<string, string[]> {
  const xrClinics = xrtGetXrClinics(data)
  const xrts = xrtGetActiveXRTs(data, weekStart)
  const xrtPreferences: Record<string, string[]> = structuredClone(data.xrtPreferences)
  xrts.forEach((xrt) => {
    if (!xrtPreferences[xrt.key]) xrtPreferences[xrt.key] = xrClinics.slice()
    xrClinics.forEach((code) => { if (!xrtPreferences[xrt.key].includes(code)) xrtPreferences[xrt.key].push(code) })
    xrtPreferences[xrt.key] = xrtPreferences[xrt.key].filter((c) => xrClinics.includes(c))
  })
  return xrtPreferences
}

export function generateXrtAssignments(
  data: SchedulingData,
  weekStart: Date,
  iaVolumes: Record<string, number>,
  xrtManualOverrides: Record<string, string>
): { assignments: Record<string, string>; rotationHistory: Record<string, Record<string, number>> } {
  const days = iaGetWeekDays(weekStart)
  const allXRTs = xrtGetActiveXRTs(data, weekStart)
  const xrClinics = xrtGetXrClinics(data)
  const xrtPreferences = ensureXrtPreferences(data, weekStart)
  const xrtAssignments: Record<string, string> = {}

  days.forEach((dd) => {
    const activeClinics = xrClinics.filter((code) => {
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
      clinicNeed[code] = req.totalStaff >= 5 ? 2 : 1
    })

    const available = allXRTs.filter((xrt) => {
      if (xrt.dayAvail) {
        const ds = xrt.dayAvail[dd.dayName || WEEKDAYS[dd.dayIdx]]
        if (ds === "unavailable") return false
      }
      if (xrt.avail >= 0.8) return true
      if (xrt.avail >= 0.6) return dd.dayIdx < 4
      if (xrt.avail >= 0.4) return dd.dayIdx < 2
      if (xrt.avail >= 0.2) return dd.dayIdx === 0
      return false
    })

    const assignment: Record<string, string> = {}
    const clinicAssigned: Record<string, string[]> = {}
    activeClinics.forEach((c) => (clinicAssigned[c] = []))

    available.forEach((xrt) => {
      const oKey = xrt.key + "-" + dd.dayIdx
      if (xrtManualOverrides[oKey]) {
        const ov = xrtManualOverrides[oKey]
        assignment[xrt.key] = ov
        if (clinicAssigned[ov]) clinicAssigned[ov].push(xrt.key)
      }
    })

    const sortedClinics = [...activeClinics].sort((a, b) => (clinicNeed[b] || 1) - (clinicNeed[a] || 1))
    const maxPasses = Math.max(...Object.values(clinicNeed), 1)
    for (let pass = 0; pass < maxPasses; pass++) {
      sortedClinics.forEach((code) => {
        const need = clinicNeed[code] || 1
        if ((clinicAssigned[code] || []).length >= need) return
        let best: ActiveXRT | null = null
        let bestScore = Infinity
        available.forEach((xrt) => {
          if (assignment[xrt.key]) return
          const prefs = xrtPreferences[xrt.key] || []
          let prefIdx = prefs.indexOf(code)
          if (prefIdx < 0) prefIdx = 99
          const hist = (data.xrtRotationHistory[xrt.key] || {})[code] || 0
          const score = prefIdx + hist * 10
          if (score < bestScore) { bestScore = score; best = xrt }
        })
        if (best) {
          const b = best as ActiveXRT
          assignment[b.key] = code
          clinicAssigned[code].push(b.key)
        }
      })
    }

    available.forEach((xrt) => { if (!assignment[xrt.key]) assignment[xrt.key] = "Unassigned" })
    Object.entries(assignment).forEach(([key, clinic]) => { xrtAssignments[key + "-" + dd.dayIdx] = clinic })
    allXRTs.forEach((xrt) => { if (!available.some((x) => x.key === xrt.key)) xrtAssignments[xrt.key + "-" + dd.dayIdx] = "Off" })
  })

  const rotationHistory: Record<string, Record<string, number>> = structuredClone(data.xrtRotationHistory)
  days.forEach((dd) => {
    allXRTs.forEach((xrt) => {
      const a = xrtAssignments[xrt.key + "-" + dd.dayIdx]
      if (a && a !== "Unassigned" && a !== "Off") {
        if (!rotationHistory[xrt.key]) rotationHistory[xrt.key] = {}
        rotationHistory[xrt.key][a] = (rotationHistory[xrt.key][a] || 0) + 1
      }
    })
  })

  return { assignments: xrtAssignments, rotationHistory }
}
