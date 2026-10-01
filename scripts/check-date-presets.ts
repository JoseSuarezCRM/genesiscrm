/**
 * Date presets resolve on the clinic's calendar (America/Chicago) whatever
 * timezone the process runs in.
 *
 *   npx tsx scripts/check-date-presets.ts          # assertions, in this process's TZ
 *   npm run check:date-presets                      # the same under UTC, Chicago and Tokyo
 */

import { execFileSync } from "child_process"
import { resolvePreset, DATE_PRESET_GROUPS } from "../lib/reporting/date-presets"
import { matchesFilter, type FilterField } from "../lib/filters"

let failures = 0
const eq = (got: unknown, want: unknown, what: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) { failures++; console.error(`  FAIL  ${what}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`) }
  else console.log(`  ok    ${what}`)
}
const w = (preset: string, now: string, from?: string, to?: string) => {
  const r = resolvePreset(preset, from, to, new Date(now))
  return r && { start: r.start.toISOString(), end: r.end.toISOString(), startDay: r.startDay, endDay: r.endDay }
}

if (process.argv[2] === "--dump") {
  // Every preset at a few awkward moments, for the cross-timezone comparison.
  const moments = ["2026-09-30T02:00:00Z", "2026-11-01T06:30:00Z", "2026-03-08T07:30:00Z", "2026-12-31T23:30:00Z", "2027-01-01T05:30:00Z"]
  const out: Record<string, unknown> = {}
  for (const m of moments) for (const p of DATE_PRESET_GROUPS) out[`${m} ${p.value}`] = w(p.value, m, "2026-02-01", "2026-02-28")
  process.stdout.write(JSON.stringify(out))
  process.exit(0)
}

console.log(`\nTZ=${process.env.TZ ?? "(system)"}`)

// 9 pm Chicago on Tuesday Sep 29 2026 (CDT, UTC-5) is already Sep 30 in UTC.
const eve = "2026-09-30T02:00:00Z"
eq(w("today", eve), { start: "2026-09-29T05:00:00.000Z", end: "2026-09-30T04:59:59.999Z", startDay: "2026-09-29", endDay: "2026-09-29" }, "9 pm Chicago is still today, Chicago's today")
eq(w("yesterday", eve)?.startDay, "2026-09-28", "yesterday")
eq(w("last_7", eve), { start: "2026-09-23T05:00:00.000Z", end: eve.replace("Z", ".000Z"), startDay: "2026-09-23", endDay: "2026-09-29" }, "last 7 days: six days back to now")
eq([w("this_week", eve)?.startDay, w("this_week", eve)?.endDay], ["2026-09-27", "2026-10-03"], "weeks start Sunday")
eq([w("last_week", eve)?.startDay, w("last_week", eve)?.endDay], ["2026-09-20", "2026-09-26"], "last week")
eq(w("this_month", eve), { start: "2026-09-01T05:00:00.000Z", end: "2026-10-01T04:59:59.999Z", startDay: "2026-09-01", endDay: "2026-09-30" }, "this month")
eq([w("last_month", eve)?.startDay, w("last_month", eve)?.endDay], ["2026-08-01", "2026-08-31"], "last month")
eq([w("this_quarter", eve)?.startDay, w("this_quarter", eve)?.endDay], ["2026-07-01", "2026-09-30"], "this quarter")
eq([w("last_quarter", eve)?.startDay, w("last_quarter", eve)?.endDay], ["2026-04-01", "2026-06-30"], "last quarter")
eq([w("next_month", eve)?.startDay, w("next_month", eve)?.endDay], ["2026-10-01", "2026-10-31"], "next month")

// Year boundary: 11:30 pm Dec 31 UTC is 5:30 pm Dec 31 in Chicago — still last year's day.
eq(w("this_year", "2026-12-31T23:30:00Z")?.startDay, "2026-01-01", "UTC new year's eve evening is still 2026 in Chicago")
eq(w("this_year", "2027-01-01T05:30:00Z")?.startDay, "2026-01-01", "05:30 UTC Jan 1 is 11:30 pm Dec 31 in Chicago (UTC-6 in winter)")
eq(w("this_year", "2027-01-01T06:00:00Z")?.startDay, "2027-01-01", "…the new year starts at Chicago midnight")
eq([w("last_quarter", "2027-01-01T06:00:00Z")?.startDay, w("last_quarter", "2027-01-01T06:00:00Z")?.endDay], ["2026-10-01", "2026-12-31"], "last quarter across the year")

// DST: Nov 1 2026 Chicago falls back at 2 am — a 25-hour day.
eq(w("today", "2026-11-01T18:00:00Z"), { start: "2026-11-01T05:00:00.000Z", end: "2026-11-02T05:59:59.999Z", startDay: "2026-11-01", endDay: "2026-11-01" }, "the fall-back day is 25 hours")
// Mar 8 2026 springs forward — a 23-hour day.
eq(w("today", "2026-03-08T18:00:00Z"), { start: "2026-03-08T06:00:00.000Z", end: "2026-03-09T04:59:59.999Z", startDay: "2026-03-08", endDay: "2026-03-08" }, "the spring-forward day is 23 hours")

eq(w("custom", eve, "2026-02-01", "2026-02-28"), { start: "2026-02-01T06:00:00.000Z", end: "2026-03-01T05:59:59.999Z", startDay: "2026-02-01", endDay: "2026-02-28" }, "a custom range is whole Chicago days")
eq(w("custom", eve, "2026-02-30", "2026-03-01"), null, "an impossible custom day is refused")
eq(w("all", eve), null, "all time")

// The filters, both shapes, at 9 pm Chicago — the case that used to split.
console.log("\nFilters at 9 pm Chicago")
const realNow = Date.now
Date.now = () => new Date(eve).getTime()
const RealDate = Date
// resolvePreset() inside the filter uses `new Date()`; pin it to the same moment.
;(globalThis as any).Date = class extends RealDate {
  constructor(...a: any[]) { super(...(a.length ? a : [new RealDate(eve).getTime()]) as []) }
  static now() { return new RealDate(eve).getTime() }
} as DateConstructor
const fState = (field: string) => ({ combinator: "AND" as const, groups: [{ id: "g", combinator: "AND" as const, conditions: [{ id: "c", field, operator: "relative", value: "today" }] }] })
const instantField: FilterField[] = [{ key: "createdAt", label: "Created", type: "date", dateOnly: false, getValue: (r: any) => r.createdAt } as FilterField]
const dayField: FilterField[] = [{ key: "visit", label: "Visit", type: "date", getValue: (r: any) => r.visit } as FilterField]
eq(matchesFilter({ createdAt: new RealDate("2026-09-30T01:30:00Z") }, fState("createdAt"), instantField), true, "a call at 8:30 pm Chicago counts as today")
eq(matchesFilter({ createdAt: new RealDate("2026-09-29T04:30:00Z") }, fState("createdAt"), instantField), false, "…one at 11:30 pm the night before doesn't")
eq(matchesFilter({ visit: "2026-09-29T12:00:00.000Z" }, fState("visit"), dayField), true, "a date-only value on today's Chicago date matches")
eq(matchesFilter({ visit: "2026-09-30T12:00:00.000Z" }, fState("visit"), dayField), false, "…tomorrow's (already today in UTC) doesn't")
;(globalThis as any).Date = RealDate
Date.now = realNow

console.log(failures === 0 ? "\nPASSED\n" : `\n${failures} FAILED\n`)
if (failures) process.exit(1)

// Same results in every timezone.
if (process.argv[2] === "--all-tz") {
  const dumps = ["UTC", "America/Chicago", "Asia/Tokyo"].map((tz) =>
    execFileSync(process.execPath, [...process.execArgv, __filename, "--dump"], { env: { ...process.env, TZ: tz } }).toString())
  const same = dumps.every((d) => d === dumps[0])
  console.log(same ? `IDENTICAL under UTC, America/Chicago and Asia/Tokyo (${Object.keys(JSON.parse(dumps[0]!)).length} preset/moment pairs)` : "DIFFERENT across timezones")
  if (!same) process.exit(1)
}
