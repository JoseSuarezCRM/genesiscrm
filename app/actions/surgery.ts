"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { CallOutcome } from "@prisma/client"

export async function getSurgeryCases() {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  return (prisma as any).surgeryCase.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { callAttempts: true, documents: true } },
    },
  })
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
    facility?: string | null
    procedure?: string | null
    surgeryDate?: string | null
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
