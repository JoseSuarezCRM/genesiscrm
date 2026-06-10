"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"

type EntityType = "REFERRAL" | "PROVIDER" | "PRACTICE"
export type CardSection = "LEFT" | "RIGHT"

// Admin-only guard
async function requireAdmin() {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") {
    throw new Error("Admin access required")
  }
}

function revalidateDetailPages() {
  revalidatePath("/referrals/[id]", "page")
  revalidatePath("/referring-doctors/[id]", "page")
  revalidatePath("/practices/[id]", "page")
}

export async function getCardLayout(entityType: EntityType, cardName: string) {
  try {
    const layout = await prisma.cardLayout.findUnique({
      where: { entityType_cardName: { entityType, cardName } },
    })
    return layout || { entityType, cardName, title: cardName, fields: [], visible: true }
  } catch (e) {
    console.warn("CardLayout query failed:", e)
    return { entityType, cardName, title: cardName, fields: [], visible: true }
  }
}

export async function getCardLayouts(entityType: EntityType, section: CardSection) {
  try {
    return await prisma.cardLayout.findMany({
      where: { entityType, section },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    })
  } catch (e) {
    console.warn("CardLayout query failed:", e)
    return []
  }
}

export async function createCardLayout(
  entityType: EntityType,
  title: string,
  fields: string[],
  section: CardSection = "LEFT"
) {
  await requireAdmin()

  const count = await prisma.cardLayout.count({ where: { entityType, section } })
  await prisma.cardLayout.create({
    data: {
      entityType,
      cardName: `custom-${Date.now()}`,
      title,
      fields,
      section,
      order: count,
    },
  })

  revalidateDetailPages()
  return { success: true }
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

  revalidateDetailPages()
  return { success: true }
}

export async function deleteCardLayout(entityType: EntityType, cardName: string) {
  await requireAdmin()

  await prisma.cardLayout.deleteMany({ where: { entityType, cardName } })

  revalidateDetailPages()
  return { success: true }
}

export async function setCardVisibility(
  entityType: EntityType,
  cardName: string,
  title: string,
  visible: boolean
) {
  await requireAdmin()

  await prisma.cardLayout.upsert({
    where: { entityType_cardName: { entityType, cardName } },
    create: { entityType, cardName, title, fields: [], visible },
    update: { visible },
  })

  revalidateDetailPages()
  return { success: true }
}
