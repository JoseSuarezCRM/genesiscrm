"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"

export type CustomPropType =
  | "TEXT" | "LONG_TEXT" | "NUMBER" | "EMAIL" | "PHONE" | "DATE" | "CHECKBOX" | "DROPDOWN" | "MULTI_SELECT" | "URL" | "USER"

export interface CustomObjectProperty {
  id: string
  name: string
  type: CustomPropType
  options?: string[]
  required?: boolean
  primary?: boolean
}

export interface CustomObjectDefLite {
  id: string
  key: string
  singular: string
  plural: string
  icon: string | null
  ownerLabel: string
  properties: CustomObjectProperty[]
  order: number
}

async function requireAdmin() {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") throw new Error("Admin access required")
  return session
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "object"
}

function mapDef(d: any): CustomObjectDefLite {
  return {
    id: d.id, key: d.key, singular: d.singular, plural: d.plural,
    icon: d.icon, ownerLabel: d.ownerLabel,
    properties: (d.properties as CustomObjectProperty[]) ?? [],
    order: d.order,
  }
}

// All custom object definitions (for nav, settings, permissions).
export async function listCustomObjects(): Promise<CustomObjectDefLite[]> {
  const defs = await (prisma as any).customObjectDef.findMany({ orderBy: [{ order: "asc" }, { plural: "asc" }] })
  return defs.map(mapDef)
}

export async function getCustomObject(key: string): Promise<CustomObjectDefLite | null> {
  const d = await (prisma as any).customObjectDef.findUnique({ where: { key } })
  return d ? mapDef(d) : null
}

export async function createCustomObject(data: { singular: string; plural: string; icon?: string }) {
  const session = await requireAdmin()
  const singular = data.singular.trim()
  const plural = data.plural.trim()
  if (!singular || !plural) return { error: "Singular and plural names are required." }

  // Unique key from the plural label.
  let base = slugify(plural), key = base, n = 1
  while (await (prisma as any).customObjectDef.findUnique({ where: { key } })) key = `${base}-${++n}`

  const def = await (prisma as any).customObjectDef.create({
    data: {
      key, singular, plural, icon: data.icon || null,
      ownerLabel: `${singular} Owner`,
      // Every object starts with a primary "Name" text property.
      properties: [{ id: "name", name: "Name", type: "TEXT", primary: true, required: true }],
      createdById: (session!.user as any).id,
    },
  })
  revalidatePath("/settings/objects")
  return { success: true, key: def.key, id: def.id }
}

export async function updateCustomObject(id: string, data: { singular?: string; plural?: string; icon?: string | null }) {
  await requireAdmin()
  const patch: Record<string, unknown> = {}
  if (data.singular !== undefined) { patch.singular = data.singular.trim(); patch.ownerLabel = `${data.singular.trim()} Owner` }
  if (data.plural !== undefined) patch.plural = data.plural.trim()
  if (data.icon !== undefined) patch.icon = data.icon || null
  await (prisma as any).customObjectDef.update({ where: { id }, data: patch })
  revalidatePath("/settings/objects")
  return { success: true }
}

// Replace the object's property schema (the editor manages the array client-side).
export async function saveCustomObjectProperties(id: string, properties: CustomObjectProperty[]) {
  await requireAdmin()
  // Always keep exactly one primary property.
  const hasPrimary = properties.some((p) => p.primary)
  const clean = properties.map((p, i) => ({ ...p, primary: hasPrimary ? !!p.primary : i === 0 }))
  await (prisma as any).customObjectDef.update({ where: { id }, data: { properties: clean } })
  revalidatePath("/settings/objects")
  return { success: true }
}

export async function deleteCustomObject(id: string) {
  await requireAdmin()
  await (prisma as any).customObjectDef.delete({ where: { id } })
  revalidatePath("/settings/objects")
  return { success: true }
}
