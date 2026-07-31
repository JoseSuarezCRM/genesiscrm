import { NextResponse } from "next/server"
import { assertCron } from "@/lib/cron-auth"
import { isIntakeqConfigured } from "@/lib/intakeq"
import { backfillRange } from "@/lib/intakeq-ingest"
import { priorWeekRange } from "@/lib/intakeq-weeks"

// Weekly reconciliation: re-scan the prior week and ingest any submissions the
// live webhook missed. Already-stored intakes are skipped (no detail call), so on
// a healthy webhook this does almost nothing. Schedule in vercel.json.
export async function GET(req: Request) {
  const err = assertCron(req)
  if (err) return err
  if (!isIntakeqConfigured()) return NextResponse.json({ ok: true, skipped: "no api key" })

  const { start, end } = priorWeekRange()
  const result = await backfillRange(start, end)
  return NextResponse.json({ ok: true, range: { start, end }, ...result })
}
