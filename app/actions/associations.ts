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
