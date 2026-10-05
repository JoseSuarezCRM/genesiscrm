// Shared by every import path (custom objects, Providers). A plain module so the
// "use server" action file keeps exporting async functions only.

import { prisma } from "@/lib/prisma"
import { delegateFor, isCustomObject } from "@/lib/automation-records"

// Resolve a related record's id from a cell that holds either the app Record ID
// (custom objects) or the internal id. Cached def lookups per batch.
export async function resolveTargetId(
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
