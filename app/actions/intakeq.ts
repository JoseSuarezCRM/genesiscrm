"use server"

import { requireAccess } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { isIntakeqConfigured, listQuestionnaires } from "@/lib/intakeq"
import { backfillRange } from "@/lib/intakeq-ingest"
import { REFERRAL_CATEGORIES, UNMAPPED } from "@/lib/intakeq-referral"
import { recentMondays, weekLabel, weekOf } from "@/lib/intakeq-weeks"

export interface ReferralSourceReport {
  configured: boolean
  weeks: { start: string; label: string }[]
  categories: string[]
  grid: Record<string, number[]>       // category → count per week
  hasUnmapped: boolean
  lastSubmittedAt: string | null
  totalStored: number
}

// The categories × weeks grid, English + Spanish already summed per category.
export async function getReferralSourceReport(weeksBack = 12): Promise<ReferralSourceReport> {
  await requireAccess("REPORTS", "VIEW")

  const weeks = recentMondays(weeksBack)
  const [ey, em, ed] = weeks[0].split("-").map(Number)
  const since = new Date(Date.UTC(ey, em - 1, ed))

  const [rows, latest, totalStored] = await Promise.all([
    (prisma as any).intakeReferralResponse.findMany({
      where: { submittedAt: { gte: since }, category: { not: "Unanswered" } },
      select: { submittedAt: true, category: true },
    }),
    (prisma as any).intakeReferralResponse.findFirst({ orderBy: { submittedAt: "desc" }, select: { submittedAt: true } }),
    (prisma as any).intakeReferralResponse.count(),
  ])

  const weekIndex = Object.fromEntries(weeks.map((w, i) => [w, i]))
  const grid: Record<string, number[]> = {}
  for (const cat of [...REFERRAL_CATEGORIES, UNMAPPED]) grid[cat] = weeks.map(() => 0)

  let hasUnmapped = false
  for (const r of rows as { submittedAt: Date; category: string }[]) {
    const wi = weekIndex[weekOf(r.submittedAt)]
    if (wi === undefined) continue
    if (!grid[r.category]) grid[r.category] = weeks.map(() => 0)
    grid[r.category][wi]++
    if (r.category === UNMAPPED) hasUnmapped = true
  }

  return {
    configured: isIntakeqConfigured(),
    weeks: weeks.map((w) => ({ start: w, label: weekLabel(w) })),
    categories: [...REFERRAL_CATEGORIES],
    grid,
    hasUnmapped,
    lastSubmittedAt: latest?.submittedAt ? new Date(latest.submittedAt).toISOString() : null,
    totalStored,
  }
}

// Pull + categorize existing submissions for a date range (bounded; run again if
// `remaining` > 0). Used to backfill history the webhook didn't capture.
export async function runIntakeBackfill(startDate: string, endDate: string): Promise<{ processed?: number; remaining?: number; candidates?: number; error?: string }> {
  await requireAccess("REPORTS", "EDIT")
  if (!isIntakeqConfigured()) return { error: "IntakeQ API key isn't configured yet." }
  if (!startDate || !endDate) return { error: "Pick a start and end date." }
  try {
    return await backfillRange(startDate, endDate)
  } catch (e: any) {
    return { error: e?.message ?? "Backfill failed." }
  }
}

// Diagnostics: list questionnaire templates so we can confirm the exact form name.
export async function listIntakeQuestionnaires(): Promise<{ items?: { Id: string; Name: string; Archived: boolean }[]; error?: string }> {
  await requireAccess("REPORTS", "EDIT")
  if (!isIntakeqConfigured()) return { error: "IntakeQ API key isn't configured yet." }
  try {
    return { items: await listQuestionnaires() }
  } catch (e: any) {
    return { error: e?.message ?? "Couldn't reach IntakeQ." }
  }
}
