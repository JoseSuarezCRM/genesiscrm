"use server"

import { prisma } from "@/lib/prisma"
import { requireAccess, requireDelete } from "@/lib/auth-guard"
import { revalidatePath } from "next/cache"
import { createCardLayout, updateCardLayout, deleteCardLayout } from "@/app/actions/card-layouts"

/**
 * Property-card CRUD for ANY object. Built-in objects store their cards in
 * CardLayout (enum-keyed); custom objects store theirs in RecordCard (string-keyed).
 * The record page calls these, so the UI is identical either way.
 */

function isCustom(objectType: string) {
  return objectType.startsWith("CO:")
}

export async function createRecordCard(objectType: string, title: string, fields: string[], section: "LEFT" | "MIDDLE" = "LEFT") {
  if (!isCustom(objectType)) return createCardLayout(objectType as any, title, fields, section as any)

  await requireAccess(objectType, "EDIT")
  const count = await (prisma as any).recordCard.count({ where: { objectType, section } })
  await (prisma as any).recordCard.create({
    data: { objectType, cardName: `card-${Date.now()}`, title, fields, section, order: count },
  })
  revalidatePath(`/objects/${objectType.slice(3)}/[id]`, "page")
  return { success: true }
}

export async function updateRecordCard(objectType: string, cardName: string, title: string, fields: string[]) {
  if (!isCustom(objectType)) return updateCardLayout(objectType as any, cardName, title, fields)

  await requireAccess(objectType, "EDIT")
  await (prisma as any).recordCard.upsert({
    where: { objectType_cardName: { objectType, cardName } },
    create: { objectType, cardName, title, fields },
    update: { title, fields },
  })
  revalidatePath(`/objects/${objectType.slice(3)}/[id]`, "page")
  return { success: true }
}

export async function deleteRecordCard(objectType: string, cardName: string) {
  if (!isCustom(objectType)) return deleteCardLayout(objectType as any, cardName)

  await requireDelete(objectType)
  await (prisma as any).recordCard.deleteMany({ where: { objectType, cardName } })
  revalidatePath(`/objects/${objectType.slice(3)}/[id]`, "page")
  return { success: true }
}

// Persist the order of a column's cards (materializing default cards on first move).
export async function reorderCards(
  entityType: string,
  section: "LEFT" | "MIDDLE",
  cards: { cardName: string; title: string; fields: string[] }[],
) {
  if (isCustom(entityType)) {
    await requireAccess(entityType, "EDIT")
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i]
      await (prisma as any).recordCard.upsert({
        where: { objectType_cardName: { objectType: entityType, cardName: c.cardName } },
        create: { objectType: entityType, cardName: c.cardName, title: c.title, fields: c.fields, section, order: i },
        update: { order: i, title: c.title, fields: c.fields, section },
      })
    }
    revalidatePath(`/objects/${entityType.slice(3)}/[id]`, "page")
    return { success: true }
  }

  await requireAccess("VIEWS", "EDIT")
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i]
    await prisma.cardLayout.upsert({
      where: { entityType_cardName: { entityType: entityType as any, cardName: c.cardName } },
      create: { entityType: entityType as any, cardName: c.cardName, title: c.title, fields: c.fields, section, order: i },
      update: { order: i, title: c.title, fields: c.fields, section },
    })
  }
  revalidatePath("/referrals/[id]", "page")
  revalidatePath("/referring-doctors/[id]", "page")
  revalidatePath("/practices/[id]", "page")
  revalidatePath("/locations/[id]", "page")
  revalidatePath("/surgery/[id]", "page")
  return { success: true }
}
