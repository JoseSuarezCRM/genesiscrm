import { NextResponse } from "next/server"
import { assertCron } from "@/lib/cron-auth"
import { prisma } from "@/lib/prisma"
import { isIntakeqConfigured } from "@/lib/intakeq"
import { getIntegration } from "@/lib/integration-store"
import { backfillRange } from "@/lib/intakeq-ingest"

// Every minute: drains an active backfill job (started from the report UI or the
// scheduled reconciliation) one time-budgeted batch at a time until complete —
// so the pull continues without the browser tab staying open.
export const maxDuration = 60

// Merge a patch into config.backfill, re-reading fresh so we don't clobber other
// config keys or a concurrent write.
async function patchBackfill(patch: Record<string, unknown>) {
  const row = await getIntegration()
  const cfg = (row?.config ?? {}) as any
  const backfill = { ...(cfg.backfill ?? {}), ...patch }
  await (prisma as any).integration.update({ where: { provider: "intakeq" }, data: { config: { ...cfg, backfill } } }).catch(() => {})
}

export async function GET(req: Request) {
  const err = assertCron(req)
  if (err) return err
  if (!(await isIntakeqConfigured())) return NextResponse.json({ ok: true, skipped: "no api key" })

  const row = await getIntegration()
  const b = (row?.config as any)?.backfill
  const now = Date.now()

  if (!b?.active) return NextResponse.json({ ok: true, skipped: "no active backfill" })
  if (b.lockUntil && new Date(b.lockUntil).getTime() > now) return NextResponse.json({ ok: true, skipped: "locked" })
  if (b.rateLimitedUntil && new Date(b.rateLimitedUntil).getTime() > now) return NextResponse.json({ ok: true, skipped: "rate-limit wait" })

  // Claim this tick so overlapping cron fires don't double-run.
  await patchBackfill({ lockUntil: new Date(now + 55_000).toISOString() })

  let res
  try {
    res = await backfillRange(b.startDate, b.endDate, { budgetMs: 50_000 })
  } catch (e) {
    await patchBackfill({ lockUntil: null, active: false, error: e instanceof Error ? e.message : String(e) })
    return NextResponse.json({ ok: false, error: String(e) })
  }

  const patch: Record<string, unknown> = {
    lockUntil: null,
    processed: (b.processed ?? 0) + res.processed,
    remaining: res.remaining,
    candidates: res.candidates,
    lastBatchAt: new Date().toISOString(),
    rateLimitedUntil: res.rateLimited ? new Date(Date.now() + 60_000).toISOString() : null,
  }
  if (res.remaining <= 0 && !res.rateLimited) {
    patch.active = false; patch.done = true; patch.doneAt = new Date().toISOString(); patch.error = null
  } else if (res.processed === 0 && res.remaining > 0 && !res.rateLimited) {
    // Candidates remain but none could be ingested — stop so it can't spin forever.
    patch.active = false; patch.error = "Some rows couldn't be ingested — check the date range or IntakeQ."
  }
  await patchBackfill(patch)
  return NextResponse.json({ ok: true, processedThisTick: res.processed, remaining: res.remaining })
}
