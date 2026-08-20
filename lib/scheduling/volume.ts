// Volume helpers ported from the original dashboard.
import { monthOrder, volCodeMap } from "./constants"
import type { VolumeEntry } from "./types"

export function clinicVolumeData(appCode: string, rawVolume: VolumeEntry[]): VolumeEntry[] {
  const volCode = Object.entries(volCodeMap).find(([, v]) => v === appCode)
  if (!volCode) return []
  return rawVolume
    .filter((v) => v.clinic === volCode[0])
    .sort(
      (a, b) =>
        a.year * 12 + monthOrder[a.month] - (b.year * 12 + monthOrder[b.month])
    )
}

export function recentAvg(code: string, rawVolume: VolumeEntry[]): number {
  const v = clinicVolumeData(code, rawVolume)
  const l = v.slice(-3)
  return l.length ? Math.round(l.reduce((s, x) => s + x.visits, 0) / l.length) : 0
}

export function volumeTrend(code: string, rawVolume: VolumeEntry[]): number | null {
  const v = clinicVolumeData(code, rawVolume)
  if (v.length < 6) return null
  const f = v.slice(0, 3)
  const l = v.slice(-3)
  const af = f.reduce((s, x) => s + x.visits, 0) / 3
  const al = l.reduce((s, x) => s + x.visits, 0) / 3
  return af ? ((al - af) / af) * 100 : null
}

// Recent 3-month monthly avg divided across scheduled days/week -> avg daily volume.
export function getClinicAvgDailyVolume(
  clinicCode: string, rawVolume: VolumeEntry[], scheduledDays: number
): number {
  const volCode = volCodeMap[clinicCode]
  if (!volCode) return 0
  const entries = rawVolume.filter((v) => v.clinic === volCode)
  if (!entries.length) return 0
  entries.sort(
    (a, b) => b.year * 12 + monthOrder[b.month] - (a.year * 12 + monthOrder[a.month])
  )
  const recent = entries.slice(0, 3)
  const avgMonthly = recent.reduce((s, v) => s + v.visits, 0) / recent.length
  const daysOpen = scheduledDays || 5
  return Math.round(avgMonthly / (4.3 * daysOpen))
}
