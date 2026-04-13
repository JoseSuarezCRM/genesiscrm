"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const ActivitySchema = z.object({
  practiceId: z.string().optional(),
  locationId: z.string().optional(),
  providerIds: z.array(z.string()).optional(),
  nextStep: z.string().optional(),
  date: z.string().optional(),
  frontDesk: z.string().optional(),
  flyer: z.string().optional(),
  notes: z.string().optional(),
})

export async function createActivity(data: unknown) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }

  const parsed = ActivitySchema.safeParse(data)
  if (!parsed.success) return { error: "Invalid data" }

  const { providerIds = [], date, ...rest } = parsed.data

  try {
    const activity = await prisma.activity.create({
      data: {
        ...rest,
        date: date ? new Date(date) : new Date(),
        createdById: session.user.id,
        providers: providerIds.length
          ? { create: providerIds.map((doctorId) => ({ doctorId })) }
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
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }

  const parsed = ActivitySchema.safeParse(data)
  if (!parsed.success) return { error: "Invalid data" }

  const { providerIds = [], date, ...rest } = parsed.data

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
      },
    })

    revalidatePath("/activities")
    return { success: true }
  } catch (e: any) {
    return { error: e?.message ?? "Failed to update activity." }
  }
}

export async function deleteActivity(id: string) {
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
