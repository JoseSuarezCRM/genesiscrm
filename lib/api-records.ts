import { prisma } from "@/lib/prisma"
import { delegateFor, isCustomObject } from "@/lib/automation-records"
import { RECORD_FIELDS } from "@/lib/record-field-catalog"
import type { ApiObject } from "@/lib/api-objects"

// Generic CRUD + serialization for the public API, so every object (built-in or
// custom) is exposed the same way. Built-ins write native columns (validated
// against the field catalog) + a customProperties bag; custom objects store
// everything in their values bag.

export interface ListParams { limit: number; cursor?: string }

async function customDefId(entity: string): Promise<string | null> {
  const def = await (prisma as any).customObjectDef.findUnique({ where: { key: entity.slice(3) }, select: { id: true } }).catch(() => null)
  return def?.id ?? null
}

export async function listRecords(obj: ApiObject, p: ListParams): Promise<{ data: any[]; nextCursor: string | null }> {
  const model = delegateFor(obj.entity)
  if (!model) return { data: [], nextCursor: null }
  const where = isCustomObject(obj.entity) ? { objectDefId: await customDefId(obj.entity) } : {}
  const rows = await model.findMany({
    where,
    take: p.limit + 1,
    ...(p.cursor ? { cursor: { id: p.cursor }, skip: 1 } : {}),
    orderBy: { createdAt: "desc" },
  })
  const hasMore = rows.length > p.limit
  return { data: rows.slice(0, p.limit).map((r: any) => serializeRecord(obj, r)), nextCursor: hasMore ? rows[p.limit - 1].id : null }
}

export async function getRecord(obj: ApiObject, id: string): Promise<any | null> {
  const model = delegateFor(obj.entity)
  if (!model) return null
  const r = await model.findUnique({ where: { id } })
  return r ? serializeRecord(obj, r) : null
}

// Public JSON shape: native scalar columns at the top level, custom values under
// `properties`. Internal JSON columns are hidden.
export function serializeRecord(obj: ApiObject, r: any): any {
  if (isCustomObject(obj.entity)) {
    return { id: r.id, recordNumber: r.recordNumber ?? null, ownerId: r.ownerId ?? null, properties: r.values ?? {}, createdAt: r.createdAt, updatedAt: r.updatedAt }
  }
  const { customProperties, ...rest } = r
  return { ...rest, properties: customProperties ?? {} }
}

// Split an incoming body into native column data (validated + coerced against the
// field catalog) and a custom-property bag.
function splitWrite(entity: string, body: Record<string, any>): { data: Record<string, any>; props: Record<string, any> | null } {
  const catalog = (RECORD_FIELDS as any)[entity] ?? []
  const byKey: Record<string, any> = Object.fromEntries(catalog.map((f: any) => [f.key, f]))
  const data: Record<string, any> = {}
  for (const [k, v] of Object.entries(body)) {
    if (k === "properties" || k === "id") continue
    const f = byKey[k]
    if (!f || f.readOnly) continue // only known, writable native fields
    data[k] = (f.type === "date" || f.type === "datetime") && v ? new Date(v) : v
  }
  const props = body.properties && typeof body.properties === "object" ? body.properties : null
  return { data, props }
}

export async function createRecord(obj: ApiObject, body: Record<string, any>): Promise<any> {
  const model = delegateFor(obj.entity)
  if (!model) throw new Error("Unknown object")

  if (isCustomObject(obj.entity)) {
    const objectDefId = await customDefId(obj.entity)
    if (!objectDefId) throw new Error("Unknown object")
    const values = (body.properties && typeof body.properties === "object") ? body.properties : body
    const created = await model.create({ data: { objectDefId, values } })
    return serializeRecord(obj, created)
  }

  const { data, props } = splitWrite(obj.entity, body)
  const created = await model.create({ data: { ...data, ...(props ? { customProperties: props } : {}) } })
  return serializeRecord(obj, created)
}

export async function updateRecord(obj: ApiObject, id: string, body: Record<string, any>): Promise<any | null> {
  const model = delegateFor(obj.entity)
  if (!model) return null
  const existing = await model.findUnique({ where: { id } })
  if (!existing) return null

  if (isCustomObject(obj.entity)) {
    const incoming = (body.properties && typeof body.properties === "object") ? body.properties : body
    const values = { ...((existing.values as any) ?? {}), ...incoming }
    const updated = await model.update({ where: { id }, data: { values } })
    return serializeRecord(obj, updated)
  }

  const { data, props } = splitWrite(obj.entity, body)
  if (props) data.customProperties = { ...((existing.customProperties as any) ?? {}), ...props }
  const updated = await model.update({ where: { id }, data })
  return serializeRecord(obj, updated)
}
