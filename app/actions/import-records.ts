"use server"

import { prisma } from "@/lib/prisma"
import { requireAccess } from "@/lib/auth-guard"
import { auth } from "@/lib/auth"
import { userCanLevel } from "@/lib/permissions"
import { revalidatePath } from "next/cache"
import { createRecordFor } from "@/lib/automation-records"
import { ensureAssociation, ensureAssociationDef } from "@/lib/object-associations"
import { coerceValue } from "@/lib/import-coerce"
import { resolveTargetId } from "@/lib/import-resolve"
import { runProviderImportBatch, undoProviderImportRun } from "@/lib/import-providers"
import { createCustomProperty } from "@/app/actions/custom-properties"
import { RECORD_ID_TARGET, PROVIDER_IMPORT_KEY, importPermKey, type ImportConfig, type ImportBatchResult } from "@/lib/import-types"

interface PropDef { id: string; name: string; type: string; options?: string[]; optionLabels?: Record<string, string> | null }

// Import (create/update + associate) one batch of parsed rows for a custom object,
// or for Providers (lib/import-providers.ts).
// Does NOT fire workflow triggers — a bulk import must not mass-enroll records.
export async function runImportBatch(
  objectKey: string,
  config: ImportConfig,
  rows: Record<string, string>[],
  startIndex = 0,
  runId?: string,
): Promise<ImportBatchResult> {
  const type = `CO:${objectKey}`
  let session
  try {
    session = await requireAccess(importPermKey(objectKey), "EDIT")
  } catch {
    return { created: 0, updated: 0, skipped: 0, errors: [], error: "You don't have permission to import into this object." }
  }
  const uid = (session!.user as any).id

  // The run's undo log must belong to this object, or Undo would act on the wrong table.
  if (runId) {
    const run = await (prisma as any).importRun.findUnique({ where: { id: runId }, select: { objectKey: true, status: true } })
    if (!run || run.objectKey !== objectKey || run.status !== "active") {
      return { created: 0, updated: 0, skipped: 0, errors: [], error: "This import run doesn't match the object being imported." }
    }
  }

  if (objectKey === PROVIDER_IMPORT_KEY) {
    const result = await runProviderImportBatch(config, rows, startIndex, runId, uid)
    revalidatePath("/referring-doctors")
    return result
  }

  // Undo bookkeeping for this batch (only when part of a tracked run).
  const changes: { runId: string; kind: string; recordId: string; before?: any }[] = []
  const assocs: { runId: string; fromType: string; fromId: string; toType: string; toId: string }[] = []

  const def = await (prisma as any).customObjectDef.findUnique({ where: { key: objectKey }, select: { id: true, properties: true } })
  if (!def) return { created: 0, updated: 0, skipped: 0, errors: [], error: "Object not found." }
  const props: PropDef[] = ((def.properties as PropDef[]) ?? [])
  const propById = new Map(props.map((p) => [p.id, p]))

  // Column carrying the Record ID match key (first one wins).
  const recordIdCol = Object.entries(config.fieldMap).find(([, target]) => target === RECORD_ID_TARGET)?.[0] ?? null
  // Property columns (skip the record-id column and any mapping to a missing prop).
  const propCols = Object.entries(config.fieldMap).filter(([, target]) => target !== RECORD_ID_TARGET && propById.has(target))

  const result: ImportBatchResult = { created: 0, updated: 0, skipped: 0, errors: [] }
  const coDefCache = new Map<string, string>()

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = startIndex + i + 2 // +2: 1-based + header row, matching the spreadsheet
    try {
      // Match an existing record by Record ID (recordNumber).
      const idRaw = recordIdCol ? (row[recordIdCol] ?? "").trim() : ""
      let existing: { id: string; values: Record<string, unknown> } | null = null
      if (idRaw && /^\d+$/.test(idRaw)) {
        existing = await (prisma as any).customObjectRecord.findFirst({
          where: { objectDefId: def.id, recordNumber: Number(idRaw) },
          select: { id: true, values: true },
        })
      }

      const isUpdate = !!existing
      if (isUpdate && config.mode === "createOnly") { result.skipped++; continue }
      if (!isUpdate && config.mode === "updateOnly") { result.skipped++; continue }

      // Coerce mapped property cells. Any bad cell skips the whole row (reported).
      const coerced: Record<string, unknown> = {}
      let cellError: string | null = null
      for (const [col, propId] of propCols) {
        const p = propById.get(propId)!
        const res = coerceValue(p.type, row[col] ?? "", { options: p.options, optionLabels: p.optionLabels })
        if ("error" in res) { cellError = `${p.name}: ${res.error}`; break }
        if ("skip" in res) continue
        coerced[propId] = res.value
      }
      if (cellError) { result.errors.push({ row: rowNum, message: cellError }); result.skipped++; continue }

      // Create or update the record (no workflow triggers).
      let recordId: string
      if (isUpdate) {
        const prev = (existing!.values ?? {}) as Record<string, unknown>
        // Snapshot the prior values of exactly the fields we're about to write.
        const before: Record<string, unknown> = {}
        for (const k of Object.keys(coerced)) before[k] = prev[k] ?? null
        const merged = { ...prev, ...coerced }
        await (prisma as any).customObjectRecord.update({ where: { id: existing!.id }, data: { values: merged, updatedById: uid } })
        recordId = existing!.id
        result.updated++
        if (runId) changes.push({ runId, kind: "update", recordId, before })
      } else {
        recordId = await createRecordFor(type, coerced, { ownerId: uid, createdById: uid })
        result.created++
        if (runId) changes.push({ runId, kind: "create", recordId })
      }

      // Associations: link by the related record's id/Record ID in the same row.
      for (const { column, targetType } of config.assocMap) {
        const raw = (row[column] ?? "").trim()
        if (!raw) continue
        const targetId = await resolveTargetId(targetType, raw, coDefCache)
        if (!targetId) { result.errors.push({ row: rowNum, message: `Couldn't find ${targetType} "${raw}" to associate` }); continue }
        await ensureAssociationDef(type, targetType)
        const created = await ensureAssociation(type, recordId, targetType, targetId)
        if (runId && created) assocs.push({ runId, fromType: type, fromId: recordId, toType: targetType, toId: targetId })
      }
    } catch (e) {
      result.errors.push({ row: rowNum, message: e instanceof Error ? e.message : String(e) })
      result.skipped++
    }
  }

  // Persist this batch's undo bookkeeping + roll up the run counts.
  if (runId) {
    if (changes.length) await (prisma as any).importRunChange.createMany({ data: changes }).catch(() => {})
    if (assocs.length) await (prisma as any).importRunAssoc.createMany({ data: assocs }).catch(() => {})
    await (prisma as any).importRun.update({ where: { id: runId }, data: { created: { increment: result.created }, updated: { increment: result.updated } } }).catch(() => {})
  }

  revalidatePath(`/objects/${objectKey}`)
  return result
}

// Create a new property on the custom object from the import mapper, so a column
// with no matching field can be brought in without leaving the wizard.
const IMPORT_PROP_TYPES = ["TEXT", "LONG_TEXT", "NUMBER", "EMAIL", "PHONE", "DATE", "DATE_TIME", "CHECKBOX", "DROPDOWN", "MULTI_SELECT", "URL"]
export async function createImportProperty(objectKey: string, name: string, type: string, options?: string[]): Promise<{ property?: { id: string; name: string; type: string; options: string[]; optionLabels: Record<string, string> }; error?: string }> {
  try { await requireAccess(importPermKey(objectKey), "EDIT") } catch { return { error: "You don't have permission to add properties to this object." } }
  const clean = (name ?? "").trim()
  if (!clean) return { error: "Property name is required." }
  const t = IMPORT_PROP_TYPES.includes(type) ? type : "TEXT"
  const seeded = (t === "DROPDOWN" || t === "MULTI_SELECT") ? Array.from(new Set((options ?? []).map((o) => o.trim()).filter(Boolean))).slice(0, 500) : []

  // Providers keep their properties as CustomProperty rows; creating one is an
  // admin action, enforced inside createCustomProperty.
  if (objectKey === PROVIDER_IMPORT_KEY) {
    try {
      const res = await createCustomProperty({ name: clean, type: t as any, entityType: "PROVIDER", options: seeded })
      if (res.error || !res.id) return { error: res.error ?? "Couldn't create the property." }
      return { property: { id: `cp_${res.id}`, name: clean, type: t, options: seeded, optionLabels: {} } }
    } catch {
      return { error: "Only admins can add properties to Providers." }
    }
  }
  const def = await (prisma as any).customObjectDef.findUnique({ where: { key: objectKey }, select: { id: true, properties: true } })
  if (!def) return { error: "Object not found." }
  const props = ((def.properties as any[]) ?? [])
  if (props.some((p) => (p.name ?? "").trim().toLowerCase() === clean.toLowerCase())) return { error: "A property with that name already exists." }
  // Unique internal name (snake_case) within the object.
  const base = clean.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase() || "field"
  const taken = new Set(props.map((p) => p.internalName).filter(Boolean))
  let internalName = base
  for (let n = 2; taken.has(internalName); n++) internalName = `${base}_${n}`
  // Dropdown/multi-select need options for import cells to match — seeded from
  // the values found in the file (passed by the mapper), value == label.
  const opts = seeded
  const id = `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const property = { id, name: clean, internalName, type: t, options: opts, required: false }
  await (prisma as any).customObjectDef.update({ where: { id: def.id }, data: { properties: [...props, property] } })
  revalidatePath(`/objects/${objectKey}`)
  return { property: { id, name: clean, type: t, options: opts, optionLabels: {} } }
}

// ─── Import runs: history + undo ─────────────────────────────────────────────

export interface ImportRunDTO {
  id: string
  status: string
  created: number
  updated: number
  createdAt: string
  createdByName: string | null
}

export async function startImportRun(objectKey: string): Promise<{ runId?: string; error?: string }> {
  let session
  try { session = await requireAccess(importPermKey(objectKey), "EDIT") } catch { return { error: "You don't have permission to import into this object." } }
  const run = await (prisma as any).importRun.create({ data: { objectKey, createdById: (session!.user as any).id ?? null } })
  return { runId: run.id }
}

export async function listImportRuns(objectKey: string, limit = 10): Promise<ImportRunDTO[]> {
  const session = await auth()
  if (!session?.user || !userCanLevel(session.user as any, importPermKey(objectKey), "VIEW")) return []
  const runs = await (prisma as any).importRun.findMany({ where: { objectKey }, orderBy: { createdAt: "desc" }, take: Math.min(50, Math.max(1, limit)) })
  const names = await resolveUserNames(runs.map((r: any) => r.createdById))
  return runs.map((r: any) => ({
    id: r.id, status: r.status, created: r.created, updated: r.updated,
    createdAt: r.createdAt.toISOString(),
    createdByName: r.createdById ? names[r.createdById] ?? null : null,
  }))
}

async function resolveUserNames(ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean) as string[]))
  if (!unique.length) return {}
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, email: true } })
  return Object.fromEntries(users.map((u) => [u.id, u.name ?? u.email]))
}

// Reverse an import: delete created records, restore prior values on updated ones,
// and remove associations the run added (pre-existing links are untouched).
export async function undoImportRun(runId: string): Promise<{ ok?: boolean; deleted?: number; restored?: number; associationsRemoved?: number; kept?: number; error?: string }> {
  const run = await (prisma as any).importRun.findUnique({ where: { id: runId } })
  if (!run) return { error: "Import not found." }
  try { await requireAccess(importPermKey(run.objectKey), "EDIT") } catch { return { error: "You don't have permission to undo this import." } }
  if (run.status === "undone") return { ok: true, deleted: 0, restored: 0, associationsRemoved: 0 }

  if (run.objectKey === PROVIDER_IMPORT_KEY) {
    const res = await undoProviderImportRun(runId)
    await (prisma as any).importRun.update({ where: { id: runId }, data: { status: "undone", undoneAt: new Date() } }).catch(() => {})
    revalidatePath("/referring-doctors")
    return { ok: true, ...res }
  }

  const [changes, assocRows] = await Promise.all([
    (prisma as any).importRunChange.findMany({ where: { runId } }),
    (prisma as any).importRunAssoc.findMany({ where: { runId } }),
  ])

  // 1) Remove associations this run created (both orderings).
  let associationsRemoved = 0
  for (const a of assocRows as any[]) {
    const res = await (prisma as any).objectAssociation.deleteMany({
      where: { OR: [{ fromType: a.fromType, fromId: a.fromId, toType: a.toType, toId: a.toId }, { fromType: a.toType, fromId: a.toId, toType: a.fromType, toId: a.fromId }] },
    }).catch(() => ({ count: 0 }))
    associationsRemoved += res.count ?? 0
  }

  // 2) Restore prior values on updated records (only the fields the import wrote).
  let restored = 0
  const updates = (changes as any[]).filter((c) => c.kind === "update")
  for (const c of updates) {
    const rec = await (prisma as any).customObjectRecord.findUnique({ where: { id: c.recordId }, select: { values: true } }).catch(() => null)
    if (!rec) continue
    const merged = { ...((rec.values as any) ?? {}), ...((c.before as any) ?? {}) }
    await (prisma as any).customObjectRecord.update({ where: { id: c.recordId }, data: { values: merged } }).catch(() => {})
    restored++
  }

  // 3) Delete records this run created.
  const createdIds = (changes as any[]).filter((c) => c.kind === "create").map((c) => c.recordId)
  let deleted = 0
  if (createdIds.length) {
    const res = await (prisma as any).customObjectRecord.deleteMany({ where: { id: { in: createdIds } } }).catch(() => ({ count: 0 }))
    deleted = res.count ?? 0
    // Clear any leftover associations pointing at the deleted records.
    await (prisma as any).objectAssociation.deleteMany({ where: { OR: [{ fromId: { in: createdIds } }, { toId: { in: createdIds } }] } }).catch(() => {})
  }

  await (prisma as any).importRun.update({ where: { id: runId }, data: { status: "undone", undoneAt: new Date() } }).catch(() => {})
  revalidatePath(`/objects/${run.objectKey}`)
  return { ok: true, deleted, restored, associationsRemoved }
}

export async function deleteImportRun(runId: string): Promise<{ ok?: boolean; error?: string }> {
  const run = await (prisma as any).importRun.findUnique({ where: { id: runId } })
  if (!run) return { ok: true }
  try { await requireAccess(importPermKey(run.objectKey), "EDIT") } catch { return { error: "You don't have permission." } }
  await (prisma as any).importRunChange.deleteMany({ where: { runId } }).catch(() => {})
  await (prisma as any).importRunAssoc.deleteMany({ where: { runId } }).catch(() => {})
  await (prisma as any).importRun.delete({ where: { id: runId } }).catch(() => {})
  return { ok: true }
}
