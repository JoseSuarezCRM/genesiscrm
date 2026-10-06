"use server"

import { requireSettingsPage } from "@/lib/auth-guard"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"

// Everything here belongs to the embed settings page: admins, or anyone given
// that page's box in User Management (lib/settings-pages.ts).
const requirePageAccess = () => requireSettingsPage("embed")

export async function getEmbedNotificationUsers() {
  await requirePageAccess()
  return prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true, notifyOnEmbedReferral: true },
    orderBy: { name: "asc" },
  })
}

export async function updateEmbedNotifications(userIds: string[]) {
  await requirePageAccess()

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
