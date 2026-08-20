// Staffing-rule + staff-role helpers ported from the original dashboard.
import type { StaffMember, StaffingRule } from "./types"

export function staffRoleGroup(role: string): "xrt" | "fd" | "ma" {
  if (role === "XR Tech") return "xrt"
  if (role === "Front Desk") return "fd"
  return "ma" // Lead Intern, Intern 20xx, Careerist
}

export function getStaffingRequirement(
  pts: number, staffingRules: StaffingRule[], staffingRulesExtra: number
): { totalStaff: number; breakdown: string } {
  if (!pts || pts <= 0) return { totalStaff: 0, breakdown: "—" }
  for (const r of staffingRules) {
    if (pts >= r.minPts && pts <= r.maxPts)
      return { totalStaff: r.totalStaff, breakdown: r.breakdown }
  }
  const highest = staffingRules[staffingRules.length - 1]
  if (!highest) return { totalStaff: 1, breakdown: "1 staff" }
  const extra = Math.ceil((pts - highest.maxPts) / staffingRulesExtra)
  return {
    totalStaff: highest.totalStaff + extra,
    breakdown: highest.breakdown + " + " + extra + " additional",
  }
}

// Backfill per-day availability from the legacy single `avail` fraction. Mutates in
// place (matching the original) and returns the array for convenience.
export function migrateStaffDayAvail(currentStaff: StaffMember[]): StaffMember[] {
  const days: (keyof NonNullable<StaffMember["dayAvail"]>)[] = ["MON", "TUE", "WED", "THU", "FRI"]
  currentStaff.forEach((s) => {
    if (s.dayAvail) return
    s.dayAvail = {}
    let availDays = 5
    if (s.avail >= 1) availDays = 5
    else if (s.avail >= 0.8) availDays = 4
    else if (s.avail >= 0.6) availDays = 3
    else if (s.avail >= 0.4) availDays = 2
    else availDays = 1
    days.forEach((day, i) => {
      s.dayAvail![day] = i < availDays ? (s.lastResort ? "lastresort" : "available") : "unavailable"
    })
  })
  return currentStaff
}

export function availOpts(): number[] {
  return [1.0, 0.8, 0.6, 0.4, 0.2]
}
export function availLabel(v: number): string {
  if (v >= 1) return "Full time (1.0)"
  if (v >= 0.8) return "4 days/wk (0.8)"
  if (v >= 0.6) return "3 days/wk (0.6)"
  if (v >= 0.4) return "1–2 days/wk (0.4)"
  return "Occasional (0.2)"
}
