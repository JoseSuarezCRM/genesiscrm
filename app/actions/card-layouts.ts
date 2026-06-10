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
    const layout = await prisma.cardLayout.findUnique({
      where: { entityType_cardName: { entityType, cardName } },
    })
    return layout || { entityType, cardName, title: cardName, fields: [] }
  } catch (e) {
    console.warn("CardLayout query failed:", e)
    return { entityType, cardName, title: cardName, fields: [] }
  }
}

export async function updateCardLayout(
  entityType: EntityType,
  cardName: string,
  title: string,
  fields: string[]
) {
  await requireAdmin()

  await prisma.cardLayout.upsert({
    where: { entityType_cardName: { entityType, cardName } },
    create: { entityType, cardName, title, fields },
    update: { title, fields },
  })

  revalidatePath("/referrals")
  revalidatePath("/referring-doctors")
  revalidatePath("/practices")
  return { success: true }
}

export async function getCardLayoutsForEntity(entityType: EntityType) {
  try {
    const layouts = await prisma.cardLayout.findMany({
      where: { entityType },
      orderBy: { order: "asc" },
    })
    return layouts
  } catch (e) {
    console.warn("CardLayout query failed:", e)
    return []
  }
}
