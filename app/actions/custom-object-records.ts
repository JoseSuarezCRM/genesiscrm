"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { requireAccess, requireDelete } from "@/lib/auth-guard"
import { revalidatePath } from "next/cache"
import { runTrigger_RecordCreated, runTrigger_RecordPropertyChanged, runTrigger_RecordOwnerChanged } from "@/lib/automation-engine"

// Records are gated by the object's own permission key: "CO:<objectKey>".
function objKey(key: string) { return `CO:${key}` }

export interface CustomRecordRow {
  id: string
  recordNumber: number | null
  values: Record<string, any>
  ownerId: string | null
  ownerName: string | null
  createdById: string | null
  createdByName: string | null
  updatedById: string | null
  updatedByName: string | null
  lastViewedById: string | null
  lastViewedByName: string | null
  lastViewedAt: string | Date | null
  createdAt: string | Date
  updatedAt: string | Date
}

async function resolveNames(ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean) as string[]))
  if (unique.length === 0) return {}
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, email: true } })
  return Object.fromEntries(users.map((u) => [u.id, u.name ?? u.email]))
}

export async function listCustomObjectRecords(objectKey: string): Promise<CustomRecordRow[]> {
  await requireAccess(objKey(objectKey), "VIEW")
  const def = await (prisma as any).customObjectDef.findUnique({ where: { key: objectKey }, select: { id: true } })
  if (!def) return []
  const records = await (prisma as any).customObjectRecord.findMany({
    where: { objectDefId: def.id },
    orderBy: { createdAt: "desc" },
  })
  const names = await resolveNames(records.flatMap((r: any) => [r.ownerId, r.createdById, r.updatedById, r.lastViewedById]))
  return records.map((r: any) => ({
    id: r.id,
    recordNumber: r.recordNumber ?? null,
    values: (r.values as Record<string, any>) ?? {},
    ownerId: r.ownerId, ownerName: r.ownerId ? names[r.ownerId] ?? null : null,
    createdById: r.createdById, createdByName: r.createdById ? names[r.createdById] ?? null : null,
    updatedById: r.updatedById, updatedByName: r.updatedById ? names[r.updatedById] ?? null : null,
    lastViewedById: r.lastViewedById, lastViewedByName: r.lastViewedById ? names[r.lastViewedById] ?? null : null,
    lastViewedAt: r.lastViewedAt, createdAt: r.createdAt, updatedAt: r.updatedAt,
  }))
}

export async function getCustomObjectRecord(objectKey: string, id: string): Promise<CustomRecordRow | null> {
  await requireAccess(objKey(objectKey), "VIEW")
  const r = await (prisma as any).customObjectRecord.findUnique({ where: { id } })
  if (!r) return null
  const names = await resolveNames([r.ownerId, r.createdById, r.updatedById, r.lastViewedById])
  return {
    id: r.id, recordNumber: r.recordNumber ?? null, values: (r.values as Record<string, any>) ?? {},
    ownerId: r.ownerId, ownerName: r.ownerId ? names[r.ownerId] ?? null : null,
    createdById: r.createdById, createdByName: r.createdById ? names[r.createdById] ?? null : null,
    updatedById: r.updatedById, updatedByName: r.updatedById ? names[r.updatedById] ?? null : null,
    lastViewedById: r.lastViewedById, lastViewedByName: r.lastViewedById ? names[r.lastViewedById] ?? null : null,
    lastViewedAt: r.lastViewedAt, createdAt: r.createdAt, updatedAt: r.updatedAt,
  }
}

export async function createCustomObjectRecord(objectKey: string, values: Record<string, any>, ownerId?: string) {
  const session = await requireAccess(objKey(objectKey), "EDIT")
  const uid = (session!.user as any).id
  const def = await (prisma as any).customObjectDef.findUnique({ where: { key: objectKey }, select: { id: true } })
  if (!def) return { error: "Object not found" }
  // Next sequential Record ID for this object.
  const last = await (prisma as any).customObjectRecord.findFirst({
    where: { objectDefId: def.id }, orderBy: { recordNumber: "desc" }, select: { recordNumber: true },
  })
  const recordNumber = (last?.recordNumber ?? 0) + 1
  const rec = await (prisma as any).customObjectRecord.create({
    data: {
      objectDefId: def.id,
      recordNumber,
      values: values ?? {},
      ownerId: ownerId || uid,        // Record Owner defaults to the creator
      createdById: uid,
    },
  })
  await runTrigger_RecordCreated(`CO:${objectKey}`, rec.id, uid).catch(() => {})
  revalidatePath(`/objects/${objectKey}`)
  return { success: true, id: rec.id }
}

export async function updateCustomObjectRecord(objectKey: string, id: string, data: { values?: Record<string, any>; ownerId?: string | null }) {
  const session = await requireAccess(objKey(objectKey), "EDIT")
  const uid = (session!.user as any).id

  const before = await (prisma as any).customObjectRecord.findUnique({
    where: { id }, select: { values: true, ownerId: true },
  })

  const patch: Record<string, unknown> = { updatedById: uid }
  if (data.values !== undefined) patch.values = data.values
  if (data.ownerId !== undefined) patch.ownerId = data.ownerId || null
  await (prisma as any).customObjectRecord.update({ where: { id }, data: patch })

  // Fire the generic workflow triggers for whatever actually changed.
  const type = `CO:${objectKey}`
  if (data.values !== undefined) {
    const prev: Record<string, any> = (before?.values as any) ?? {}
    const changes: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(data.values)) {
      if (JSON.stringify(prev[k] ?? null) !== JSON.stringify(v ?? null)) changes[k] = v
    }
    if (Object.keys(changes).length) {
      await runTrigger_RecordPropertyChanged(type, id, changes, uid).catch(() => {})
    }
  }
  if (data.ownerId !== undefined && (data.ownerId || null) !== (before?.ownerId ?? null)) {
    await runTrigger_RecordOwnerChanged(type, id, data.ownerId || null, uid).catch(() => {})
  }

  revalidatePath(`/objects/${objectKey}`)
  revalidatePath(`/objects/${objectKey}/${id}`)
  return { success: true }
}

export async function deleteCustomObjectRecord(objectKey: string, id: string) {
  await requireDelete(objKey(objectKey))
  await (prisma as any).customObjectRecord.delete({ where: { id } })
  revalidatePath(`/objects/${objectKey}`)
  return { success: true }
}

export async function bulkDeleteCustomObjectRecords(objectKey: string, ids: string[]) {
  await requireDelete(objKey(objectKey))
  await (prisma as any).customObjectRecord.deleteMany({ where: { id: { in: ids } } })
  revalidatePath(`/objects/${objectKey}`)
  return { success: true, deleted: ids.length }
}

export async function recordCustomObjectView(objectKey: string, id: string) {
  const session = await auth()
  const uid = (session?.user as any)?.id
  if (!uid) return
  await (prisma as any).customObjectRecord.update({
    where: { id },
    data: { lastViewedById: uid, lastViewedAt: new Date() },
  }).catch(() => {})
}

// Merge one custom-object record into another: fill blank values on the target,
// move notes + associations, then delete the source.
export async function mergeCustomObjectRecord(objectKey: string, sourceId: string, targetId: string) {
  await requireAccess(objKey(objectKey), "EDIT")
  if (sourceId === targetId) return { error: "Cannot merge a record into itself." }

  const type = `CO:${objectKey}`
  const [source, target] = await Promise.all([
    (prisma as any).customObjectRecord.findUnique({ where: { id: sourceId } }),
    (prisma as any).customObjectRecord.findUnique({ where: { id: targetId } }),
  ])
  if (!source || !target) return { error: "Record not found." }

  // Target values win; source fills only the gaps.
  const values = { ...((source.values as any) ?? {}), ...((target.values as any) ?? {}) }
  await (prisma as any).customObjectRecord.update({ where: { id: targetId }, data: { values } })

  await (prisma as any).recordNote.updateMany({ where: { recordType: type, recordId: sourceId }, data: { recordId: targetId } })
  await (prisma as any).objectAssociation.updateMany({ where: { fromType: type, fromId: sourceId }, data: { fromId: targetId } })
  await (prisma as any).objectAssociation.updateMany({ where: { toType: type, toId: sourceId }, data: { toId: targetId } })

  await (prisma as any).customObjectRecord.delete({ where: { id: sourceId } })
  revalidatePath(`/objects/${objectKey}`)
  return { success: true }
}
