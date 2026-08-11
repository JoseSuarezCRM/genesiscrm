// Shared, un-gated helpers for the generic object-association tables. Registry
// keys are "CO:<key>" for custom objects, or built-ins like "REFERRAL"/"PROVIDER".
// Associations are stored with a direction but treated as undirected everywhere —
// every read/dedupe checks both orderings.

import { prisma } from "@/lib/prisma"

// Ensure the data-model relationship between two object types exists.
export async function ensureAssociationDef(a: string, b: string): Promise<void> {
  const existing = await (prisma as any).objectAssociationDef.findFirst({ where: { OR: [{ typeA: a, typeB: b }, { typeA: b, typeB: a }] } })
  if (!existing) await (prisma as any).objectAssociationDef.create({ data: { typeA: a, typeB: b, label: null } })
}

// Ensure a link between two specific records exists (idempotent, direction-agnostic).
// Returns true when it created a new link, false when one already existed.
export async function ensureAssociation(fromType: string, fromId: string, toType: string, toId: string): Promise<boolean> {
  const dup = await (prisma as any).objectAssociation.findFirst({
    where: { OR: [{ fromType, fromId, toType, toId }, { fromType: toType, fromId: toId, toType: fromType, toId: fromId }] },
  })
  if (dup) return false
  await (prisma as any).objectAssociation.create({ data: { fromType, fromId, toType, toId } })
  return true
}
