"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { runImportBatch, startImportRun } from "@/app/actions/import-records"
import { attributeReferralSources } from "@/lib/appointment-source"

// The object the weekly completed-appointments file is imported into.
// NOT exported: a "use server" module may only export async functions.
const APPOINTMENTS_OBJECT_KEY = "appointments"
// Synthetic column carrying the reconciliation's matched referral id, so the shared
// importer creates (and records for Undo) the Appointment↔Referral association.
const REFERRAL_COL = "__referralId"

function normalizeMrn(s: string | null | undefined): string {
  if (!s) return ""
  return s.replace(/\D/g, "")
}

export interface CsvRow {
  mrn: string
  patientName: string
  visitDate: string
  dob?: string
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

/** Properties of the Appointments object, for the column-mapping step. */
export async function getAppointmentProperties(): Promise<{ id: string; name: string; type: string }[]> {
  const session = await auth()
  if (!session?.user) return []
  const def = await (prisma as any).customObjectDef.findUnique({
    where: { key: APPOINTMENTS_OBJECT_KEY }, select: { properties: true },
  }).catch(() => null)
  return (((def?.properties as any[]) ?? []) as any[]).map((p) => ({ id: p.id, name: p.name, type: p.type }))
}

// ── Remembered column mapping (the weekly file has the same shape each time) ──

export async function getImportMapping(objectKey: string): Promise<Record<string, string>> {
  const session = await auth()
  if (!session?.user) return {}
  const row = await (prisma as any).importMappingConfig.findUnique({ where: { objectKey } }).catch(() => null)
  return (row?.fieldMap as Record<string, string>) ?? {}
}

export async function saveImportMapping(objectKey: string, fieldMap: Record<string, string>) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  await (prisma as any).importMappingConfig.upsert({
    where: { objectKey }, create: { objectKey, fieldMap }, update: { fieldMap },
  }).catch(() => {})
  return { success: true }
}

export interface ReconcileImportResult {
  created: number
  skipped: number
  importErrors: { row: number; message: string }[]
  sourcesMatched: number
  sourceNote?: string
  runId?: string
  applied?: AppliedRecord[]
  error?: string
}

/**
 * One commit for the weekly upload: import every row as an Appointment record (via
 * the shared importer, so it lands in Import History with Undo), set the reconciled
 * referral statuses, and attribute IntakeQ referral sources to the new records.
 */
export async function applyReconciliationImport(input: {
  rows: Record<string, string>[]
  fieldMap: Record<string, string>
  referralIdByRow: Record<number, string>
  completedIds: string[]
  noShowIds: string[]
  matchMap: Record<string, { reportMrn: string; reportVisitDate: string }>
}): Promise<ReconcileImportResult> {
  const session = await auth()
  if (!session?.user) return { created: 0, skipped: 0, importErrors: [], sourcesMatched: 0, error: "Unauthorized" }

  const base: ReconcileImportResult = { created: 0, skipped: 0, importErrors: [], sourcesMatched: 0 }

  // 1) Import the rows as Appointment records (create-only — each upload is a new week).
  const run = await startImportRun(APPOINTMENTS_OBJECT_KEY)
  if (run.error || !run.runId) return { ...base, error: run.error ?? "Couldn't start the import." }
  const runId = run.runId

  const rows = input.rows.map((r, i) => ({ ...r, [REFERRAL_COL]: input.referralIdByRow[i] ?? "" }))
  const config = {
    fieldMap: input.fieldMap,
    assocMap: [{ column: REFERRAL_COL, targetType: "REFERRAL" }],
    mode: "createOnly" as const,
  }

  const CHUNK = 200
  for (let i = 0; i < rows.length; i += CHUNK) {
    const res = await runImportBatch(APPOINTMENTS_OBJECT_KEY, config, rows.slice(i, i + CHUNK), i, runId)
    if (res.error) return { ...base, error: res.error, runId }
    base.created += res.created
    base.skipped += res.skipped
    base.importErrors.push(...res.errors)
  }

  // 2) Referral statuses (unchanged reconciliation behaviour).
  const statusRes = await applyReconciliation(input.completedIds, input.noShowIds, input.matchMap)
  const applied = (statusRes as any).applied as AppliedRecord[] | undefined

  // 3) Attribute IntakeQ referral sources to exactly the records this run created.
  const changes: { recordId: string }[] = await (prisma as any).importRunChange
    .findMany({ where: { runId, kind: "create" }, select: { recordId: true } }).catch(() => [])
  let sourcesMatched = 0
  let sourceNote: string | undefined
  if (changes.length) {
    const attr = await attributeReferralSources({ recordIds: changes.map((c) => c.recordId) })
    sourcesMatched = attr.matched
    sourceNote = attr.error
  }

  revalidatePath(`/objects/${APPOINTMENTS_OBJECT_KEY}`)
  revalidatePath("/referrals")
  return { ...base, sourcesMatched, sourceNote, runId, applied }
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
