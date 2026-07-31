import { NextResponse } from "next/server"
import { assertCron } from "@/lib/cron-auth"
import { prisma } from "@/lib/prisma"
import { isIntakeqConfigured } from "@/lib/intakeq"
import { getIntegration } from "@/lib/integration-store"
import { backfillRange } from "@/lib/intakeq-ingest"
import { resolveIntakeWindow, type IntakeWindow } from "@/lib/intakeq-weeks"
import { scheduleDue } from "@/lib/schedule"

// Runs hourly; reconciles on the admin-chosen schedule (day + time, America/Chicago)
// over the chosen date window — re-scanning to ingest anything the live webhook
// missed. Already-stored intakes are skipped, so a healthy webhook does little.
export async function GET(req: Request) {
  const err = assertCron(req)
  if (err) return err
  if (!(await isIntakeqConfigured())) return NextResponse.json({ ok: true, skipped: "no api key" })

  const row = await getIntegration()
  const cfg = (row?.config ?? {}) as any
  const sched = { frequency: cfg.frequency ?? "weekly", dayOfWeek: cfg.dayOfWeek ?? 1, hour: cfg.hour ?? 6, lastRunAt: cfg.lastRunAt ?? null }
  if (!scheduleDue(sched)) return NextResponse.json({ ok: true, skipped: "not due" })

  const { start, end } = resolveIntakeWindow((cfg.window ?? "prior_week") as IntakeWindow)
  const result = await backfillRange(start, end)
  await (prisma as any).integration.update({ where: { provider: "intakeq" }, data: { config: { ...cfg, lastRunAt: new Date().toISOString() } } }).catch(() => {})
  return NextResponse.json({ ok: true, range: { start, end }, ...result })
}
