"use server"

import { prisma } from "@/lib/prisma"
import { requireAccess } from "@/lib/auth-guard"
import { revalidatePath } from "next/cache"
import { createRecordFor, delegateFor, isCustomObject } from "@/lib/automation-records"
import { ensureAssociation, ensureAssociationDef } from "@/lib/object-associations"
import { coerceValue } from "@/lib/import-coerce"
import { RECORD_ID_TARGET, type ImportConfig, type ImportBatchResult } from "@/lib/import-types"

interface PropDef { id: string; name: string; type: string; options?: string[]; optionLabels?: Record<string, string> | null }

// Resolve a related record's id from a cell that holds either the app Record ID
// (custom objects) or the internal id. Cached def lookups per batch.
async function resolveTargetId(
  targetType: string,
  raw: string,
  coDefCache: Map<string, string>,
): Promise<string | null> {
  const v = raw.trim()
  if (!v) return null
  if (isCustomObject(targetType)) {
    const key = targetType.slice(3)
    let defId = coDefCache.get(key)
    if (defId === undefined) {
      const def = await (prisma as any).customObjectDef.findUnique({ where: { key }, select: { id: true } })
      const resolved: string = def?.id ?? ""
      defId = resolved
      coDefCache.set(key, resolved)
    }
    if (!defId) return null
    if (/^\d+$/.test(v)) {
      const rec = await (prisma as any).customObjectRecord.findFirst({ where: { objectDefId: defId, recordNumber: Number(v) }, select: { id: true } })
      if (rec) return rec.id
    }
    const byId = await (prisma as any).customObjectRecord.findFirst({ where: { id: v, objectDefId: defId }, select: { id: true } })
    return byId?.id ?? null
  }
  const model = delegateFor(targetType)
  if (!model) return null
  const rec = await model.findUnique({ where: { id: v }, select: { id: true } }).catch(() => null)
  return rec?.id ?? null
}

// Import (create/update + associate) one batch of parsed rows for a custom object.
// Does NOT fire workflow triggers — a bulk import must not mass-enroll records.
export async function runImportBatch(
  objectKey: string,
  config: ImportConfig,
  rows: Record<string, string>[],
  startIndex = 0,
): Promise<ImportBatchResult> {
  const type = `CO:${objectKey}`
  let session
  try {
    session = await requireAccess(type, "EDIT")
  } catch {
    return { created: 0, updated: 0, skipped: 0, errors: [], error: "You don't have permission to import into this object." }
  }
  const uid = (session!.user as any).id

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
        const merged = { ...(existing!.values ?? {}), ...coerced }
        await (prisma as any).customObjectRecord.update({ where: { id: existing!.id }, data: { values: merged, updatedById: uid } })
        recordId = existing!.id
        result.updated++
      } else {
        recordId = await createRecordFor(type, coerced, { ownerId: uid, createdById: uid })
        result.created++
      }

      // Associations: link by the related record's id/Record ID in the same row.
      for (const { column, targetType } of config.assocMap) {
        const raw = (row[column] ?? "").trim()
        if (!raw) continue
        const targetId = await resolveTargetId(targetType, raw, coDefCache)
        if (!targetId) { result.errors.push({ row: rowNum, message: `Couldn't find ${targetType} "${raw}" to associate` }); continue }
        await ensureAssociationDef(type, targetType)
        await ensureAssociation(type, recordId, targetType, targetId)
      }
    } catch (e) {
      result.errors.push({ row: rowNum, message: e instanceof Error ? e.message : String(e) })
      result.skipped++
    }
  }

  revalidatePath(`/objects/${objectKey}`)
  return result
}
