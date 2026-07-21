"use server"

import { requireAccess, requireDelete } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { cpMeta, type CPEntity } from "@/lib/custom-property-entities"

// One delegate per object that carries a customProperties JSON bag.
function cpDelegate(type: CPEntity): any {
  return ({
    REFERRAL: prisma.referral,
    PROVIDER: prisma.referringDoctor,
    PRACTICE: prisma.referringPractice,
    LOCATION: prisma.practiceLocation,
    SURGERY: prisma.surgeryCase,
    ACTIVITY: prisma.activity,
    TASK: prisma.task,
  } as any)[type]
}

interface CreateCustomPropertyInput {
  name: string
  type: "TEXT" | "LONG_TEXT" | "NUMBER" | "EMAIL" | "PHONE" | "DATE" | "DATE_TIME" | "CHECKBOX" | "DROPDOWN" | "MULTI_SELECT" | "URL"
  entityType: CPEntity
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

export async function listCustomProperties(entityType: CPEntity) {
  return prisma.customProperty.findMany({
    where: { entityType },
    orderBy: { createdAt: "asc" },
  })
}

export async function createCustomProperty(data: CreateCustomPropertyInput) {
  await requireAccess("CUSTOM_PROPERTIES", "EDIT")
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
  await requireAccess("CUSTOM_PROPERTIES", "EDIT")
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
  await requireDelete("CUSTOM_PROPERTIES")
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
  entityType: CPEntity,
  entityId: string,
  customPropertyId: string,
  value: any
) {
  // Filling a property value is editing that record — gate by the object's Edit access.
  const meta = cpMeta(entityType)
  await requireAccess(meta.object, "EDIT")
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  try {
    const model = cpDelegate(entityType)
    const current = await model.findUnique({ where: { id: entityId }, select: { customProperties: true } })
    const props = (current?.customProperties as Record<string, any>) || {}
    props[customPropertyId] = value
    await model.update({ where: { id: entityId }, data: { customProperties: props } })

    revalidatePath(`/${meta.basePath}/${entityId}`)
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
}
