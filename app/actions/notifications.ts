"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"

export async function markNotificationRead(id: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  await prisma.notification.updateMany({
    where: { id, userId: session.user.id },
    data: { read: true },
  })
  revalidatePath("/")
  return { success: true }
}

export async function markAllNotificationsRead() {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  await prisma.notification.updateMany({
    where: { userId: session.user.id, read: false },
    data: { read: true },
  })
  revalidatePath("/")
  return { success: true }
}
