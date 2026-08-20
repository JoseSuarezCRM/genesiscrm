// Merge saved org-wide state over the seed defaults, and build the save payload.
// Mirrors the original dashboard's import/hydrate + export logic.
import { makeSeedState } from "./seed"
import { migrateStaffDayAvail } from "./staffing"
import type { SchedulingData, DailyTask } from "./types"

// Normalize legacy daily-task shapes ({assignees} or per-day strings) to per-day arrays.
function normalizeDailyTasks(tasks: any[]): DailyTask[] {
  return (tasks || []).map((t: any) => {
    if (t.assignees !== undefined && !t.MON) {
      const a = typeof t.assignees === "string"
        ? t.assignees.split(/[,/]/).map((s: string) => s.trim()).filter(Boolean)
        : t.assignees || []
      return { name: t.name, MON: a, TUE: [...a], WED: [...a], THU: [...a], FRI: [...a] }
    }
    ;(["MON", "TUE", "WED", "THU", "FRI"] as const).forEach((day) => {
      if (typeof t[day] === "string")
        t[day] = t[day] ? t[day].split(/[,/]/).map((s: string) => s.trim()).filter(Boolean) : []
    })
    return t
  })
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
  assign("staffRegions"); assign("onCallPASchedule"); assign("pendingScheduleA")
  assign("pendingScheduleB"); assign("scheduleLocks"); assign("optimizerRules")

  if (saved.staffingRulesExtra != null) s.staffingRulesExtra = saved.staffingRulesExtra
  if (saved.pendingScheduleStartDate != null) s.pendingScheduleStartDate = saved.pendingScheduleStartDate
  if (saved.settings) s.settings = { ...s.settings, ...saved.settings }
  if (saved.dailyTasks) s.dailyTasks = normalizeDailyTasks(saved.dailyTasks)

  // Full rawVolume (our own persistence) or legacy extraVolume merge (imported file).
  if (Array.isArray(saved.rawVolume) && saved.rawVolume.length) {
    s.rawVolume = saved.rawVolume
  } else if (Array.isArray(saved.extraVolume) && saved.extraVolume.length) {
    saved.extraVolume.forEach((entry: any) => {
      const idx = s.rawVolume.findIndex(
        (v) => v.month === entry.month && v.year === entry.year && v.clinic === entry.clinic
      )
      if (idx >= 0) s.rawVolume[idx] = entry
      else s.rawVolume.push(entry)
    })
  }

  migrateStaffDayAvail(s.currentStaff)
  Object.keys(s.clinicMeta).forEach((code) => {
    if (s.clinicMeta[code].xrNeed === undefined) s.clinicMeta[code].xrNeed = false
  })
  s.version = 9
  return s
}

// The org-wide payload we persist (full state; excludes only view-scoped ephemera).
export function buildSavePayload(data: SchedulingData): SchedulingData {
  return { ...data, version: 9 }
}
