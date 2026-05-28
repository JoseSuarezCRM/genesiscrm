"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { CallOutcome } from "@prisma/client"

export interface SurgeryFilters {
  search?: string
  statuses?: string[]
  statusMode?: "any" | "none"
  from?: string
  to?: string
  page?: number
}

const PAGE_SIZE = 20

export async function getSurgeryCases(filters: SurgeryFilters = {}) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const { search, statuses = [], statusMode = "any", from, to, page = 1 } = filters
  const skip = (page - 1) * PAGE_SIZE

  const where: Record<string, unknown> = {}

  if (statuses.length > 0) {
    where.status = statusMode === "none" ? { notIn: statuses } : { in: statuses }
  }

  if (from || to) {
    where.creationDate = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    }
  }

  if (search?.trim()) {
    where.OR = [
      { patientName: { contains: search.trim(), mode: "insensitive" } },
      { mrn: { contains: search.trim(), mode: "insensitive" } },
    ]
  }

  const [cases, total, allMatchingIds] = await Promise.all([
    (prisma as any).surgeryCase.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip,
      include: {
        _count: { select: { callAttempts: true, documents: true } },
      },
    }),
    (prisma as any).surgeryCase.count({ where }),
    (prisma as any).surgeryCase.findMany({ where, select: { id: true }, orderBy: { createdAt: "desc" } }),
  ])

  return {
    cases,
    total,
    allMatchingIds: (allMatchingIds as { id: string }[]).map((r) => r.id),
    page,
    pageSize: PAGE_SIZE,
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

export async function updateSurgeryCase(
  id: string,
  data: {
    status?: string
    clearanceRequired?: string | null
    ctRequired?: string | null
    glp1?: string | null
    dme?: string | null
    referral?: string | null
    facility?: string | null
    procedure?: string | null
    surgeryDate?: string | null
    email?: string | null
    notes?: string | null
  }
) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const { surgeryDate, ...rest } = data

  await (prisma as any).surgeryCase.update({
    where: { id },
    data: {
      ...rest,
      surgeryDate: surgeryDate ? new Date(surgeryDate) : null,
    },
  })

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
