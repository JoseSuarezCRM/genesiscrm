// Shared task display metadata — labels, colors, and option lists for the HubSpot-
// style task UI. Plain module (no "use server") so client + server can import it.

import type { TaskStatus, TaskType, TaskRepeat, TaskPriority } from "@prisma/client"

// Task stage (status) — five HubSpot stages with pill colors.
export const TASK_STAGES: { value: TaskStatus; label: string; pill: string }[] = [
  { value: "NOT_STARTED", label: "Not Started", pill: "bg-blue-600 text-white" },
  { value: "IN_PROGRESS", label: "In Progress", pill: "bg-teal-600 text-white" },
  { value: "WAITING",     label: "Waiting",     pill: "bg-amber-600 text-white" },
  { value: "COMPLETED",   label: "Completed",   pill: "bg-green-600 text-white" },
  { value: "DEFERRED",    label: "Deferred",    pill: "bg-slate-200 text-slate-700" },
]
export const stageMeta = (s: TaskStatus) => TASK_STAGES.find((x) => x.value === s) ?? TASK_STAGES[0]

export const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: "TODO", label: "To-do" },
  { value: "CALL", label: "Call" },
  { value: "EMAIL", label: "Email" },
]
export const typeLabel = (t: TaskType) => TASK_TYPES.find((x) => x.value === t)?.label ?? "To-do"

export const TASK_REPEATS: { value: TaskRepeat; label: string }[] = [
  { value: "NONE", label: "Does not repeat" },
  { value: "DAILY", label: "Daily" },
  { value: "WEEKDAYS", label: "Every weekday (Mon–Fri)" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
]

export const PRIORITY_LABELS: Record<TaskPriority, string> = { LOW: "Low", NORMAL: "None", HIGH: "High", URGENT: "Urgent" }
export const PRIORITY_DOT: Record<TaskPriority, string> = {
  LOW: "bg-slate-300",
  NORMAL: "bg-slate-300",
  HIGH: "bg-amber-500",
  URGENT: "bg-red-500",
}

// Reminder: minutes before due (null = no reminder).
export const REMINDER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "No reminder" },
  { value: 0, label: "At task due time" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 1440, label: "1 day before" },
  { value: 10080, label: "1 week before" },
]
export const reminderLabel = (m: number | null | undefined) =>
  REMINDER_OPTIONS.find((r) => r.value === (m ?? null))?.label ?? "No reminder"

// Advance a due date for a repeating task (used when a repeat task is completed).
export function nextRepeatDate(from: Date, repeat: TaskRepeat): Date | null {
  const d = new Date(from)
  switch (repeat) {
    case "DAILY": d.setDate(d.getDate() + 1); return d
    case "WEEKLY": d.setDate(d.getDate() + 7); return d
    case "MONTHLY": d.setMonth(d.getMonth() + 1); return d
    case "WEEKDAYS": {
      do { d.setDate(d.getDate() + 1) } while (d.getDay() === 0 || d.getDay() === 6)
      return d
    }
    default: return null
  }
}
