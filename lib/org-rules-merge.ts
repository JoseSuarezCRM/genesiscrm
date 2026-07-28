import { prisma } from "@/lib/prisma"
import { applyRules } from "@/lib/org-rules-utils"
import { recordMergeRedirect } from "@/lib/merge-redirect"

export interface PracticeMerge { from: string; to: string }

// Scan all practices, apply the org name rules, and merge any whose canonical
// name differs from their current name into the canonical practice (moving
// referrals, locations, and doctors). Returns the list of merges performed
// (source name → canonical name) so callers can log what happened.
// No auth here — callers (the admin action + the cron) gate access themselves.
export async function mergeExistingPracticesByRules(): Promise<PracticeMerge[]> {
  const [rules, allPractices] = await Promise.all([
    prisma.orgNameRule.findMany({ orderBy: { order: "asc" } }),
    prisma.referringPractice.findMany(),
  ])
  if (!rules.length) return []

  const merges: PracticeMerge[] = []

  for (const practice of allPractices) {
    const canonical = applyRules(practice.name, rules)
    if (canonical.toLowerCase() === practice.name.toLowerCase()) continue // already correct

    let target = await prisma.referringPractice.findFirst({
      where: { name: { equals: canonical, mode: "insensitive" } },
    })
    if (!target) {
      target = await prisma.referringPractice.create({ data: { name: canonical } })
    }
    if (target.id === practice.id) continue

    // Merge: move referrals, locations, doctors into the canonical practice.
    await prisma.referral.updateMany({ where: { referringPracticeId: practice.id }, data: { referringPracticeId: target.id } })
    await prisma.practiceLocation.updateMany({ where: { practiceId: practice.id }, data: { practiceId: target.id } })

    const sourceDoctors = await prisma.referringDoctor.findMany({ where: { practiceId: practice.id }, select: { id: true, name: true } })
    for (const doc of sourceDoctors) {
      const existing = await prisma.referringDoctor.findFirst({
        where: { practiceId: target.id, name: { equals: doc.name, mode: "insensitive" } },
      })
      if (!existing) {
        await prisma.referringDoctor.update({ where: { id: doc.id }, data: { practiceId: target.id } })
      } else {
        await prisma.referral.updateMany({ where: { referringDoctorId: doc.id }, data: { referringDoctorId: existing.id } })
        const sourceLinks = await prisma.doctorLocation.findMany({ where: { doctorId: doc.id } })
        for (const link of sourceLinks) {
          const already = await prisma.doctorLocation.findFirst({ where: { doctorId: existing.id, locationId: link.locationId } })
          if (!already) {
            await prisma.doctorLocation.update({
              where: { doctorId_locationId: { doctorId: doc.id, locationId: link.locationId } },
              data: { doctorId: existing.id },
            })
          } else {
            await prisma.doctorLocation.delete({ where: { doctorId_locationId: { doctorId: doc.id, locationId: link.locationId } } })
          }
        }
        await prisma.referringDoctor.delete({ where: { id: doc.id } })
        await recordMergeRedirect("PROVIDER", doc.id, existing.id)
      }
    }

    await prisma.referringPractice.delete({ where: { id: practice.id } })
    await recordMergeRedirect("PRACTICE", practice.id, target.id)
    merges.push({ from: practice.name, to: canonical })
  }

  return merges
}

// Record a run in the log (only when something merged, to keep it meaningful).
async function logRun(trigger: "manual" | "auto", merges: PracticeMerge[]) {
  if (!merges.length) return
  await (prisma as any).orgRulesRunLog.create({
    data: { trigger, mergedCount: merges.length, merges },
  })
}

// Run the merge and record a log entry. Shared by the admin action and the cron.
export async function mergeAndLog(trigger: "manual" | "auto"): Promise<PracticeMerge[]> {
  const merges = await mergeExistingPracticesByRules()
  await logRun(trigger, merges)
  return merges
}

// Run the merge if the poller is enabled and its interval has elapsed. Used by
// the cron. Returns null when it wasn't due, or the merged count when it ran.
export async function runOrgRulesPollerIfDue(): Promise<{ ran: boolean; merged: number }> {
  const cfg = await (prisma as any).orgRulesPoller.findUnique({ where: { id: "singleton" } })
  if (!cfg || !cfg.enabled) return { ran: false, merged: 0 }

  const dueAfter = cfg.lastRunAt ? new Date(cfg.lastRunAt.getTime() + cfg.intervalMinutes * 60_000) : new Date(0)
  if (Date.now() < dueAfter.getTime()) return { ran: false, merged: 0 }

  const merges = await mergeAndLog("auto")
  await (prisma as any).orgRulesPoller.update({
    where: { id: "singleton" },
    data: { lastRunAt: new Date(), lastMerged: merges.length },
  })
  return { ran: true, merged: merges.length }
}
