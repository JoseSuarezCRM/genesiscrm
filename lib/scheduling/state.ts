// Hydrate the saved org-wide state over the seed defaults, and build the save
// payload. Mirrors the v10 dashboard's import/export logic.
//
// The live saved row was written by the v9 app, so this also upgrades it: v10
// adds msNotes, customRoles, provider.location, staff.fte/startDate, and turns
// the on-call PA from one name per week into one per day. Every upgrade is a
// default-fill — nothing in the v9 payload is dropped, including the inert
// scheduleLocks/optimizerRules the removed optimizer left behind.

import { DAYS, WEEKDAYS } from "./constants"
import { makeSeedState, emptyWeekSchedule } from "./seed"
import { migrateStaffDayAvail } from "./staffing"
import { taskGetAssignees } from "./tasks"
import type { DailyTask, OnCallWeek, SchedulingData } from "./types"

export const STATE_VERSION = 10

/** Normalize legacy task shapes ({assignees} or per-day strings) to per-day arrays. */
function normalizeDailyTasks(tasks: any[]): DailyTask[] {
  return (tasks || []).map((t: any) => {
    if (t.assignees !== undefined && !t.MON) {
      const a = taskGetAssignees(t.assignees)
      return { name: t.name, MON: a, TUE: [...a], WED: [...a], THU: [...a], FRI: [...a] }
    }
    const out: any = { name: t.name }
    for (const day of WEEKDAYS) out[day] = taskGetAssignees(t[day])
    return out as DailyTask
  })
}

/** v9 stored one PA for the whole week; v10 stores one per day. */
function normalizeOnCall(raw: any): Record<string, OnCallWeek> {
  const out: Record<string, OnCallWeek> = {}
  for (const [key, v] of Object.entries(raw ?? {})) {
    if (typeof v === "string") {
      const week: OnCallWeek = {}
      for (const day of DAYS) week[day] = v
      out[key] = week
    } else if (v && typeof v === "object") {
      out[key] = v as OnCallWeek
    }
  }
  return out
}

export function mergeSavedState(saved: any): SchedulingData {
  const s = makeSeedState()
  if (!saved || typeof saved !== "object") return s

  const assign = <K extends keyof SchedulingData>(k: K) => {
    if (saved[k] != null) (s as any)[k] = saved[k]
  }
  assign("providers"); assign("currentStaff"); assign("incomingInterns")
  assign("ptoEntries"); assign("scheduleOverrides"); assign("scheduleA"); assign("scheduleB")
  assign("iaPreferences"); assign("iaExcludedClinics"); assign("iaRotationHistory")
  assign("clinicMeta"); assign("clinicOrder"); assign("surgLocations"); assign("surgAssignments")
  assign("surgLog"); assign("staffingRules"); assign("xrtPreferences"); assign("xrtAssignments")
  assign("xrtRotationHistory"); assign("recurringRules"); assign("clinicRegions")
  assign("staffRegions"); assign("pendingScheduleA"); assign("pendingScheduleB")
  assign("scheduleLocks"); assign("optimizerRules")

  if (saved.staffingRulesExtra != null) s.staffingRulesExtra = saved.staffingRulesExtra
  if (saved.pendingScheduleStartDate != null) s.pendingScheduleStartDate = saved.pendingScheduleStartDate
  if (saved.settings) s.settings = { ...s.settings, ...saved.settings }
  if (saved.dailyTasks) s.dailyTasks = normalizeDailyTasks(saved.dailyTasks)

  s.onCallPASchedule = normalizeOnCall(saved.onCallPASchedule)

  // --- v10 additions: absent in the v9 row, defaulted here ---
  s.msNotes = (saved.msNotes && typeof saved.msNotes === "object") ? saved.msNotes : {}
  s.customRoles = Array.isArray(saved.customRoles) ? saved.customRoles : []
  for (const p of s.providers) if (p.location == null) p.location = ""
  for (const st of s.currentStaff) {
    if (st.fte == null) st.fte = 1.0
    if (st.startDate == null) st.startDate = ""
  }

  // Full rawVolume (our own persistence) or a legacy extraVolume merge (import file).
  if (Array.isArray(saved.rawVolume) && saved.rawVolume.length) {
    s.rawVolume = saved.rawVolume
  } else if (Array.isArray(saved.extraVolume) && saved.extraVolume.length) {
    for (const entry of saved.extraVolume) {
      const idx = s.rawVolume.findIndex(
        (v) => v.month === entry.month && v.year === entry.year && v.clinic === entry.clinic
      )
      if (idx >= 0) s.rawVolume[idx] = entry
      else s.rawVolume.push(entry)
    }
  }

  migrateStaffDayAvail(s.currentStaff)
  for (const code of Object.keys(s.clinicMeta)) {
    if (s.clinicMeta[code].xrNeed === undefined) s.clinicMeta[code].xrNeed = false
  }
  // A clinic added to the order but missing from a schedule would break the grid.
  for (const sched of [s.scheduleA, s.scheduleB]) {
    for (const code of s.clinicOrder) if (!sched[code]) sched[code] = emptyWeekSchedule([code])[code]
  }

  s.version = STATE_VERSION
  return s
}

/** The org-wide payload we persist (the full state; nothing is view-scoped). */
export function buildSavePayload(data: SchedulingData): SchedulingData {
  return { ...data, version: STATE_VERSION }
}
