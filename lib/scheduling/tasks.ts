// Daily-task assignee handling. Ported from docs/GenesisDashboard-3.html (v10).

import type { ClinicMeta, DailyTask, Provider, StaffMember } from "./types"

/** Accept an array, a legacy "A/B, C" string, or nothing. */
export function taskGetAssignees(val: unknown): string[] {
  if (Array.isArray(val)) return val.filter((v): v is string => typeof v === "string")
  if (!val || typeof val !== "string") return []
  return val.split(/[,/]/).map((s) => s.trim()).filter(Boolean)
}

/** Tasks that are never assigned to a provider. */
const NO_PROVIDER_TASKS = ["CC Rep", "Voicemail (CV)", "Referrals", "PT Notes", "Spanish Calls"]

export interface TaskPerson {
  init: string
  name: string
  isGroup?: boolean
  isClinic?: boolean
}

/**
 * Everyone selectable for a task: staff always, providers unless the task is one
 * of the front-office ones, the two "All MA"/"All FD" groups, plus the clinics
 * themselves for PT Notes (which is tracked per clinic, not per person).
 */
export function getAllTaskPeople(
  taskName: string,
  providers: Provider[],
  currentStaff: StaffMember[],
  clinicOrder: string[],
  clinicMeta: Record<string, ClinicMeta>,
): TaskPerson[] {
  const isNoProv = NO_PROVIDER_TASKS.some((t) => taskName && taskName.toLowerCase() === t.toLowerCase())
  const people: TaskPerson[] = []
  if (!isNoProv) people.push(...providers.map((p) => ({ init: p.init, name: p.name })))
  people.push(...currentStaff.map((s) => ({ init: s.init || s.name, name: s.name })))
  people.push({ init: "All MA", name: "All Medical Assistants", isGroup: true })
  people.push({ init: "All FD", name: "All Front Desk", isGroup: true })
  if (taskName && taskName.toLowerCase() === "pt notes") {
    for (const c of clinicOrder) {
      if (clinicMeta[c]?.isSurgery) continue
      people.push({ init: c, name: clinicMeta[c]?.full ?? c, isClinic: true })
    }
  }
  return people
}

export function emptyTask(name = ""): DailyTask {
  return { name, MON: [], TUE: [], WED: [], THU: [], FRI: [] }
}
