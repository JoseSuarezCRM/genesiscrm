// Intern / MA / FD assignment engine. Ported from docs/GenesisDashboard-3.html
// (version 10, iaGenerateAssignments).
//
// In v10 this runs from one button on Schedule Builder → Visit Count, and its
// output is only ever seen as chips on the Full Schedule grid and in My Schedule.
// There is no fairness or calendar screen any more, so the rotation history is
// written but never displayed — it still matters, because it is what keeps the
// engine from sending the same person to the same clinic every week.

import { addDays, d, weekType } from "./dates"
import { EXTRA_ADMIN, OFF, ROLE_CAN_FILL, WEEKDAYS } from "./constants"
import { isXrtRole, getStaffingRequirement } from "./staffing"
import { isOnPTO, isOutOverride, getCoverOverrides, providerActive } from "./providers"
import { isClinicInRegion } from "./regions"
import type { SchedulingData } from "./types"

export interface ActiveIntern {
  name: string
  init: string
  key: string
  role: string
  dayAvail: Record<string, string>
  lastResort: boolean
  canFillRoles: string[]
}

export interface WeekDay {
  dayIdx: number
  label: string
  dateStr: string
  date: Date
  dayName: (typeof WEEKDAYS)[number]
}

/** The five weekdays of a week, with the labels the Visit Count header uses. */
export function getWeekDays(weekStart: Date): WeekDay[] {
  const out: WeekDay[] = []
  for (let i = 0; i < 5; i++) {
    const dt = addDays(weekStart, i)
    out.push({
      dayIdx: i,
      label: WEEKDAYS[i],
      dateStr: `${dt.getMonth() + 1}/${dt.getDate()}`,
      date: dt,
      dayName: WEEKDAYS[i],
    })
  }
  return out
}

/** Provider initials the A/B schedule places at a clinic on a weekday. */
export function providerAtClinic(
  data: SchedulingData, weekStart: Date, clinicCode: string, dayName: string,
): string[] {
  const sched = weekTypeSchedule(data, weekStart)
  return sched[clinicCode]?.[dayName as (typeof WEEKDAYS)[number]] || []
}

function weekTypeSchedule(data: SchedulingData, weekStart: Date) {
  return weekType(weekStart, data.settings.startWeek) === "A" ? data.scheduleA : data.scheduleB
}

/**
 * Providers actually working a clinic-day: scheduled and active, minus PTO and
 * out-overrides, plus anyone covering.
 */
export function activeProvidersAt(
  data: SchedulingData, weekStart: Date, code: string, dayName: string, date: Date,
): { scheduled: string[]; covers: string[] } {
  const scheduled = providerAtClinic(data, weekStart, code, dayName).filter((init) => {
    const p = data.providers.find((pr) => pr.init === init)
    if (p && !providerActive(p, weekStart)) return false
    if (isOnPTO(init, date, data.ptoEntries, data.recurringRules)) return false
    if (isOutOverride(init, date, code, data.scheduleOverrides, data.recurringRules)) return false
    return true
  })
  const covers = getCoverOverrides(date, code, data.scheduleOverrides).map((c) => c.init)
  return { scheduled, covers }
}

/** Staff eligible for assignment this week: non-XRT, not yet departed, plus started incomings. */
export function getActiveInterns(data: SchedulingData, weekStart: Date): ActiveIntern[] {
  const active: ActiveIntern[] = []
  const weekEnd = addDays(weekStart, 4)

  for (const s of data.currentStaff) {
    if (isXrtRole(s.role)) continue // XRTs run through the XRT engine
    const ld = d(s.lastDay)
    if (ld && ld < weekStart) continue // already departed
    active.push({
      name: s.name,
      init: s.init || s.name,
      key: s.init || s.name,
      role: s.role,
      dayAvail: (s.dayAvail as Record<string, string>) || {},
      lastResort: !!s.lastResort,
      canFillRoles: ROLE_CAN_FILL[s.role] || ["MA", "FD"],
    })
  }

  const orientDays = +data.settings.orientDays || 7
  for (const s of data.incomingInterns) {
    const st = d(s.start)
    if (!st || st > weekEnd) continue // not started yet
    if (addDays(st, orientDays) > weekEnd) continue // still in orientation
    active.push({
      name: s.name, init: s.name, key: s.name, role: "Incoming",
      dayAvail: {}, lastResort: false, canFillRoles: ["MA", "FD"],
    })
  }

  // Regular staff first; last-resort people fall to the end of every pass.
  active.sort((a, b) => (a.lastResort ? 1 : 0) - (b.lastResort ? 1 : 0))
  return active
}

/** Drop anyone unavailable that day; promote a "last resort" day to lastResort. */
export function getAvailableForDay(interns: ActiveIntern[], dayIdx: number): ActiveIntern[] {
  const dayKey = WEEKDAYS[dayIdx]
  return interns
    .filter((i) => (i.dayAvail?.[dayKey] || "available") !== "unavailable")
    .map((i) => ({ ...i, lastResort: (i.dayAvail?.[dayKey] || "available") === "lastresort" || i.lastResort }))
}

/**
 * Give everyone a preference list covering every current clinic, minus their
 * exclusions, and drop clinics that no longer exist. Mutates `data` in place.
 */
export function ensurePreferences(data: SchedulingData, weekStart: Date): void {
  for (const intern of getActiveInterns(data, weekStart)) {
    if (!data.iaExcludedClinics[intern.key]) data.iaExcludedClinics[intern.key] = []
    const excluded = data.iaExcludedClinics[intern.key]
    if (!data.iaPreferences[intern.key]) {
      data.iaPreferences[intern.key] = data.clinicOrder.filter((c) => !excluded.includes(c))
    }
    for (const code of data.clinicOrder) {
      if (!data.iaPreferences[intern.key].includes(code) && !excluded.includes(code)) {
        data.iaPreferences[intern.key].push(code)
      }
    }
    data.iaPreferences[intern.key] = data.iaPreferences[intern.key]
      .filter((c) => data.clinicOrder.includes(c) && !excluded.includes(c))
    data.iaExcludedClinics[intern.key] = excluded.filter((c) => data.clinicOrder.includes(c))
  }
}

/**
 * Assign interns to clinics for a week.
 *
 * Phase 1 fills every open clinic up to its staffing need, busiest first, picking
 * the candidate with the best score — preference rank, plus 10 per previous visit
 * (so rotation spreads), minus 30 if the clinic is in their region. Phase 2 uses
 * last-resort people to close whatever gaps remain. Everyone else is Extra/Admin,
 * and anyone unavailable that day is Off.
 *
 * Returns the assignment map ("<key>-<dayIdx>" -> clinic) and the updated rotation
 * history; the caller decides when to commit them.
 */
export function generateInternAssignments(
  data: SchedulingData,
  weekStart: Date,
  volumes: Record<string, number>,
  manualOverrides: Record<string, string> = {},
): { assignments: Record<string, string>; rotationHistory: Record<string, Record<string, number>> } {
  ensurePreferences(data, weekStart)
  const days = getWeekDays(weekStart)
  const allInterns = getActiveInterns(data, weekStart)
  const assignments: Record<string, string> = {}

  for (const dd of days) {
    // Clinics with patients AND someone to see them.
    const activeClinics = data.clinicOrder.filter((code) => {
      if (data.clinicMeta[code]?.isSurgery) return false
      if ((volumes[`${code}-${dd.dayIdx}`] || 0) <= 0) return false
      const { scheduled, covers } = activeProvidersAt(data, weekStart, code, dd.dayName, dd.date)
      return scheduled.length + covers.length > 0
    })

    // MA/FD slots = total staff minus the XRT the clinic needs.
    const clinicNeed: Record<string, number> = {}
    for (const code of activeClinics) {
      const vol = volumes[`${code}-${dd.dayIdx}`] || 0
      const req = getStaffingRequirement(vol, data.staffingRules, data.staffingRulesExtra)
      const xrSlots = data.clinicMeta[code]?.xrNeed ? 1 : 0
      clinicNeed[code] = Math.max(1, req.totalStaff - xrSlots)
    }

    const available = getAvailableForDay(allInterns, dd.dayIdx)
    const internAssignment: Record<string, string> = {}
    const clinicAssigned: Record<string, string[]> = {}
    for (const c of activeClinics) clinicAssigned[c] = []

    const regularStaff = available.filter((i) => !i.lastResort)
    const lastResortStaff = available.filter((i) => i.lastResort)

    // Manual pins win over everything.
    for (const intern of available) {
      const ov = manualOverrides[`${intern.key}-${dd.dayIdx}`]
      if (ov) {
        internAssignment[intern.key] = ov
        if (clinicAssigned[ov]) clinicAssigned[ov].push(intern.key)
      }
    }

    // --- PHASE 1: fill clinics up to their staffing need ---
    const sortedClinics = [...activeClinics].sort((a, b) => (clinicNeed[b] || 1) - (clinicNeed[a] || 1))
    const maxPasses = Math.max(...Object.values(clinicNeed), 1)
    for (let pass = 0; pass < maxPasses; pass++) {
      for (const code of sortedClinics) {
        const need = clinicNeed[code] || 1
        if ((clinicAssigned[code] || []).length >= need) continue

        let best: ActiveIntern | null = null
        let bestScore = Infinity
        for (const intern of regularStaff) {
          if (internAssignment[intern.key]) continue
          if ((data.iaExcludedClinics[intern.key] || []).includes(code)) continue
          const prefs = data.iaPreferences[intern.key] || []
          let prefIdx = prefs.indexOf(code)
          if (prefIdx < 0) prefIdx = 99
          const histCount = data.iaRotationHistory[intern.key]?.[code] || 0
          const region = data.staffRegions[intern.key]
          const regionBonus =
            region && isClinicInRegion(code, region, data.clinicRegions, data.clinicOrder, data.clinicMeta)
              ? -30 : 0
          const score = prefIdx + histCount * 10 + regionBonus
          if (score < bestScore) { bestScore = score; best = intern }
        }
        if (best) {
          internAssignment[best.key] = code
          clinicAssigned[code].push(best.key)
        }
      }
    }

    for (const intern of regularStaff) {
      if (!internAssignment[intern.key]) internAssignment[intern.key] = EXTRA_ADMIN
    }

    // --- PHASE 2: last-resort staff close the remaining gaps ---
    const underStaffed = activeClinics.filter((c) => (clinicAssigned[c] || []).length < (clinicNeed[c] || 1))
    const unassignedLR = lastResortStaff.filter((i) => !internAssignment[i.key])
    for (const code of underStaffed) {
      while ((clinicAssigned[code] || []).length < (clinicNeed[code] || 1) && unassignedLR.length) {
        const best = unassignedLR.shift()!
        internAssignment[best.key] = code
        clinicAssigned[code].push(best.key)
      }
    }
    for (const intern of lastResortStaff) {
      if (!internAssignment[intern.key]) internAssignment[intern.key] = EXTRA_ADMIN
    }

    for (const [key, clinic] of Object.entries(internAssignment)) {
      assignments[`${key}-${dd.dayIdx}`] = clinic
    }
    for (const intern of allInterns) {
      if (!available.some((i) => i.key === intern.key)) assignments[`${intern.key}-${dd.dayIdx}`] = OFF
    }
  }

  const rotationHistory = bumpRotationHistory(data.iaRotationHistory, allInterns, days, assignments)
  return { assignments, rotationHistory }
}

/** Count each real clinic visit, so the next run spreads people around. */
export function bumpRotationHistory(
  history: Record<string, Record<string, number>>,
  people: { key: string }[],
  days: WeekDay[],
  assignments: Record<string, string>,
): Record<string, Record<string, number>> {
  const next: Record<string, Record<string, number>> = JSON.parse(JSON.stringify(history ?? {}))
  for (const dd of days) {
    for (const person of people) {
      const a = assignments[`${person.key}-${dd.dayIdx}`]
      if (!a || a === EXTRA_ADMIN || a === OFF) continue
      if (!next[person.key]) next[person.key] = {}
      next[person.key][a] = (next[person.key][a] || 0) + 1
    }
  }
  return next
}
