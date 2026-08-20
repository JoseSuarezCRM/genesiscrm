// Framework-free constants ported verbatim from the original Operations Dashboard.
import type { DayName } from "./types"

export const DAYS: DayName[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT"]
export const WEEKDAYS: DayName[] = ["MON", "TUE", "WED", "THU", "FRI"]

export const monthOrder: Record<string, number> = {
  January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
  July: 6, August: 7, September: 8, October: 9, November: 10, December: 11,
}

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

// raw-volume clinic code -> app clinic code (identity today, kept for parity)
export const volCodeMap: Record<string, string> = {
  AR: "AR", EW: "EW", GU: "GU", HP: "HP", JO: "JO", LV: "LV", OB: "OB", SC: "SC", WG: "WG",
}

export const IA_CLINIC_COLORS: Record<string, string> = {
  SC: "#3b82f6", OB: "#ef4444", LV: "#22c55e", AR: "#f59e0b", JO: "#8b5cf6",
  WG: "#ec4899", HP: "#06b6d4", GU: "#84cc16", PCC: "#f97316", EW: "#6366f1", JC: "#14b8a6",
}

export const PALETTE = [
  "#3b82f6", "#ef4444", "#22c55e", "#a855f7", "#f97316", "#14b8a6", "#ec4899",
  "#0ea5e9", "#84cc16", "#f59e0b", "#6366f1", "#10b981", "#f43f5e", "#8b5cf6", "#06b6d4",
]

// Which role groups each staff role can fill.
export const ROLE_CAN_FILL: Record<string, string[]> = {
  "Lead Intern": ["MA", "FD"],
  "Intern 2026": ["MA", "FD"],
  "Intern 2025": ["MA", "FD"],
  Careerist: ["MA", "FD"],
  "XR Tech": ["XRT", "MA"],
  "Front Desk": ["FD"],
}

export const ALL_STAFF_ROLES = [
  "Lead Intern", "Intern 2026", "Intern 2025", "Careerist", "XR Tech", "Front Desk",
]
