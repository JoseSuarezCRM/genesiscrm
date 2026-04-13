"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"

function normalizePhone(s: string | null | undefined): string {
  if (!s) return ""
  return s.replace(/\D/g, "").slice(-10)
}

function normalizeMrn(s: string | null | undefined): string {
  if (!s) return ""
  return s.replace(/\D/g, "")
}

export interface CsvRow {
  mrn: string
  phone1: string
  phone2: string
  patientName: string
  visitDate: string
  apptStatus: string
}

export interface MatchResult {
  csvRow: CsvRow
  referralId: string
  patientName: string
  currentStatus: string
  matchedBy: "mrn" | "phone"
  matchedValue: string
}

/** Clean existing genesisMrn values — strips "MRN: " prefix and non-digit chars */
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

/** Match CSV rows against referrals. Returns preview of what would be updated. */
export async function matchAppointments(rows: CsvRow[]): Promise<{ matches: MatchResult[]; unmatched: number }> {
  const session = await auth()
  if (!session?.user) return { matches: [], unmatched: rows.length }

  // Only try to complete referrals that aren't already done
  const referrals = await prisma.referral.findMany({
    where: { status: { notIn: ["COMPLETED", "NO_SHOW"] } },
    select: {
      id: true,
      patientFirstName: true,
      patientLastName: true,
      patientPhone: true,
      patientMrn: true,
      genesisMrn: true,
      status: true,
    },
  })

  const matches: MatchResult[] = []
  const matchedReferralIds = new Set<string>()

  for (const row of rows) {
    const rowMrn = normalizeMrn(row.mrn)
    const rowPhone1 = normalizePhone(row.phone1)
    const rowPhone2 = normalizePhone(row.phone2)

    let match: (typeof referrals)[number] | undefined
    let matchedBy: "mrn" | "phone" = "mrn"
    let matchedValue = ""

    // 1. Try Genesis MRN first
    if (rowMrn) {
      match = referrals.find(
        (r) => !matchedReferralIds.has(r.id) && normalizeMrn(r.genesisMrn) === rowMrn
      )
      if (match) { matchedBy = "mrn"; matchedValue = rowMrn }
    }

    // 2. Try patient MRN
    if (!match && rowMrn) {
      match = referrals.find(
        (r) => !matchedReferralIds.has(r.id) && normalizeMrn(r.patientMrn) === rowMrn
      )
      if (match) { matchedBy = "mrn"; matchedValue = rowMrn }
    }

    // 3. Try phone number
    if (!match) {
      for (const phone of [rowPhone1, rowPhone2].filter(Boolean)) {
        match = referrals.find(
          (r) =>
            !matchedReferralIds.has(r.id) &&
            normalizePhone(r.patientPhone) === phone
        )
        if (match) { matchedBy = "phone"; matchedValue = phone; break }
      }
    }

    if (match) {
      matchedReferralIds.add(match.id)
      matches.push({
        csvRow: row,
        referralId: match.id,
        patientName: `${match.patientFirstName} ${match.patientLastName}`,
        currentStatus: match.status,
        matchedBy,
        matchedValue,
      })
    }
  }

  return { matches, unmatched: rows.length - matches.length }
}

export interface AppliedRecord {
  id: string
  patientFirstName: string
  patientLastName: string
  genesisMrn: string | null
  patientMrn: string | null
  patientPhone: string | null
  referralDate: string
  previousStatus: string
}

/** Apply reconciliation — mark matched referrals as COMPLETED, return full report */
export async function applyReconciliation(referralIds: string[]) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  if (!referralIds.length) return { error: "No referrals selected." }

  try {
    // Fetch current state before updating (for the report)
    const before = await prisma.referral.findMany({
      where: { id: { in: referralIds } },
      select: {
        id: true,
        patientFirstName: true,
        patientLastName: true,
        genesisMrn: true,
        patientMrn: true,
        patientPhone: true,
        referralDate: true,
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
        patientFirstName: r.patientFirstName,
        patientLastName: r.patientLastName,
        genesisMrn: r.genesisMrn,
        patientMrn: r.patientMrn,
        patientPhone: r.patientPhone,
        referralDate: r.referralDate.toISOString(),
        previousStatus: r.status,
      }))

    // Referrals that were already completed/no-show and skipped
    const skipped = before
      .filter((r) => r.status === "COMPLETED" || r.status === "NO_SHOW")
      .map((r) => ({
        id: r.id,
        patientFirstName: r.patientFirstName,
        patientLastName: r.patientLastName,
        genesisMrn: r.genesisMrn,
        patientMrn: r.patientMrn,
        patientPhone: r.patientPhone,
        referralDate: r.referralDate.toISOString(),
        previousStatus: r.status,
      }))

    revalidatePath("/referrals")
    revalidatePath("/")
    return { success: true, count, applied, skipped }
  } catch (e: any) {
    return { error: e?.message ?? "Failed to apply reconciliation." }
  }
}
