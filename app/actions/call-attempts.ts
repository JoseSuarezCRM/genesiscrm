"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { CallOutcome } from "@prisma/client"
import { runTrigger_CallAttemptsReached } from "@/lib/automation-engine"

async function requireAuth() {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  return session
}

export async function logCallAttempt(data: {
  referralId: string
  outcome: CallOutcome
  notes?: string
}) {
  const session = await requireAuth()

  const count = await prisma.callAttempt.count({
    where: { referralId: data.referralId },
  })
  if (count >= 3) return { error: "Maximum of 3 call attempts reached" }

  const attempt = await prisma.callAttempt.create({
    data: {
      referralId: data.referralId,
      outcome: data.outcome,
      notes: data.notes?.trim() || null,
      calledById: (session.user as any).id,
    },
    include: { calledBy: { select: { name: true, email: true } } },
  })

  revalidatePath(`/referrals/${data.referralId}`)
  revalidatePath("/referrals")

  const newCount = count + 1
  Promise.allSettled([runTrigger_CallAttemptsReached(data.referralId, newCount, (session.user as any).id)])

  return { success: true, attempt }
}

export async function deleteCallAttempt(id: string, referralId: string) {
  await requireAuth()
  await prisma.callAttempt.delete({ where: { id } })
  revalidatePath(`/referrals/${referralId}`)
  revalidatePath("/referrals")
}
