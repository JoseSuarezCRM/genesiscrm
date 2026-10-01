import { NextResponse } from "next/server"
import { del } from "@vercel/blob"
import { assertCron } from "@/lib/cron-auth"
import { findOrphanedPendingUploads } from "@/lib/pending-uploads"

/**
 * Daily: delete faxes uploaded while reading them (/api/fax/extract) that were
 * never attached to a referral. They are patient documents belonging to no
 * record, which nobody can find, open or delete.
 *
 * Two safeguards:
 * - Only uploads older than two days: a batch of faxes can take a while to
 *   turn into referrals.
 * - Only uploads from CUTOFF on. The orphans that existed before this job
 *   (measured 2026-09-30: 1,214) are left alone — a few may be the only copy of
 *   a fax whose referral was saved without it, and need a person to review.
 */
const MIN_AGE_MS = 2 * 24 * 60 * 60 * 1000
const CUTOFF = new Date("2026-10-01T00:00:00Z")

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(req: Request) {
  const denied = assertCron(req)
  if (denied) return denied

  const { checked, orphans } = await findOrphanedPendingUploads({
    uploadedFrom: CUTOFF,
    uploadedBefore: new Date(Date.now() - MIN_AGE_MS),
  })
  let deleted = 0
  for (let i = 0; i < orphans.length; i += 500) {
    const chunk = orphans.slice(i, i + 500)
    await del(chunk)
    deleted += chunk.length
  }

  // Counts only — the paths carry file names, which can carry patient names.
  console.info(`[pending-uploads] checked ${checked}, deleted ${deleted}`)
  return NextResponse.json({ ok: true, checked, deleted })
}
