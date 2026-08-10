import { NextResponse } from "next/server"
import { assertCron } from "@/lib/cron-auth"
import { prisma } from "@/lib/prisma"
import { isIntakeqConfigured } from "@/lib/intakeq"
import { getIntegration } from "@/lib/integration-store"
import { resolveIntakeWindow, type IntakeWindow } from "@/lib/intakeq-weeks"
import { sendScheduledIntakeReport } from "@/lib/intakeq-report"
import { scheduleDue } from "@/lib/schedule"

// Runs hourly. On the admin-chosen schedule it (a) reconciles the chosen window —
// re-scanning to ingest anything the live webhook missed — and (b) emails the
// referral-source report. Both are gated independently by scheduleDue.
export async function GET(req: Request) {
  const err = assertCron(req)
  if (err) return err
  if (!(await isIntakeqConfigured())) return NextResponse.json({ ok: true, skipped: "no api key" })

  const row = await getIntegration()
  const cfg = (row?.config ?? {}) as any

  // Reconciliation pull: start a background backfill job for the window (the
  // minutely /api/cron/intakeq-backfill drain finishes it) rather than a single
  // 12-record batch that never catches up. Skip if a backfill is already running.
  let pull: any = { skipped: "not due" }
  const sched = { frequency: cfg.frequency ?? "weekly", dayOfWeek: cfg.dayOfWeek ?? 1, hour: cfg.hour ?? 6, lastRunAt: cfg.lastRunAt ?? null }
  if (scheduleDue(sched)) {
    const { start, end } = resolveIntakeWindow((cfg.window ?? "prior_week") as IntakeWindow)
    const nowIso = new Date().toISOString()
    if (cfg.backfill?.active) {
      await (prisma as any).integration.update({ where: { provider: "intakeq" }, data: { config: { ...cfg, lastRunAt: nowIso } } }).catch(() => {})
      pull = { range: { start, end }, skipped: "backfill already active" }
    } else {
      const backfill = {
        active: true, startDate: start, endDate: end,
        processed: 0, remaining: null, candidates: null,
        startedAt: nowIso, startedById: null, lastBatchAt: null,
        rateLimitedUntil: null, lockUntil: null, done: false, doneAt: null, error: null,
      }
      await (prisma as any).integration.update({ where: { provider: "intakeq" }, data: { config: { ...cfg, lastRunAt: nowIso, backfill } } }).catch(() => {})
      pull = { range: { start, end }, started: true }
    }
  }

  // Scheduled email report.
  let report: any = { skipped: "not due" }
  const er = cfg.emailReport
  if (er?.enabled && scheduleDue({ frequency: er.frequency ?? "weekly", dayOfWeek: er.dayOfWeek, hour: er.hour, lastRunAt: er.lastSentAt })) {
    report = await sendScheduledIntakeReport()
  }

  return NextResponse.json({ ok: true, pull, report })
}
