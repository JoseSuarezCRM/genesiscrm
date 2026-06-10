"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"

type EntityType = "REFERRAL" | "PROVIDER" | "PRACTICE"

interface PropertyDisplay {
  id: string
  customPropertyId: string
  visible: boolean
  order: number
}

// Admin-only guard
async function requireAdmin() {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") {
    throw new Error("Admin access required")
  }
}

export async function getPropertyDisplays(entityType: EntityType) {
  const properties = await prisma.customProperty.findMany({
    where: { entityType },
    orderBy: { createdAt: "asc" },
  })

  const displays = await prisma.propertyDisplayConfig.findMany({
    where: { entityType },
  })

  // Return all properties with their display config
  return properties.map((prop) => {
    const display = displays.find((d) => d.customPropertyId === prop.id)
    return {
      id: prop.id,
      name: prop.name,
      type: prop.type,
      visible: display?.visible ?? true,
      order: display?.order ?? 0,
    }
  })
}

export async function updatePropertyDisplay(
  customPropertyId: string,
  entityType: EntityType,
  visible: boolean,
  order: number
) {
  await requireAdmin()

  const existing = await prisma.propertyDisplayConfig.findFirst({
    where: { customPropertyId, entityType },
  })

  if (existing) {
    await prisma.propertyDisplayConfig.update({
      where: { id: existing.id },
      data: { visible, order },
    })
  } else {
    await prisma.propertyDisplayConfig.create({
      data: { customPropertyId, entityType, visible, order },
    })
  }

  revalidatePath("/settings/customization")
  return { success: true }
}

export async function updatePropertyOrder(
  entityType: EntityType,
  updates: Array<{ customPropertyId: string; order: number }>
) {
  await requireAdmin()

  await Promise.all(
    updates.map((update) =>
      updatePropertyDisplay(
        update.customPropertyId,
        entityType,
        true,
        update.order
      )
    )
  )

  revalidatePath("/settings/customization")
  return { success: true }
}

export async function togglePropertyVisibility(
  customPropertyId: string,
  entityType: EntityType,
  visible: boolean
) {
  await requireAdmin()

  const existing = await prisma.propertyDisplayConfig.findFirst({
    where: { customPropertyId, entityType },
  })

  if (existing) {
    await prisma.propertyDisplayConfig.update({
      where: { id: existing.id },
      data: { visible },
    })
  } else {
    await prisma.propertyDisplayConfig.create({
      data: { customPropertyId, entityType, visible, order: 0 },
    })
  }

  revalidatePath("/settings/customization")
  return { success: true }
}
