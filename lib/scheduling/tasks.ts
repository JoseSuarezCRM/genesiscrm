// Daily-task assignee helpers ported from the original dashboard.
import type { SchedulingData } from "./types"

export function taskAssignees(val: string[] | string | undefined): string[] {
  if (Array.isArray(val)) return val
  if (!val) return []
  return val.split(/[,/]/).map((s) => s.trim()).filter(Boolean)
}

export interface TaskPerson {
  init: string
  name: string
  isGroup?: boolean
  isClinic?: boolean
}

const NO_PROV_TASKS = ["CC Rep", "Voicemail (CV)", "Referrals", "PT Notes", "Spanish Calls"]

export function getAllTaskPeople(taskName: string, data: SchedulingData): TaskPerson[] {
  const isNoProv = NO_PROV_TASKS.some((t) => taskName && taskName.toLowerCase() === t.toLowerCase())
  const people: TaskPerson[] = []
  if (!isNoProv) people.push(...data.providers.map((p) => ({ init: p.init, name: p.name })))
  people.push(...data.currentStaff.map((s) => ({ init: s.init || s.name, name: s.name })))
  people.push({ init: "All MA", name: "All Medical Assistants", isGroup: true })
  people.push({ init: "All FD", name: "All Front Desk", isGroup: true })
  if (taskName && taskName.toLowerCase() === "pt notes") {
    data.clinicOrder
      .filter((c) => !data.clinicMeta[c]?.isSurgery)
      .forEach((c) => people.push({ init: c, name: data.clinicMeta[c]?.full || c, isClinic: true }))
  }
  return people
}
