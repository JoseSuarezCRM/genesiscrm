// Week bucketing for the referral-source report. Weeks are Monday-started and
// bucketed by the submission's calendar date in America/Chicago (the clinic's tz),
// matching how the manual spreadsheet is filtered.

export function chicagoYmd(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" }) // YYYY-MM-DD
}

// The Monday (YYYY-MM-DD) of the week containing the given YYYY-MM-DD.
export function mondayOfYmd(ymd: string): string {
  const [y, m, day] = ymd.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, day))
  const dow = dt.getUTCDay() // 0=Sun … 6=Sat
  dt.setUTCDate(dt.getUTCDate() + (dow === 0 ? -6 : 1 - dow))
  return dt.toISOString().slice(0, 10)
}

export function weekOf(d: Date): string {
  return mondayOfYmd(chicagoYmd(d))
}

// The most recent `n` week-start Mondays, oldest first.
export function recentMondays(n: number): string[] {
  const monday = mondayOfYmd(chicagoYmd(new Date()))
  const [y, m, d] = monday.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    out.unshift(dt.toISOString().slice(0, 10))
    dt.setUTCDate(dt.getUTCDate() - 7)
  }
  return out
}

// "Jul 20" style label for a YYYY-MM-DD week start.
export function weekLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
}

// The prior full week (Mon–Sun) as { start, end } YYYY-MM-DD, used by the cron for
// reconciliation. Widened a couple days on each side so forms created just outside
// the week but submitted within it aren't missed (results are deduped anyway).
export function priorWeekRange(): { start: string; end: string } {
  const thisMonday = mondayOfYmd(chicagoYmd(new Date()))
  const [y, m, d] = thisMonday.split("-").map(Number)
  const start = new Date(Date.UTC(y, m - 1, d))
  start.setUTCDate(start.getUTCDate() - 9) // prior Monday, minus 2 days of slack
  const end = new Date(Date.UTC(y, m - 1, d))
  end.setUTCDate(end.getUTCDate() + 1)
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}
