"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"

type EntityType = "REFERRAL" | "PROVIDER" | "PRACTICE"

// Admin-only guard
async function requireAdmin() {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") {
    throw new Error("Admin access required")
  }
}

export async function getCardLayout(entityType: EntityType, cardName: string) {
  try {
    const layout = await (prisma as any).cardLayout.findUnique({
      where: { entityType_cardName: { entityType, cardName } },
    })
    return layout || { fields: [], title: cardName }
  } catch (e) {
    console.warn("CardLayout query failed:", e)
    return { fields: [], title: cardName }
  }
}

export async function updateCardLayout(
  entityType: EntityType,
  cardName: string,
  title: string,
  fields: string[]
) {
  await requireAdmin()

  try {
    const prismaAny = prisma as any
    const existing = await prismaAny.cardLayout.findUnique({
      where: { entityType_cardName: { entityType, cardName } },
    })

    if (existing) {
      await prismaAny.cardLayout.update({
        where: { id: existing.id },
        data: { title, fields },
      })
    } else {
      await prismaAny.cardLayout.create({
        data: { entityType, cardName, title, fields },
      })
    }
  } catch (e) {
    console.warn("CardLayout update failed:", e)
  }

  revalidatePath("/referrals")
  revalidatePath("/referring-doctors")
  revalidatePath("/practices")
  return { success: true }
}

export async function getCardLayoutsForEntity(entityType: EntityType) {
  try {
    const layouts = await (prisma as any).cardLayout.findMany({
      where: { entityType },
      orderBy: { order: "asc" },
    })
    return layouts
  } catch (e) {
    console.warn("CardLayout query failed:", e)
    return []
  }
}
