"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { requireAccess, requireDelete } from "@/lib/auth-guard"
import { revalidatePath } from "next/cache"
import { runTrigger_RecordCreated, runTrigger_RecordPropertyChanged, runTrigger_RecordOwnerChanged } from "@/lib/automation-engine"
import { filterStateToWhere } from "@/lib/filter-to-prisma"
import { decodeFilterParam, customPropertyFilterFields, type FilterField } from "@/lib/filters"
import { attachAssociatedRecords } from "@/lib/association-columns"

// Records are gated by the object's own permission key: "CO:<objectKey>".
function objKey(key: string) { return `CO:${key}` }

// A "use server" file can only export async functions — the list threshold /
// page size live in a plain module (lib/custom-object-config) instead.
const CO_PAGE_SIZE = 50

// Filter fields for server-side translation — native columns carry a `column`,
// custom properties carry `column` + `jsonBag: "values"` (via the shared helper).
function serverFilterFields(properties: any[]): FilterField[] {
  return [
    { key: "__recordNumber", label: "Record ID", type: "number", column: "recordNumber" } as any,
    { key: "__owner", label: "Owner", type: "select", column: "ownerId" } as any,
    { key: "__created", label: "Created", type: "date", column: "createdAt" } as any,
    ...customPropertyFilterFields(properties.map((p) => ({ id: p.id, name: p.name, type: p.type, options: p.options })), "values"),
  ]
}

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

export interface CustomRecordsPage { rows: CustomRecordRow[]; total: number; page: number; pageSize: number }

// Count all records for an object (used to pick client vs server list mode).
export async function countCustomObjectRecords(objectKey: string): Promise<number> {
  await requireAccess(objKey(objectKey), "VIEW")
  const def = await (prisma as any).customObjectDef.findUnique({ where: { key: objectKey }, select: { id: true } })
  if (!def) return 0
  return (prisma as any).customObjectRecord.count({ where: { objectDefId: def.id } })
}

// Server-side page: filter (reusing the FilterBuilder → Prisma translator),
// search, sort, and paginate in the database so a huge object stays fast and
// the sort holds across pages. Sorting a built-in column is a plain orderBy;
// sorting a custom (JSON) property is done over the matching set.
export async function queryCustomObjectRecords(objectKey: string, opts: { page?: number; sort?: string; dir?: "asc" | "desc"; search?: string; filter?: string }): Promise<CustomRecordsPage> {
  await requireAccess(objKey(objectKey), "VIEW")
  const def = await (prisma as any).customObjectDef.findUnique({ where: { key: objectKey }, select: { id: true, properties: true } })
  if (!def) return { rows: [], total: 0, page: 1, pageSize: CO_PAGE_SIZE }
  const properties: any[] = (def.properties as any[]) ?? []
  const primary = properties.find((p) => p.primary) ?? properties[0]
  const page = Math.max(1, opts.page ?? 1)
  const dir: "asc" | "desc" = opts.dir === "asc" ? "asc" : "desc"
  const skip = (page - 1) * CO_PAGE_SIZE

  const filterWhere = filterStateToWhere(decodeFilterParam(opts.filter), serverFilterFields(properties))
  const search = (opts.search ?? "").trim()
  const searchWhere = search
    ? { OR: properties.filter((p) => ["TEXT", "LONG_TEXT", "EMAIL", "PHONE", "URL"].includes(p.type) || p.id === primary?.id)
        .map((p) => ({ values: { path: [p.id], string_contains: search } })) }
    : {}
  const where: any = { objectDefId: def.id, AND: [filterWhere, searchWhere].filter((w) => w && Object.keys(w).length > 0) }

  const total = await (prisma as any).customObjectRecord.count({ where })

  const nativeOrderBy = opts.sort === "__id" ? { recordNumber: dir }
    : opts.sort === "__created" ? { createdAt: dir }
    : opts.sort === "__owner" ? { ownerId: dir }
    : null

  let records: any[]
  if (nativeOrderBy) {
    records = await (prisma as any).customObjectRecord.findMany({ where, orderBy: nativeOrderBy, skip, take: CO_PAGE_SIZE })
  } else {
    // Custom-property sort: order the matching set by the JSON value, then take the page.
    const propId = !opts.sort || opts.sort === "__name" ? primary?.id : opts.sort
    const all = await (prisma as any).customObjectRecord.findMany({ where, select: { id: true, values: true } })
    const valOf = (r: any) => { const v = r.values?.[propId]; return v == null ? "" : Array.isArray(v) ? v.join(", ") : String(v) }
    all.sort((a: any, b: any) => { const c = valOf(a).localeCompare(valOf(b), undefined, { numeric: true, sensitivity: "base" }); return dir === "asc" ? c : -c })
    const pageIds = all.slice(skip, skip + CO_PAGE_SIZE).map((r: any) => r.id)
    const fetched = await (prisma as any).customObjectRecord.findMany({ where: { id: { in: pageIds } } })
    const byId: Record<string, any> = Object.fromEntries(fetched.map((r: any) => [r.id, r]))
    records = pageIds.map((id: string) => byId[id]).filter(Boolean)
  }

  const names = await resolveNames(records.flatMap((r: any) => [r.ownerId, r.createdById, r.updatedById, r.lastViewedById]))
  const rows: CustomRecordRow[] = records.map((r: any) => ({
    id: r.id, recordNumber: r.recordNumber ?? null, values: (r.values as Record<string, any>) ?? {},
    ownerId: r.ownerId, ownerName: r.ownerId ? names[r.ownerId] ?? null : null,
    createdById: r.createdById, createdByName: r.createdById ? names[r.createdById] ?? null : null,
    updatedById: r.updatedById, updatedByName: r.updatedById ? names[r.updatedById] ?? null : null,
    lastViewedById: r.lastViewedById, lastViewedByName: r.lastViewedById ? names[r.lastViewedById] ?? null : null,
    lastViewedAt: r.lastViewedAt, createdAt: r.createdAt, updatedAt: r.updatedAt,
  }))
  return { rows, total, page, pageSize: CO_PAGE_SIZE }
}

// All matching rows (no pagination) for a server-side CSV export — same filter,
// search, and sort as the on-screen list.
export async function exportCustomObjectRecords(objectKey: string, opts: { sort?: string; dir?: "asc" | "desc"; search?: string; filter?: string }): Promise<CustomRecordRow[]> {
  await requireAccess(objKey(objectKey), "VIEW")
  const def = await (prisma as any).customObjectDef.findUnique({ where: { key: objectKey }, select: { id: true, properties: true } })
  if (!def) return []
  const properties: any[] = (def.properties as any[]) ?? []
  const primary = properties.find((p) => p.primary) ?? properties[0]
  const dir: "asc" | "desc" = opts.dir === "asc" ? "asc" : "desc"

  const filterWhere = filterStateToWhere(decodeFilterParam(opts.filter), serverFilterFields(properties))
  const search = (opts.search ?? "").trim()
  const searchWhere = search
    ? { OR: properties.filter((p) => ["TEXT", "LONG_TEXT", "EMAIL", "PHONE", "URL"].includes(p.type) || p.id === primary?.id)
        .map((p) => ({ values: { path: [p.id], string_contains: search } })) }
    : {}
  const where: any = { objectDefId: def.id, AND: [filterWhere, searchWhere].filter((w) => w && Object.keys(w).length > 0) }

  const nativeOrderBy = opts.sort === "__id" ? { recordNumber: dir }
    : opts.sort === "__created" ? { createdAt: dir }
    : opts.sort === "__owner" ? { ownerId: dir }
    : null

  let records: any[] = await (prisma as any).customObjectRecord.findMany({ where, ...(nativeOrderBy ? { orderBy: nativeOrderBy } : {}) })
  if (!nativeOrderBy) {
    const propId = !opts.sort || opts.sort === "__name" ? primary?.id : opts.sort
    const valOf = (r: any) => { const v = r.values?.[propId]; return v == null ? "" : Array.isArray(v) ? v.join(", ") : String(v) }
    records.sort((a: any, b: any) => { const c = valOf(a).localeCompare(valOf(b), undefined, { numeric: true, sensitivity: "base" }); return dir === "asc" ? c : -c })
  }

  const names = await resolveNames(records.flatMap((r: any) => [r.ownerId, r.createdById, r.updatedById, r.lastViewedById]))
  const mapped = records.map((r: any) => ({
    id: r.id, recordNumber: r.recordNumber ?? null, values: (r.values as Record<string, any>) ?? {},
    ownerId: r.ownerId, ownerName: r.ownerId ? names[r.ownerId] ?? null : null,
    createdById: r.createdById, createdByName: r.createdById ? names[r.createdById] ?? null : null,
    updatedById: r.updatedById, updatedByName: r.updatedById ? names[r.updatedById] ?? null : null,
    lastViewedById: r.lastViewedById, lastViewedByName: r.lastViewedById ? names[r.lastViewedById] ?? null : null,
    lastViewedAt: r.lastViewedAt, createdAt: r.createdAt, updatedAt: r.updatedAt,
  }))
  // Attach linked records so association columns export for large (server-mode) objects too.
  await attachAssociatedRecords(`CO:${objectKey}`, mapped as any[])
  return mapped
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
  // Auto-enroll into the object's default pipeline (first stage) if one exists.
  await assignDefaultStage(`CO:${objectKey}`, rec.id, uid).catch(() => {})
  revalidatePath(`/objects/${objectKey}`)
  return { success: true, id: rec.id }
}

// Put a new record into the first stage of the object's first pipeline (if any),
// logging a StageTransition so time-in-stage starts immediately.
async function assignDefaultStage(recordType: string, recordId: string, userId: string) {
  const { pipelinesForObject, logStageTransition } = await import("@/lib/stages/core")
  const pipelines = await pipelinesForObject(recordType)
  const first = pipelines[0]
  const firstStage = first?.stages[0]
  if (first && firstStage) await logStageTransition(recordType, recordId, first.id, firstStage.id, userId)
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
