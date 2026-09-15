// XR-tech assignment engine. Ported from docs/GenesisDashboard-3.html (version 10,
// xrtGenerateAssignments). Runs from the same button row as the intern engine on
// Schedule Builder → Visit Count, over the same week and the same volume numbers.
//
// It differs from the intern engine in three ways: it only considers clinics
// flagged `xrNeed`, it has no region bonus and no last-resort phase, and an
// unplaced XRT is "Unassigned" rather than Extra/Admin.

import { d } from "./dates"
import { OFF } from "./constants"
import { isXrtRole, getStaffingRequirement } from "./staffing"
import { activeProvidersAt, bumpRotationHistory, getWeekDays, type WeekDay } from "./assign-interns"
import type { SchedulingData } from "./types"

export const UNASSIGNED = "Unassigned"

export interface ActiveXrt {
  name: string
  init: string
  key: string
  role: string
  avail: number
  dayAvail: Record<string, string>
  lastResort: boolean
}

/** Only clinics that actually need imaging cover. */
export function getXrClinics(data: SchedulingData): string[] {
  return data.clinicOrder.filter((code) => data.clinicMeta[code]?.xrNeed)
}

export function getActiveXRTs(data: SchedulingData, weekStart: Date): ActiveXrt[] {
  const active: ActiveXrt[] = []
  for (const s of data.currentStaff) {
    if (!isXrtRole(s.role)) continue
    const ld = d(s.lastDay)
    if (ld && ld < weekStart) continue
    active.push({
      name: s.name,
      init: s.init || s.name,
      key: s.init || s.name,
      role: s.role,
      avail: s.avail ?? 1,
      dayAvail: (s.dayAvail as Record<string, string>) || {},
      lastResort: !!s.lastResort,
    })
  }
  // Incoming staff have no role yet, so none are treated as XRTs until assigned one.
  active.sort((a, b) => (a.lastResort ? 1 : 0) - (b.lastResort ? 1 : 0))
  return active
}

export function ensureXrtPreferences(data: SchedulingData, weekStart: Date): void {
  const xrClinics = getXrClinics(data)
  for (const xrt of getActiveXRTs(data, weekStart)) {
    if (!data.xrtPreferences[xrt.key]) data.xrtPreferences[xrt.key] = xrClinics.slice()
    for (const code of xrClinics) {
      if (!data.xrtPreferences[xrt.key].includes(code)) data.xrtPreferences[xrt.key].push(code)
    }
    data.xrtPreferences[xrt.key] = data.xrtPreferences[xrt.key].filter((c) => xrClinics.includes(c))
  }
}

/**
 * XRT availability keeps the legacy 0–1 `avail` ladder on top of the per-day
 * states: 0.6 means "not Friday", 0.4 means "Mon/Tue only", 0.2 means "Monday".
 */
function availableForDay(xrts: ActiveXrt[], dd: WeekDay): ActiveXrt[] {
  return xrts.filter((xrt) => {
    const state = xrt.dayAvail?.[dd.dayName]
    if (state === "unavailable") return false
    if (xrt.avail >= 0.8) return true
    if (xrt.avail >= 0.6) return dd.dayIdx < 4
    if (xrt.avail >= 0.4) return dd.dayIdx < 2
    if (xrt.avail >= 0.2) return dd.dayIdx === 0
    return false
  })
}

export function generateXrtAssignments(
  data: SchedulingData,
  weekStart: Date,
  volumes: Record<string, number>,
  manualOverrides: Record<string, string> = {},
): {
  assignments: Record<string, string>
  rotationHistory: Record<string, Record<string, number>>
  error?: string
} {
  ensureXrtPreferences(data, weekStart)
  const days = getWeekDays(weekStart)
  const allXRTs = getActiveXRTs(data, weekStart)
  const xrClinics = getXrClinics(data)
  const assignments: Record<string, string> = {}

  if (!allXRTs.length) {
    return {
      assignments: {},
      rotationHistory: data.xrtRotationHistory,
      error: 'No XR Techs found. Add staff with role "XR Tech" first.',
    }
  }

  for (const dd of days) {
    const activeClinics = xrClinics.filter((code) => {
      if ((volumes[`${code}-${dd.dayIdx}`] || 0) <= 0) return false
      const { scheduled, covers } = activeProvidersAt(data, weekStart, code, dd.dayName, dd.date)
      return scheduled.length + covers.length > 0
    })

    // One tech per clinic, two once the clinic tips into the top staffing tier.
    const clinicNeed: Record<string, number> = {}
    for (const code of activeClinics) {
      const req = getStaffingRequirement(
        volumes[`${code}-${dd.dayIdx}`] || 0, data.staffingRules, data.staffingRulesExtra
      )
      clinicNeed[code] = req.totalStaff >= 5 ? 2 : 1
    }

    const available = availableForDay(allXRTs, dd)
    const assignment: Record<string, string> = {}
    const clinicAssigned: Record<string, string[]> = {}
    for (const c of activeClinics) clinicAssigned[c] = []

    for (const xrt of available) {
      const ov = manualOverrides[`${xrt.key}-${dd.dayIdx}`]
      if (ov) {
        assignment[xrt.key] = ov
        if (clinicAssigned[ov]) clinicAssigned[ov].push(xrt.key)
      }
    }

    const sortedClinics = [...activeClinics].sort((a, b) => (clinicNeed[b] || 1) - (clinicNeed[a] || 1))
    const maxPasses = Math.max(...Object.values(clinicNeed), 1)
    for (let pass = 0; pass < maxPasses; pass++) {
      for (const code of sortedClinics) {
        if ((clinicAssigned[code] || []).length >= (clinicNeed[code] || 1)) continue
        let best: ActiveXrt | null = null
        let bestScore = Infinity
        for (const xrt of available) {
          if (assignment[xrt.key]) continue
          const prefs = data.xrtPreferences[xrt.key] || []
          let prefIdx = prefs.indexOf(code)
          if (prefIdx < 0) prefIdx = 99
          const hist = data.xrtRotationHistory[xrt.key]?.[code] || 0
          const score = prefIdx + hist * 10
          if (score < bestScore) { bestScore = score; best = xrt }
        }
        if (best) {
          assignment[best.key] = code
          clinicAssigned[code].push(best.key)
        }
      }
    }

    for (const xrt of available) {
      if (!assignment[xrt.key]) assignment[xrt.key] = UNASSIGNED
    }
    for (const [key, clinic] of Object.entries(assignment)) {
      assignments[`${key}-${dd.dayIdx}`] = clinic
    }
    for (const xrt of allXRTs) {
      if (!available.some((x) => x.key === xrt.key)) assignments[`${xrt.key}-${dd.dayIdx}`] = OFF
    }
  }

  // UNASSIGNED and OFF are both skipped by bumpRotationHistory's EXTRA_ADMIN/OFF
  // check only for OFF, so filter the unassigned days out first.
  const real = Object.fromEntries(
    Object.entries(assignments).filter(([, v]) => v !== UNASSIGNED)
  )
  const rotationHistory = bumpRotationHistory(data.xrtRotationHistory, allXRTs, days, real)
  return { assignments, rotationHistory }
}
