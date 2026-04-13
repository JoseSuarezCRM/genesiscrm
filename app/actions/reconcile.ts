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

export interface AppliedRecord {
  id: string
  appPatientName: string
  appGenesisMrn: string | null
  appScheduledDate: string | null
  reportMrn: string
  reportVisitDate: string
  previousStatus: string
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

/** Match CSV rows to referrals by Genesis MRN only */
export async function matchAppointments(rows: CsvRow[]): Promise<{ matches: MatchResult[]; unmatched: number }> {
  const session = await auth()
  if (!session?.user) return { matches: [], unmatched: rows.length }

  const referrals = await prisma.referral.findMany({
    where: {
      genesisMrn: { not: null },
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

  for (const row of rows) {
    const rowMrn = normalizeMrn(row.mrn)
    if (!rowMrn) continue

    const match = referrals.find(
      (r) => !matchedIds.has(r.id) && normalizeMrn(r.genesisMrn) === rowMrn
    )

    if (match) {
      matchedIds.add(match.id)
      matches.push({
        csvRow: row,
        referralId: match.id,
        appPatientName: `${match.patientFirstName} ${match.patientLastName}`,
        appGenesisMrn: match.genesisMrn,
        appScheduledDate: match.appointmentDate ? match.appointmentDate.toISOString() : null,
        currentStatus: match.status,
      })
    }
  }

  return { matches, unmatched: rows.length - matches.length }
}

/** Mark matched referrals as COMPLETED and return full report */
export async function applyReconciliation(referralIds: string[], matchMap: Record<string, { reportMrn: string; reportVisitDate: string }>) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  if (!referralIds.length) return { error: "No referrals selected." }

  try {
    const before = await prisma.referral.findMany({
      where: { id: { in: referralIds } },
      select: {
        id: true,
        patientFirstName: true,
        patientLastName: true,
        genesisMrn: true,
        appointmentDate: true,
        status: true,
      },
    })

    const { count } = await prisma.referral.updateMany({
      where: { id: { in: referralIds }, status: { notIn: ["COMPLETED", "NO_SHOW"] } },
      data: { status: "COMPLETED" },
    })

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
      }))

    const skipped: AppliedRecord[] = before
      .filter((r) => r.status === "COMPLETED" || r.status === "NO_SHOW")
      .map((r) => ({
        id: r.id,
        appPatientName: `${r.patientFirstName} ${r.patientLastName}`,
        appGenesisMrn: r.genesisMrn,
        appScheduledDate: r.appointmentDate ? r.appointmentDate.toISOString() : null,
        reportMrn: matchMap[r.id]?.reportMrn ?? "",
        reportVisitDate: matchMap[r.id]?.reportVisitDate ?? "",
        previousStatus: r.status,
      }))

    revalidatePath("/referrals")
    revalidatePath("/")
    return { success: true, count, applied, skipped }
  } catch (e: any) {
    return { error: e?.message ?? "Failed to apply reconciliation." }
  }
}
