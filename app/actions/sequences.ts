"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { ReferralStatus, StepChannel } from "@prisma/client"

export interface SequenceStepInput {
  id?: string
  order: number
  delayDays: number
  channel: StepChannel
  subject?: string
  body: string
  fromSender?: string
  attachments?: { name: string; contentType: string; url: string; size?: number }[]
}

export interface SequenceFilters {
  referringPracticeId?: string
  insuranceProvider?: string
}

export interface SequenceInput {
  name: string
  description?: string
  isActive: boolean
  trigger: "ON_STATUS_CHANGE" | "ON_CREATE" | "MANUAL"
  triggerStatus?: ReferralStatus | null
  filters: SequenceFilters
  steps: SequenceStepInput[]
}

// ── Auth helper ───────────────────────────────────────────────────────────────

async function requireAdmin() {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") throw new Error("Unauthorized")
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function getSequences() {
  return prisma.sequence.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      steps: { orderBy: { order: "asc" } },
      _count: { select: { enrollments: true } },
    },
  })
}

export async function createSequence(
  input: SequenceInput
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()
  try {
    await prisma.sequence.create({
      data: {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        isActive: input.isActive,
        trigger: input.trigger,
        triggerStatus: input.triggerStatus ?? null,
        filters: input.filters as any,
        steps: {
          create: input.steps.map((s) => ({
            order: s.order,
            delayDays: s.delayDays,
            channel: s.channel,
            subject: s.subject?.trim() || null,
            body: s.body.trim(),
            fromSender: s.fromSender || "referrals",
            attachments: (s.attachments ?? []) as any,
          })),
        },
      },
    })
    revalidatePath("/broadcasts")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Failed to create sequence." }
  }
}

export async function updateSequence(
  id: string,
  input: SequenceInput
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()
  try {
    // Delete all existing steps and recreate (simplest approach for step management)
    await prisma.$transaction([
      prisma.sequenceStep.deleteMany({ where: { sequenceId: id } }),
      prisma.sequence.update({
        where: { id },
        data: {
          name: input.name.trim(),
          description: input.description?.trim() || null,
          isActive: input.isActive,
          trigger: input.trigger,
          triggerStatus: input.triggerStatus ?? null,
          filters: input.filters as any,
          steps: {
            create: input.steps.map((s) => ({
              order: s.order,
              delayDays: s.delayDays,
              channel: s.channel,
              subject: s.subject?.trim() || null,
              body: s.body.trim(),
            })),
          },
        },
      }),
    ])
    revalidatePath("/broadcasts")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Failed to update sequence." }
  }
}

export async function deleteSequence(
  id: string
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()
  try {
    await prisma.sequence.delete({ where: { id } })
    revalidatePath("/broadcasts")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Failed to delete sequence." }
  }
}

export async function toggleSequenceActive(
  id: string,
  isActive: boolean
): Promise<{ success: boolean }> {
  await requireAdmin()
  await prisma.sequence.update({ where: { id }, data: { isActive } })
  revalidatePath("/broadcasts")
  return { success: true }
}

// ── Enrollment ────────────────────────────────────────────────────────────────

/**
 * Enroll a single referral into a sequence, scheduling all step runs.
 * Skips silently if already enrolled.
 */
export async function enrollReferral(
  sequenceId: string,
  referralId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = await prisma.sequenceEnrollment.findUnique({
      where: { sequenceId_referralId: { sequenceId, referralId } },
    })
    if (existing) return { success: true } // already enrolled

    const steps = await prisma.sequenceStep.findMany({
      where: { sequenceId },
      orderBy: { order: "asc" },
    })

    const now = new Date()
    const enrollment = await prisma.sequenceEnrollment.create({
      data: {
        sequenceId,
        referralId,
        stepRuns: {
          create: steps.map((s) => ({
            stepId: s.id,
            scheduledAt: new Date(now.getTime() + s.delayDays * 86_400_000),
          })),
        },
      },
    })
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message }
  }
}

/**
 * Called after a referral is created or its status changes.
 * Finds all active sequences whose trigger matches and enrolls if filters pass.
 */
export async function enrollInMatchingSequences(
  referralId: string,
  event: "ON_CREATE" | "ON_STATUS_CHANGE",
  newStatus?: ReferralStatus
): Promise<void> {
  const sequences = await prisma.sequence.findMany({
    where: {
      isActive: true,
      trigger: event === "ON_CREATE" ? "ON_CREATE" : "ON_STATUS_CHANGE",
      ...(event === "ON_STATUS_CHANGE" && newStatus
        ? { triggerStatus: newStatus }
        : {}),
    },
    include: { steps: true },
  })

  if (sequences.length === 0) return

  const referral = await prisma.referral.findUnique({
    where: { id: referralId },
    select: {
      id: true,
      referringPracticeId: true,
      insuranceProvider: true,
      patientPhone: true,
      patientEmail: true,
    },
  })
  if (!referral) return

  for (const seq of sequences) {
    const filters = seq.filters as SequenceFilters

    // Practice filter
    if (filters.referringPracticeId && referral.referringPracticeId !== filters.referringPracticeId) continue

    // Insurance filter (substring, case-insensitive)
    if (filters.insuranceProvider) {
      const ins = referral.insuranceProvider?.toLowerCase() ?? ""
      if (!ins.includes(filters.insuranceProvider.toLowerCase())) continue
    }

    // Skip if no steps
    if (seq.steps.length === 0) continue

    // Enroll (ignore duplicate errors)
    await enrollReferral(seq.id, referralId).catch(() => {})
  }
}
