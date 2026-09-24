/**
 * Move native calendar-date columns from midnight UTC to noon UTC.
 *
 *   npx tsx scripts/migrate-dates-to-noon.ts           # dry run
 *   npx tsx scripts/migrate-dates-to-noon.ts --apply   # write
 *
 * Why: a DATE column holds a calendar day. Stored at 1976-10-11T00:00:00Z it is
 * 1976-10-10 in Chicago, so any reader that renders in clinic time reports the
 * day before — measured: the record card said "Oct 11, 1976" while the
 * {patient_dob} email token said "October 10, 1976".
 *
 * Noon UTC is the same calendar day everywhere from UTC-12 to UTC+11, so the
 * day survives whichever timezone reads it and no formatter needs to special-
 * case anything. This is the convention custom date properties already use
 * (surgery's helper date props store "…T12:00:00.000Z"); this brings the native
 * columns into line rather than inventing a new rule.
 *
 * Two cases are handled differently:
 *   • exactly midnight UTC  → keep that UTC calendar day, move to noon.
 *   • carries a real time   → it was captured as an instant when a calendar day
 *                             was meant (26 referralDate rows), so take the
 *                             CLINIC day of that instant and store its noon.
 */

import { prisma } from "../lib/prisma"
import { CLINIC_TZ, zonedParts } from "../lib/tz"

const APPLY = process.argv.includes("--apply")

/** Columns that hold a calendar day (RECORD_FIELDS type "date"). */
const TARGETS = [{ model: "referral", columns: ["patientDob", "referralDate", "appointmentDate"] }] as const

function noonFor(d: Date): { next: Date; kind: "midnight" | "had-time" } {
  const bare =
    d.getUTCHours() === 0 && d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0
  if (bare) {
    return { next: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12)), kind: "midnight" }
  }
  const p = zonedParts(d, CLINIC_TZ)
  return { next: new Date(Date.UTC(p.year, p.month, p.day, 12)), kind: "had-time" }
}

async function main() {
  let total = 0, moved = 0, hadTime = 0, already = 0

  for (const t of TARGETS) {
    const model: any = (prisma as any)[t.model]
    const rows = await model.findMany({
      select: { id: true, ...Object.fromEntries(t.columns.map((c) => [c, true])) },
    })

    for (const row of rows) {
      const data: Record<string, Date> = {}
      for (const col of t.columns) {
        const v: Date | null = row[col]
        if (!v) continue
        total++
        if (v.getUTCHours() === 12 && v.getUTCMinutes() === 0 && v.getUTCSeconds() === 0) { already++; continue }
        const { next, kind } = noonFor(v)
        if (kind === "had-time") {
          hadTime++
          console.log(`  TIME  ${t.model}.${col} ${row.id}: ${v.toISOString()} -> ${next.toISOString()} (clinic day)`)
        }
        data[col] = next
        moved++
      }
      if (Object.keys(data).length && APPLY) {
        await model.update({ where: { id: row.id }, data })
      }
    }
  }

  console.log(`\n${APPLY ? "Applied" : "Dry run"}: ${total} values scanned, ${moved} ${APPLY ? "moved" : "would move"} to noon UTC (${hadTime} of them carried a real time), ${already} already at noon.`)
  if (!APPLY && moved) console.log("Re-run with --apply to write.")
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
