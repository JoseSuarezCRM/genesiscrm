"use server"

import { requireSettingsPage } from "@/lib/auth-guard"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { enforcePropertyLocks, hasLockedProperties } from "@/lib/custom-object-locks"

export type CustomPropType =
  | "TEXT" | "LONG_TEXT" | "NUMBER" | "EMAIL" | "PHONE" | "DATE" | "DATE_TIME" | "CHECKBOX" | "DROPDOWN" | "MULTI_SELECT" | "URL" | "USER"

export interface CustomObjectProperty {
  id: string
  name: string
  type: CustomPropType
  options?: string[]
  optionLabels?: Record<string, string>
  optionColors?: Record<string, string>   // DROPDOWN/MULTI_SELECT: value → hex color
  optionStyle?: string                     // "default" | "dot" | "badge"
  required?: boolean
  primary?: boolean
  // Extended (HubSpot-style) attributes — all optional, stored in the def JSON.
  internalName?: string
  description?: string
  unique?: boolean
  defaultValue?: string
  conditional?: { controllingPropertyId: string; rules: Record<string, string[]> } | null
  visibilityRule?: { controllingKey: string; equals: string[] } | null
  numberFormat?: string   // NUMBER only: "currency" or undefined (plain)
  /**
   * Set on properties that code writes to — the on-call intake's fields, for
   * instance. A locked property can be relabeled, recoloured and given new
   * options, but not deleted, retyped, or stripped of an option value that
   * existing records and filters depend on. Enforced on the server by
   * `enforcePropertyLocks` in lib/custom-object-locks.ts.
   */
  locked?: boolean
}

export interface CustomObjectCard {
  id: string
  title: string
  column: "LEFT" | "MIDDLE"
  propertyIds: string[]
}

export interface CustomObjectDefLite {
  id: string
  key: string
  singular: string
  plural: string
  icon: string | null
  ownerLabel: string
  properties: CustomObjectProperty[]
  cards: CustomObjectCard[]
  order: number
}

// Everything here belongs to the objects settings page: admins, or anyone given
// that page's box in User Management (lib/settings-pages.ts).
const requirePageAccess = () => requireSettingsPage("objects")

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "object"
}

function mapDef(d: any): CustomObjectDefLite {
  return {
    id: d.id, key: d.key, singular: d.singular, plural: d.plural,
    icon: d.icon, ownerLabel: d.ownerLabel,
    properties: (d.properties as CustomObjectProperty[]) ?? [],
    cards: (d.cards as CustomObjectCard[]) ?? [],
    order: d.order,
  }
}

// Replace the detail card layout (title, column, grouped property ids).
export async function saveCustomObjectCards(id: string, cards: CustomObjectCard[]) {
  await requirePageAccess()
  await (prisma as any).customObjectDef.update({ where: { id }, data: { cards } })
  revalidatePath("/settings/objects")
  return { success: true }
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
  const session = await requirePageAccess()
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
      // Every object starts with First + Last name (the record's display name is
      // their concatenation) plus native Email and Phone — the Email and SMS
      // engagement buttons read these when contacting a record.
      properties: [
        { id: "first_name", name: "First Name", type: "TEXT", primary: true, required: true },
        { id: "last_name", name: "Last Name", type: "TEXT" },
        { id: "email", name: "Email", type: "EMAIL" },
        { id: "phone", name: "Phone", type: "PHONE" },
      ],
      createdById: (session!.user as any).id,
    },
  })
  revalidatePath("/settings/objects")
  return { success: true, key: def.key, id: def.id }
}

export async function updateCustomObject(id: string, data: { singular?: string; plural?: string; icon?: string | null }) {
  await requirePageAccess()
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
  // Properties are edited on the Properties settings page, so its box gates them.
  await requireSettingsPage("properties")
  // Properties that code depends on are checked against what is STORED, not
  // what the client sent — see lib/custom-object-locks.ts.
  const current = await (prisma as any).customObjectDef.findUnique({ where: { id }, select: { properties: true } })
  const locked = enforcePropertyLocks((current?.properties ?? []) as CustomObjectProperty[], properties)
  if ("error" in locked) return { error: locked.error }
  properties = locked.properties
  // Always keep exactly one primary property.
  const hasPrimary = properties.some((p) => p.primary)
  const clean = properties.map((p, i) => ({ ...p, primary: hasPrimary ? !!p.primary : i === 0 }))
  await (prisma as any).customObjectDef.update({ where: { id }, data: { properties: clean } })
  revalidatePath("/settings/objects")
  revalidatePath("/settings/properties")
  return { success: true }
}

export async function deleteCustomObject(id: string) {
  await requirePageAccess()
  // Deleting an object deletes every record in it. For one that code depends on
  // — the on-call call log — that would be an entire history of patient calls.
  const def = await (prisma as any).customObjectDef.findUnique({ where: { id }, select: { properties: true } })
  if (hasLockedProperties(def?.properties)) {
    return { error: "This object is used by a built-in feature and can't be deleted." }
  }
  await (prisma as any).customObjectDef.delete({ where: { id } })
  revalidatePath("/settings/objects")
  return { success: true }
}
