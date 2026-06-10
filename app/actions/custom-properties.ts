"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"

interface CreateCustomPropertyInput {
  name: string
  type: "TEXT" | "LONG_TEXT" | "NUMBER" | "EMAIL" | "PHONE" | "DATE" | "CHECKBOX" | "DROPDOWN" | "MULTI_SELECT" | "URL"
  entityType: "REFERRAL" | "PROVIDER" | "PRACTICE"
  required?: boolean
  description?: string
  options?: string[]
}

interface UpdateCustomPropertyInput extends Partial<CreateCustomPropertyInput> {
  id: string
}

// Admin-only guard
async function requireAdmin() {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") {
    throw new Error("Admin access required")
  }
}

export async function listCustomProperties(entityType: "REFERRAL" | "PROVIDER" | "PRACTICE") {
  return prisma.customProperty.findMany({
    where: { entityType },
    orderBy: { createdAt: "asc" },
  })
}

export async function createCustomProperty(data: CreateCustomPropertyInput) {
  await requireAdmin()

  // Check for duplicate
  const existing = await prisma.customProperty.findFirst({
    where: { name: data.name, entityType: data.entityType },
  })
  if (existing) {
    return { error: `A property named "${data.name}" already exists for this entity type` }
  }

  try {
    const prop = await prisma.customProperty.create({
      data: {
        name: data.name,
        type: data.type,
        entityType: data.entityType,
        required: data.required || false,
        description: data.description,
        options: data.options || [],
      },
    })
    revalidatePath("/settings/custom-properties")
    return { success: true, id: prop.id }
  } catch (err: any) {
    return { error: err.message }
  }
}

export async function updateCustomProperty(data: UpdateCustomPropertyInput) {
  await requireAdmin()
  const { id, ...rest } = data

  try {
    await prisma.customProperty.update({
      where: { id },
      data: {
        name: rest.name,
        description: rest.description,
        required: rest.required,
        options: rest.options,
      },
    })
    revalidatePath("/settings/custom-properties")
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
}

export async function deleteCustomProperty(id: string) {
  await requireAdmin()

  try {
    await prisma.customProperty.delete({ where: { id } })
    revalidatePath("/settings/custom-properties")
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
}

export async function saveCustomPropertyValue(
  entityType: "REFERRAL" | "PROVIDER" | "PRACTICE",
  entityId: string,
  customPropertyId: string,
  value: any
) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  try {
    if (entityType === "REFERRAL") {
      const current = await prisma.referral.findUnique({ where: { id: entityId }, select: { customProperties: true } })
      const props = (current?.customProperties as Record<string, any>) || {}
      props[customPropertyId] = value
      await prisma.referral.update({ where: { id: entityId }, data: { customProperties: props } })
    } else if (entityType === "PROVIDER") {
      const current = await prisma.referringDoctor.findUnique({ where: { id: entityId }, select: { customProperties: true } })
      const props = (current?.customProperties as Record<string, any>) || {}
      props[customPropertyId] = value
      await prisma.referringDoctor.update({ where: { id: entityId }, data: { customProperties: props } })
    } else {
      const current = await prisma.referringPractice.findUnique({ where: { id: entityId }, select: { customProperties: true } })
      const props = (current?.customProperties as Record<string, any>) || {}
      props[customPropertyId] = value
      await prisma.referringPractice.update({ where: { id: entityId }, data: { customProperties: props } })
    }

    revalidatePath(`/${entityType === "REFERRAL" ? "referrals" : entityType === "PROVIDER" ? "referring-doctors" : "practices"}/${entityId}`)
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
}
