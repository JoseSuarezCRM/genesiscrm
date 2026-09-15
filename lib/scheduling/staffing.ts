// Staff role classification, per-day availability, and the staffing-rules engine.
// Ported from docs/GenesisDashboard-3.html (version 10).

import { WEEKDAYS } from "./constants"
import type { AvailState, DayName, StaffMember, StaffingRule } from "./types"

/** Legacy 0–1 availability values offered in the old roster. */
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

export function isXrtRole(role: string): boolean {
  return role === "XR Tech" || role === "MRI Tech" || role === "XRT/MRI Tech"
}

/** Which roster filter chip a role belongs under. */
export function staffRoleGroup(role: string): "xrt" | "fd" | "ma" {
  if (isXrtRole(role)) return "xrt"
  if (role === "Front Desk") return "fd"
  return "ma" // Lead Intern, Intern 20xx, Careerist
}

/**
 * Backfill per-day availability from the legacy 0–1 `avail` number: the first N
 * weekdays become available (or last-resort), the rest unavailable. Mutates in
 * place and skips anyone already migrated, exactly as the prototype does.
 */
export function migrateStaffDayAvail(staff: StaffMember[]): void {
  for (const s of staff) {
    if (s.dayAvail) continue
    const avail = s.avail ?? 1
    let availDays = 5
    if (avail >= 1) availDays = 5
    else if (avail >= 0.8) availDays = 4
    else if (avail >= 0.6) availDays = 3
    else if (avail >= 0.4) availDays = 2
    else availDays = 1
    const bag: Partial<Record<DayName, AvailState>> = {}
    WEEKDAYS.forEach((day, i) => {
      bag[day] = i < availDays ? (s.lastResort ? "lastresort" : "available") : "unavailable"
    })
    s.dayAvail = bag
  }
}

export const AVAIL_CYCLE: AvailState[] = ["available", "lastresort", "unavailable"]
export const AVAIL_ICON: Record<AvailState, string> = {
  available: "✓", lastresort: "△", unavailable: "✕",
}

/**
 * How many staff a clinic-day needs at a given patient volume. Above the top
 * tier, one extra body per `extra` additional patients.
 */
export function getStaffingRequirement(
  pts: number, rules: StaffingRule[], extra: number,
): { totalStaff: number; breakdown: string } {
  if (!pts || pts <= 0) return { totalStaff: 0, breakdown: "—" }
  for (const r of rules) {
    if (pts >= r.minPts && pts <= r.maxPts) return { totalStaff: r.totalStaff, breakdown: r.breakdown }
  }
  const highest = rules[rules.length - 1]
  if (!highest) return { totalStaff: 1, breakdown: "1 staff" }
  const add = Math.ceil((pts - highest.maxPts) / (extra || 15))
  return { totalStaff: highest.totalStaff + add, breakdown: `${highest.breakdown} + ${add} additional` }
}
