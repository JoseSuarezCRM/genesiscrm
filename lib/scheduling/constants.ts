// Shared constants ported from docs/GenesisDashboard-3.html (version 10).

import type { DayName } from "./types"

/** The grid's columns. SAT exists on the schedule but carries no tasks/assignments. */
export const DAYS: DayName[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT"]

/** Monday–Friday only — assignments, tasks and availability never span Saturday. */
export const WEEKDAYS: DayName[] = ["MON", "TUE", "WED", "THU", "FRI"]

export const DAY_LABELS = ["M", "T", "W", "T", "F", "S"]

export const WEEKDAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

export const BASE_ROLES = [
  "Lead Intern", "Intern 2026", "Intern 2025", "Careerist",
  "XR Tech", "MRI Tech", "XRT/MRI Tech", "Front Desk",
]

/** Which roles can cover which staffing slots (prototype ROLE_CAN_FILL). */
export const ROLE_CAN_FILL: Record<string, string[]> = {
  "Lead Intern": ["MA", "FD"],
  "Intern 2026": ["MA", "FD"],
  "Intern 2025": ["MA", "FD"],
  Careerist: ["MA", "FD"],
  "XR Tech": ["XRT", "MA"],
  "Front Desk": ["FD"],
}

/** Left-border accent per clinic in the Visit Count table. */
export const IA_CLINIC_COLORS: Record<string, string> = {
  SC: "#3b82f6", OB: "#ef4444", LV: "#22c55e", AR: "#f59e0b", JO: "#8b5cf6",
  WG: "#ec4899", HP: "#06b6d4", GU: "#84cc16", PCC: "#f97316", EW: "#6366f1", JC: "#14b8a6",
}

/** Fallback palette for clinics added after the seed. */
export const CLINIC_COLOR_PALETTE = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899",
  "#06b6d4", "#84cc16", "#f97316", "#6366f1", "#14b8a6", "#f43f5e",
]

/** The marker the assignment engines use for "no clinic today". */
export const EXTRA_ADMIN = "Extra/Admin"
export const OFF = "Off"

/** Default volume per scheduled provider; NH is the high-volume exception. */
export const DEFAULT_PTS_PER_PROVIDER = 30
export const HIGH_VOLUME_PROVIDER = "NH"
export const HIGH_VOLUME_PTS = 65
