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

// ─── Flexible periods (day / week / month / quarter / year) ───────────────────

export type Granularity = "day" | "week" | "month" | "quarter" | "year"

// The period key a submission falls in, in America/Chicago.
export function periodOf(d: Date, g: Granularity): string {
  const ymd = chicagoYmd(d)
  const [y, m] = ymd.split("-").map(Number)
  if (g === "day") return ymd
  if (g === "week") return mondayOfYmd(ymd)
  if (g === "month") return `${y}-${String(m).padStart(2, "0")}`
  if (g === "quarter") return `${y}-Q${Math.floor((m - 1) / 3) + 1}`
  return `${y}`
}

// The most recent `count` period keys, oldest first.
export function recentPeriods(g: Granularity, count: number): string[] {
  const out: string[] = []
  if (g === "week") return recentMondays(count)
  if (g === "day") {
    for (let i = count - 1; i >= 0; i--) out.push(chicagoYmd(new Date(Date.now() - i * 86400000)))
    return out
  }
  const [y, m] = chicagoYmd(new Date()).split("-").map(Number)
  if (g === "month") {
    let yy = y, mm = m
    for (let i = 0; i < count; i++) { out.unshift(`${yy}-${String(mm).padStart(2, "0")}`); if (--mm < 1) { mm = 12; yy-- } }
  } else if (g === "quarter") {
    let yy = y, q = Math.floor((m - 1) / 3) + 1
    for (let i = 0; i < count; i++) { out.unshift(`${yy}-Q${q}`); if (--q < 1) { q = 4; yy-- } }
  } else { // year
    for (let i = 0; i < count; i++) out.unshift(String(y - i))
  }
  return out
}

export function periodLabel(key: string, g: Granularity): string {
  if (g === "day" || g === "week") return weekLabel(key)
  if (g === "month") { const [y, m] = key.split("-").map(Number); return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) }
  if (g === "quarter") { const [y, q] = key.split("-Q"); return `Q${q} ${y}` }
  return key
}

// The UTC start date of a period key (used as a query lower bound; buffered a day).
export function periodStartDate(key: string, g: Granularity): Date {
  if (g === "day" || g === "week") { const [y, m, d] = key.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)) }
  if (g === "month") { const [y, m] = key.split("-").map(Number); return new Date(Date.UTC(y, m - 1, 1)) }
  if (g === "quarter") { const [y, q] = key.split("-Q"); return new Date(Date.UTC(Number(y), (Number(q) - 1) * 3, 1)) }
  return new Date(Date.UTC(Number(key), 0, 1))
}

export function defaultPeriodCount(g: Granularity): number {
  return g === "day" ? 14 : g === "week" ? 12 : g === "month" ? 12 : g === "quarter" ? 8 : 5
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

// A relative date window (America/Chicago) to reconcile on each scheduled run.
export type IntakeWindow = "today" | "yesterday" | "last_7_days" | "last_30_days" | "prior_week" | "last_month"

export const INTAKE_WINDOWS: { value: IntakeWindow; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "prior_week", label: "Prior week (Mon–Sun)" },
  { value: "last_month", label: "Last month" },
]

export function resolveIntakeWindow(w: IntakeWindow): { start: string; end: string } {
  const today = chicagoYmd(new Date())
  const dayAgo = (k: number) => chicagoYmd(new Date(Date.now() - k * 86400000))
  switch (w) {
    case "today": return { start: today, end: today }
    case "yesterday": return { start: dayAgo(1), end: dayAgo(1) }
    case "last_7_days": return { start: dayAgo(6), end: today }
    case "last_30_days": return { start: dayAgo(29), end: today }
    case "prior_week": return priorWeekRange()
    case "last_month": {
      const [y, m] = today.split("-").map(Number)
      const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1
      const mm = String(pm).padStart(2, "0")
      const lastDay = new Date(Date.UTC(py, pm, 0)).getUTCDate()
      return { start: `${py}-${mm}-01`, end: `${py}-${mm}-${String(lastDay).padStart(2, "0")}` }
    }
  }
}
