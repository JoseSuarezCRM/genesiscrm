"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"

async function requireAdmin() {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  if ((session.user as { role?: string }).role !== "ADMIN") {
    throw new Error("Admin access required")
  }
}

export async function getEmbedNotificationUsers() {
  await requireAdmin()
  return prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true, notifyOnEmbedReferral: true },
    orderBy: { name: "asc" },
  })
}

export async function updateEmbedNotifications(userIds: string[]) {
  await requireAdmin()

  await prisma.$transaction([
    prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { notifyOnEmbedReferral: true },
    }),
    prisma.user.updateMany({
      where: { id: { notIn: userIds } },
      data: { notifyOnEmbedReferral: false },
    }),
  ])

  revalidatePath("/settings/embed")
  return { success: true }
}
