// Shared "is this scheduled job due?" check for integration pulls (FilesAnywhere
// import, IntakeQ reconciliation, …). A job is due when the current America/Chicago
// hour — and weekday, if weekly — matches the schedule and it hasn't already run
// this period. Crons that call this should fire hourly.

export interface Schedule {
  frequency?: "daily" | "weekly"
  dayOfWeek?: number       // 0=Sun … 6=Sat (weekly only)
  hour?: number            // 0–23, America/Chicago
  lastRunAt?: string | null
}

const DAY_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function scheduleDue(s: Schedule | null | undefined, now: Date = new Date()): boolean {
  if (!s?.frequency) return false
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "2-digit", hourCycle: "h23" }).format(now))
  if (Number(s.hour ?? -1) !== hour) return false
  if (s.frequency === "weekly") {
    const wd = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short" }).format(now)
    if ((s.dayOfWeek ?? -1) !== DAY_MAP[wd]) return false
  }
  // Guard against a second run in the same scheduled period (~20h) — the day+hour
  // gate already limits it to the intended slot; this only stops a same-day double
  // fire, without blocking the next weekly run after an off-schedule manual run.
  if (s.lastRunAt) {
    const gap = now.getTime() - new Date(s.lastRunAt).getTime()
    if (gap < 20 * 3_600_000) return false
  }
  return true
}
