"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { CallOutcome } from "@prisma/client"
import { runTrigger_SurgeryStatusChanged, runTrigger_SurgeryCallAttemptsReached } from "@/lib/automation-engine"
import { type SurgeryFilters, SURGERY_PAGE_SIZE, buildSurgeryWhere, surgeryOrderBy } from "@/lib/surgery-query"

export async function getSurgeryCases(filters: SurgeryFilters = {}) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const { page = 1, sort, dir = "desc" } = filters
  const skip = (page - 1) * SURGERY_PAGE_SIZE
  const where = buildSurgeryWhere(filters)
  const orderBy = surgeryOrderBy(sort, dir)

  const [cases, total, allMatchingIds] = await Promise.all([
    (prisma as any).surgeryCase.findMany({
      where,
      orderBy,
      take: SURGERY_PAGE_SIZE,
      skip,
      include: {
        _count: { select: { callAttempts: true, documents: true } },
      },
    }),
    (prisma as any).surgeryCase.count({ where }),
    (prisma as any).surgeryCase.findMany({ where, select: { id: true }, orderBy }),
  ])

  return {
    cases,
    total,
    allMatchingIds: (allMatchingIds as { id: string }[]).map((r) => r.id),
    page,
    pageSize: SURGERY_PAGE_SIZE,
  }
}

export async function getSurgeryCase(id: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  return (prisma as any).surgeryCase.findUnique({
    where: { id },
    include: {
      callAttempts: {
        orderBy: { createdAt: "asc" },
        include: { calledBy: { select: { name: true, email: true } } },
      },
      documents: { orderBy: { createdAt: "desc" } },
      createdBy: { select: { name: true, email: true } },
    },
  })
}

export async function createSurgeryCase(data: {
  patientName: string
  mrn?: string | null
  status?: string
  orderingProvider?: string | null
  diagnosis?: string | null
  facility?: string | null
  procedure?: string | null
  surgeryDate?: string | null
  language?: string | null
  email?: string | null
  notes?: string | null
}) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  if (!data.patientName?.trim()) return { error: "Patient name is required" }

  const { surgeryDate, status, patientName, ...rest } = data

  const created = await (prisma as any).surgeryCase.create({
    data: {
      ...rest,
      patientName: patientName.trim(),
      status: status || "NEW",
      surgeryDate: surgeryDate ? new Date(surgeryDate) : null,
      creationDate: new Date(),
      createdById: session.user.id,
    },
  })

  revalidatePath("/surgery")
  return { success: true, id: created.id }
}

export async function updateSurgeryCase(
  id: string,
  data: {
    status?: string
    medicalClearance?: string | null
    secondaryClearance?: string | null
    dentalClearance?: string | null
    ctRequired?: string | null
    glp1?: string | null
    dme?: string | null
    referral?: string | null
    facility?: string | null
    procedure?: string | null
    surgeryDate?: string | null
    language?: string | null
    email?: string | null
    notes?: string | null
  }
) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const { surgeryDate, ...rest } = data

  // Capture the prior status so we can fire the status-changed workflow trigger.
  const prev = data.status
    ? await (prisma as any).surgeryCase.findUnique({ where: { id }, select: { status: true } })
    : null

  // Only write surgeryDate when the caller actually provided it; otherwise a
  // partial update (e.g. a status-only change) would null out the date.
  const updateData: Record<string, unknown> = { ...rest }
  if ("surgeryDate" in data) {
    updateData.surgeryDate = surgeryDate ? new Date(surgeryDate) : null
  }

  await (prisma as any).surgeryCase.update({
    where: { id },
    data: updateData,
  })

  if (data.status && prev?.status && prev.status !== data.status) {
    await runTrigger_SurgeryStatusChanged(id, prev.status, data.status, session.user.id).catch(() => {})
  }

  revalidatePath(`/surgery/${id}`)
  revalidatePath("/surgery")
}

export async function bulkUpdateSurgeryCases(ids: string[], status: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  await (prisma as any).surgeryCase.updateMany({
    where: { id: { in: ids } },
    data: { status },
  })

  revalidatePath("/surgery")
}

export async function bulkDeleteSurgeryCases(ids: string[]) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  await (prisma as any).surgeryCase.deleteMany({
    where: { id: { in: ids } },
  })

  revalidatePath("/surgery")
}

export async function deleteSurgeryCase(id: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  await (prisma as any).surgeryCase.delete({ where: { id } })
  revalidatePath("/surgery")
}

export async function addSurgeryCallAttempt(caseId: string, outcome: string, notes: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  await (prisma as any).surgeryCallAttempt.create({
    data: {
      caseId,
      calledById: session.user.id,
      outcome: outcome as CallOutcome,
      notes: notes || null,
    },
  })

  const callCount = await (prisma as any).surgeryCallAttempt.count({ where: { caseId } })
  await runTrigger_SurgeryCallAttemptsReached(caseId, callCount, session.user.id).catch(() => {})

  revalidatePath(`/surgery/${caseId}`)
}

export async function deleteSurgeryCallAttempt(id: string, caseId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  await (prisma as any).surgeryCallAttempt.delete({ where: { id } })
  revalidatePath(`/surgery/${caseId}`)
}

export async function deleteSurgeryDocument(id: string, caseId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const doc = await (prisma as any).surgeryDocument.findUnique({ where: { id } })
  if (!doc) return

  await (prisma as any).surgeryDocument.delete({ where: { id } })
  revalidatePath(`/surgery/${caseId}`)
}
