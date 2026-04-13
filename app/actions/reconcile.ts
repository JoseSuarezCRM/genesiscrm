"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"

function normalizeMrn(s: string | null | undefined): string {
  if (!s) return ""
  return s.replace(/\D/g, "")
}

export interface CsvRow {
  mrn: string
  patientName: string
  visitDate: string
}

export interface MatchResult {
  csvRow: CsvRow
  referralId: string
  appPatientName: string
  appGenesisMrn: string | null
  appScheduledDate: string | null
  currentStatus: string
}

export interface NoShowCandidate {
  referralId: string
  appPatientName: string
  appGenesisMrn: string | null
  appScheduledDate: string
  currentStatus: string
}

export interface AppliedRecord {
  id: string
  appPatientName: string
  appGenesisMrn: string | null
  appScheduledDate: string | null
  reportMrn: string
  reportVisitDate: string
  previousStatus: string
  newStatus: "COMPLETED" | "NO_SHOW"
}

/** Strip "MRN: " prefix and non-digit chars from all existing genesisMrn values */
export async function cleanupGenesisMrn() {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") return { error: "Unauthorized" }

  const referrals = await prisma.referral.findMany({
    where: { genesisMrn: { not: null } },
    select: { id: true, genesisMrn: true },
  })

  let fixed = 0
  for (const r of referrals) {
    const cleaned = normalizeMrn(r.genesisMrn)
    if (cleaned !== r.genesisMrn) {
      await prisma.referral.update({ where: { id: r.id }, data: { genesisMrn: cleaned || null } })
      fixed++
    }
  }

  revalidatePath("/referrals")
  return { success: true, fixed }
}

/**
 * Match CSV rows to referrals by Genesis MRN.
 * Also returns referrals with appointmentDate in [dateFrom, dateTo] that were NOT matched
 * — these are no-show candidates.
 */
export async function matchAppointments(
  rows: CsvRow[],
  dateFrom: string,
  dateTo: string
): Promise<{ matches: MatchResult[]; noShowCandidates: NoShowCandidate[]; unmatchedCsvRows: number }> {
  const session = await auth()
  if (!session?.user) return { matches: [], noShowCandidates: [], unmatchedCsvRows: rows.length }

  const from = new Date(dateFrom)
  const to = new Date(dateTo)
  to.setHours(23, 59, 59, 999) // inclusive end of day

  // Referrals scheduled in the date range that haven't been resolved yet
  const scheduledInRange = await prisma.referral.findMany({
    where: {
      appointmentDate: { gte: from, lte: to },
      status: { notIn: ["COMPLETED", "NO_SHOW"] },
    },
    select: {
      id: true,
      patientFirstName: true,
      patientLastName: true,
      genesisMrn: true,
      appointmentDate: true,
      status: true,
    },
  })

  const matches: MatchResult[] = []
  const matchedIds = new Set<string>()
  let unmatchedCsvRows = 0

  for (const row of rows) {
    const rowMrn = normalizeMrn(row.mrn)
    if (!rowMrn) continue

    const match = scheduledInRange.find(
      (r) => !matchedIds.has(r.id) && normalizeMrn(r.genesisMrn) === rowMrn
    )

    if (match) {
      matchedIds.add(match.id)
      matches.push({
        csvRow: row,
        referralId: match.id,
        appPatientName: `${match.patientFirstName} ${match.patientLastName}`,
        appGenesisMrn: match.genesisMrn,
        appScheduledDate: match.appointmentDate!.toISOString(),
        currentStatus: match.status,
      })
    } else {
      unmatchedCsvRows++
    }
  }

  // Referrals in range with no match in the CSV → no-show candidates
  const noShowCandidates: NoShowCandidate[] = scheduledInRange
    .filter((r) => !matchedIds.has(r.id))
    .map((r) => ({
      referralId: r.id,
      appPatientName: `${r.patientFirstName} ${r.patientLastName}`,
      appGenesisMrn: r.genesisMrn,
      appScheduledDate: r.appointmentDate!.toISOString(),
      currentStatus: r.status,
    }))

  return { matches, noShowCandidates, unmatchedCsvRows }
}

/** Apply: mark completedIds as COMPLETED and noShowIds as NO_SHOW */
export async function applyReconciliation(
  completedIds: string[],
  noShowIds: string[],
  matchMap: Record<string, { reportMrn: string; reportVisitDate: string }>
) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  if (!completedIds.length && !noShowIds.length) return { error: "Nothing selected." }

  try {
    const allIds = [...completedIds, ...noShowIds]
    const before = await prisma.referral.findMany({
      where: { id: { in: allIds } },
      select: {
        id: true,
        patientFirstName: true,
        patientLastName: true,
        genesisMrn: true,
        appointmentDate: true,
        status: true,
      },
    })

    await prisma.$transaction([
      prisma.referral.updateMany({
        where: { id: { in: completedIds }, status: { notIn: ["COMPLETED", "NO_SHOW"] } },
        data: { status: "COMPLETED" },
      }),
      prisma.referral.updateMany({
        where: { id: { in: noShowIds }, status: { notIn: ["COMPLETED", "NO_SHOW"] } },
        data: { status: "NO_SHOW" },
      }),
    ])

    const applied: AppliedRecord[] = before
      .filter((r) => r.status !== "COMPLETED" && r.status !== "NO_SHOW")
      .map((r) => ({
        id: r.id,
        appPatientName: `${r.patientFirstName} ${r.patientLastName}`,
        appGenesisMrn: r.genesisMrn,
        appScheduledDate: r.appointmentDate ? r.appointmentDate.toISOString() : null,
        reportMrn: matchMap[r.id]?.reportMrn ?? "",
        reportVisitDate: matchMap[r.id]?.reportVisitDate ?? "",
        previousStatus: r.status,
        newStatus: noShowIds.includes(r.id) ? "NO_SHOW" : "COMPLETED",
      }))

    revalidatePath("/referrals")
    revalidatePath("/")
    return { success: true, applied }
  } catch (e: any) {
    return { error: e?.message ?? "Failed to apply reconciliation." }
  }
}
