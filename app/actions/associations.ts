"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { requireAccess } from "@/lib/auth-guard"
import { revalidatePath } from "next/cache"
import { resolverFor, labelFor, listObjectTypes, type RegistryRecord } from "@/lib/object-registry"

async function requireAdmin() {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") throw new Error("Admin access required")
}

// The permission object key that gates editing records of a given type.
function permKeyFor(typeKey: string): string {
  if (typeKey.startsWith("CO:")) return typeKey
  return ({ REFERRAL: "REFERRALS", PROVIDER: "PROVIDERS", PRACTICE: "PRACTICES", LOCATION: "LOCATIONS", SURGERY: "SURGERY" } as Record<string, string>)[typeKey] ?? typeKey
}

export { listObjectTypes }

// ── Association definitions (Data Model) ─────────────────────────────────────
export async function listAssociationDefs() {
  const defs = await (prisma as any).objectAssociationDef.findMany({ orderBy: { createdAt: "asc" } })
  return Promise.all(defs.map(async (d: any) => ({
    id: d.id, typeA: d.typeA, typeB: d.typeB, label: d.label,
    labelA: await labelFor(d.typeA), labelB: await labelFor(d.typeB),
  })))
}

export async function createAssociationDef(typeA: string, typeB: string, label?: string) {
  await requireAdmin()
  if (!typeA || !typeB || typeA === typeB) return { error: "Pick two different objects." }
  const existing = await (prisma as any).objectAssociationDef.findFirst({
    where: { OR: [{ typeA, typeB }, { typeA: typeB, typeB: typeA }] },
  })
  if (existing) return { error: "These objects are already related." }
  await (prisma as any).objectAssociationDef.create({ data: { typeA, typeB, label: label?.trim() || null } })
  revalidatePath("/settings/data-model")
  return { success: true }
}

export async function deleteAssociationDef(id: string) {
  await requireAdmin()
  await (prisma as any).objectAssociationDef.delete({ where: { id } })
  revalidatePath("/settings/data-model")
  return { success: true }
}

// ── Association instances ────────────────────────────────────────────────────

// Which other types this type can associate with (from the defs).
async function relatedTypes(typeKey: string): Promise<string[]> {
  const defs = await (prisma as any).objectAssociationDef.findMany({ where: { OR: [{ typeA: typeKey }, { typeB: typeKey }] } })
  return defs.map((d: any) => (d.typeA === typeKey ? d.typeB : d.typeA))
}

export interface AssociationGroup { type: string; label: string; records: RegistryRecord[] }

// Associated records for a record, grouped by related object type (incl. empty groups).
export async function getAssociationsFor(typeKey: string, recordId: string): Promise<AssociationGroup[]> {
  const others = await relatedTypes(typeKey)
  const links = await (prisma as any).objectAssociation.findMany({
    where: { OR: [{ fromType: typeKey, fromId: recordId }, { toType: typeKey, toId: recordId }] },
  })
  const groups: AssociationGroup[] = []
  for (const other of others) {
    // Ids of `other`-type records linked to this record (either direction).
    const otherIds: string[] = links
      .map((l: any) => {
        if (l.fromType === typeKey && l.fromId === recordId && l.toType === other) return l.toId
        if (l.toType === typeKey && l.toId === recordId && l.fromType === other) return l.fromId
        return null
      })
      .filter(Boolean)
    const resolver = await resolverFor(other)
    const records = resolver && otherIds.length ? await resolver.byIds(otherIds) : []
    groups.push({ type: other, label: await labelFor(other), records })
  }
  return groups
}

// Search records of a type for the "add association" picker.
export async function searchAssociableRecords(typeKey: string, q: string): Promise<RegistryRecord[]> {
  const session = await auth()
  if (!session?.user) return []
  const resolver = await resolverFor(typeKey)
  return resolver ? resolver.list(q) : []
}

export async function associateRecords(typeKey: string, recordId: string, otherType: string, otherId: string) {
  await requireAccess(permKeyFor(typeKey), "EDIT")
  const dup = await (prisma as any).objectAssociation.findFirst({
    where: {
      OR: [
        { fromType: typeKey, fromId: recordId, toType: otherType, toId: otherId },
        { fromType: otherType, fromId: otherId, toType: typeKey, toId: recordId },
      ],
    },
  })
  if (!dup) {
    await (prisma as any).objectAssociation.create({ data: { fromType: typeKey, fromId: recordId, toType: otherType, toId: otherId } })
  }
  if (typeKey.startsWith("CO:")) revalidatePath(`/objects/${typeKey.slice(3)}/${recordId}`)
  return { success: true }
}

export async function unassociateRecords(typeKey: string, recordId: string, otherType: string, otherId: string) {
  await requireAccess(permKeyFor(typeKey), "EDIT")
  await (prisma as any).objectAssociation.deleteMany({
    where: {
      OR: [
        { fromType: typeKey, fromId: recordId, toType: otherType, toId: otherId },
        { fromType: otherType, fromId: otherId, toType: typeKey, toId: recordId },
      ],
    },
  })
  if (typeKey.startsWith("CO:")) revalidatePath(`/objects/${typeKey.slice(3)}/${recordId}`)
  return { success: true }
}

// ── Native (FK-based) associations ───────────────────────────────────────────
// The right-column cards for a built-in object's own relationships (a referral's
// practice/provider/location, a practice's locations/providers/referrals, …) are
// FK links, not rows in objectAssociation. Adding/removing sets the FK (or a
// DoctorLocation join row). Required FKs (a location/provider must belong to a
// practice) can be reassigned but not cleared.

function detailPath(type: string, id: string): string | null {
  return ({ REFERRAL: `/referrals/${id}`, PROVIDER: `/referring-doctors/${id}`, PRACTICE: `/practices/${id}`, LOCATION: `/locations/${id}` } as Record<string, string>)[type] ?? null
}

// The object type you search when adding to a native card (e.g. NATIVE_PROVIDERS
// → PROVIDER). Kept in sync with the same mapping in lib/record-associations.ts.
function nativeCardObjectType(cardType: string): string | null {
  if (cardType === "NATIVE_PRACTICE") return "PRACTICE"
  if (cardType === "NATIVE_PROVIDER" || cardType === "NATIVE_PROVIDERS") return "PROVIDER"
  if (cardType === "NATIVE_LOCATION" || cardType === "NATIVE_LOCATIONS") return "LOCATION"
  if (cardType === "NATIVE_REFERRALS") return "REFERRAL"
  return null
}

export async function setNativeAssociation(
  recordType: string, recordId: string, cardType: string, otherId: string, action: "add" | "remove",
) {
  await requireAccess(permKeyFor(recordType), "EDIT")
  const add = action === "add"
  const requiredMsg = "This link is required — pick a different one to move it instead of removing it."

  if (recordType === "REFERRAL") {
    const field = cardType === "NATIVE_PRACTICE" ? "referringPracticeId"
      : cardType === "NATIVE_PROVIDER" ? "referringDoctorId"
      : cardType === "NATIVE_LOCATION" ? "referringLocationId" : null
    if (!field) return { error: "Unsupported association." }
    await prisma.referral.update({ where: { id: recordId }, data: { [field]: add ? otherId : null } })
  } else if (recordType === "PRACTICE") {
    if (cardType === "NATIVE_LOCATIONS") {
      if (!add) return { error: requiredMsg }
      await prisma.practiceLocation.update({ where: { id: otherId }, data: { practiceId: recordId } })
    } else if (cardType === "NATIVE_PROVIDERS") {
      if (!add) return { error: requiredMsg }
      await prisma.referringDoctor.update({ where: { id: otherId }, data: { practiceId: recordId } })
    } else if (cardType === "NATIVE_REFERRALS") {
      await prisma.referral.update({ where: { id: otherId }, data: { referringPracticeId: add ? recordId : null } })
    } else return { error: "Unsupported association." }
  } else if (recordType === "PROVIDER") {
    if (cardType === "NATIVE_PRACTICE") {
      if (!add) return { error: requiredMsg }
      await prisma.referringDoctor.update({ where: { id: recordId }, data: { practiceId: otherId } })
    } else if (cardType === "NATIVE_LOCATIONS") {
      if (add) await prisma.doctorLocation.upsert({ where: { doctorId_locationId: { doctorId: recordId, locationId: otherId } }, create: { doctorId: recordId, locationId: otherId }, update: {} })
      else await prisma.doctorLocation.deleteMany({ where: { doctorId: recordId, locationId: otherId } })
    } else if (cardType === "NATIVE_REFERRALS") {
      await prisma.referral.update({ where: { id: otherId }, data: { referringDoctorId: add ? recordId : null } })
    } else return { error: "Unsupported association." }
  } else if (recordType === "LOCATION") {
    if (cardType === "NATIVE_PRACTICE") {
      if (!add) return { error: requiredMsg }
      await prisma.practiceLocation.update({ where: { id: recordId }, data: { practiceId: otherId } })
    } else if (cardType === "NATIVE_PROVIDERS") {
      if (add) await prisma.doctorLocation.upsert({ where: { doctorId_locationId: { doctorId: otherId, locationId: recordId } }, create: { doctorId: otherId, locationId: recordId }, update: {} })
      else await prisma.doctorLocation.deleteMany({ where: { doctorId: otherId, locationId: recordId } })
    } else if (cardType === "NATIVE_REFERRALS") {
      await prisma.referral.update({ where: { id: otherId }, data: { referringLocationId: add ? recordId : null } })
    } else return { error: "Unsupported association." }
  } else {
    return { error: "Unsupported association." }
  }

  const here = detailPath(recordType, recordId)
  if (here) revalidatePath(here)
  const other = detailPath(nativeCardObjectType(cardType) ?? "", otherId)
  if (other) revalidatePath(other)
  return { success: true }
}

// ── Right-column association cards (every object: built-in + custom) ──────────

export async function getAssociationCardPrefs(objectType: string) {
  const session = await auth()
  if (!session?.user) return []
  return (prisma as any).associationCardPref.findMany({ where: { objectType }, orderBy: { order: "asc" } })
}

export async function setAssociationCardVisible(objectType: string, cardType: string, visible: boolean) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  await (prisma as any).associationCardPref.upsert({
    where: { objectType_cardType: { objectType, cardType } },
    create: { objectType, cardType, visible },
    update: { visible },
  })
  revalidatePath("/", "layout")
  return { success: true }
}

// Persist the right-column card order (the full ordered list of card types).
export async function reorderAssociationCards(objectType: string, cardTypes: string[]) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  for (let i = 0; i < cardTypes.length; i++) {
    await (prisma as any).associationCardPref.upsert({
      where: { objectType_cardType: { objectType, cardType: cardTypes[i] } },
      create: { objectType, cardType: cardTypes[i], visible: true, order: i },
      update: { order: i },
    })
  }
  revalidatePath("/", "layout")
  return { success: true }
}
