// Clinic regions. Ported from docs/GenesisDashboard-3.html (version 10).
//
// "City" is special: it is never stored, it is whatever is left over after every
// other region has claimed its clinics — so adding a clinic to a region silently
// removes it from City.

import type { ClinicMeta } from "./types"

export const CITY = "City"

export function getAutoCity(
  clinicRegions: Record<string, string[]>,
  clinicOrder: string[],
  clinicMeta: Record<string, ClinicMeta>,
): string[] {
  const assigned = new Set<string>()
  for (const [name, list] of Object.entries(clinicRegions)) {
    if (name === CITY) continue
    for (const c of list) assigned.add(c)
  }
  return clinicOrder.filter((c) => !assigned.has(c) && !clinicMeta[c]?.isSurgery)
}

export function isClinicInRegion(
  code: string,
  regionName: string,
  clinicRegions: Record<string, string[]>,
  clinicOrder: string[],
  clinicMeta: Record<string, ClinicMeta>,
): boolean {
  if (regionName === CITY) return getAutoCity(clinicRegions, clinicOrder, clinicMeta).includes(code)
  return (clinicRegions[regionName] || []).includes(code)
}
