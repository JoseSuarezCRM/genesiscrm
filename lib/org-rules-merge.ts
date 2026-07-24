import { prisma } from "@/lib/prisma"
import { applyRules } from "@/lib/org-rules-utils"

// Scan all practices, apply the org name rules, and merge any whose canonical
// name differs from their current name into the canonical practice (moving
// referrals, locations, and doctors). Returns how many practices were merged.
// No auth here — callers (the admin action + the cron) gate access themselves.
export async function mergeExistingPracticesByRules(): Promise<number> {
  const [rules, allPractices] = await Promise.all([
    prisma.orgNameRule.findMany({ orderBy: { order: "asc" } }),
    prisma.referringPractice.findMany(),
  ])
  if (!rules.length) return 0

  let merged = 0

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
      }
    }

    await prisma.referringPractice.delete({ where: { id: practice.id } })
    merged++
  }

  return merged
}

// Run the merge if the poller is enabled and its interval has elapsed. Used by
// the cron. Returns null when it wasn't due, or the merged count when it ran.
export async function runOrgRulesPollerIfDue(): Promise<{ ran: boolean; merged: number }> {
  const cfg = await (prisma as any).orgRulesPoller.findUnique({ where: { id: "singleton" } })
  if (!cfg || !cfg.enabled) return { ran: false, merged: 0 }

  const dueAfter = cfg.lastRunAt ? new Date(cfg.lastRunAt.getTime() + cfg.intervalMinutes * 60_000) : new Date(0)
  if (Date.now() < dueAfter.getTime()) return { ran: false, merged: 0 }

  const merged = await mergeExistingPracticesByRules()
  await (prisma as any).orgRulesPoller.update({
    where: { id: "singleton" },
    data: { lastRunAt: new Date(), lastMerged: merged },
  })
  return { ran: true, merged }
}
