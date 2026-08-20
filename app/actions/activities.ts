"use server"

import { requireAccess, requireDelete } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const ActivitySchema = z.object({
  practiceId: z.string().optional(),
  locationId: z.string().optional(),
  providerIds: z.array(z.string()).optional(),
  tagIds: z.array(z.string()).optional(),
  nextStep: z.string().optional(),
  date: z.string().optional(),
  frontDesk: z.string().optional(),
  flyer: z.string().optional(),
  notes: z.string().optional(),
  rating: z.coerce.number().int().min(1).max(6).nullable().optional(),
  meetingRating: z.coerce.number().int().min(1).max(6).nullable().optional(),
})

export async function createActivity(data: unknown) {
  await requireAccess("ACTIVITIES", "EDIT")
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }

  const parsed = ActivitySchema.safeParse(data)
  if (!parsed.success) return { error: "Invalid data" }

  const { providerIds = [], tagIds = [], date, ...rest } = parsed.data

  try {
    const activity = await prisma.activity.create({
      data: {
        ...rest,
        date: date ? new Date(date) : new Date(),
        createdById: session.user.id,
        providers: providerIds.length
          ? { create: providerIds.map((doctorId) => ({ doctorId })) }
          : undefined,
        tags: tagIds.length
          ? { create: tagIds.map((tagId) => ({ tagId })) }
          : undefined,
      },
    })

    revalidatePath("/activities")
    return { success: true, id: activity.id }
  } catch (e: any) {
    return { error: e?.message ?? "Failed to create activity." }
  }
}

export async function updateActivity(id: string, data: unknown) {
  await requireAccess("ACTIVITIES", "EDIT")
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }

  const parsed = ActivitySchema.safeParse(data)
  if (!parsed.success) return { error: "Invalid data" }

  const { providerIds = [], tagIds = [], date, ...rest } = parsed.data

  try {
    await prisma.activity.update({
      where: { id },
      data: {
        ...rest,
        date: date ? new Date(date) : undefined,
        providers: {
          deleteMany: {},
          create: providerIds.map((doctorId) => ({ doctorId })),
        },
        tags: {
          deleteMany: {},
          create: tagIds.map((tagId) => ({ tagId })),
        },
      },
    })

    revalidatePath("/activities")
    return { success: true }
  } catch (e: any) {
    return { error: e?.message ?? "Failed to update activity." }
  }
}

export async function deleteActivity(id: string) {
  await requireDelete("ACTIVITIES")
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }

  try {
    await prisma.activity.delete({ where: { id } })
    revalidatePath("/activities")
    return { success: true }
  } catch (e: any) {
    return { error: e?.message ?? "Failed to delete activity." }
  }
}
