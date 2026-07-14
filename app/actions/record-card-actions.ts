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
