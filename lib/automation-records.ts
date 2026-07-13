// Generic record access for the automation engine.
//
// The engine used to assume every workflow acted on a Referral. These helpers let
// a trigger or action address ANY object — built-in or custom — by a registry key
// ("REFERRAL", "SURGERY", "CO:visits", …), so one trigger/action pair covers the
// whole data model instead of one per object.

import { prisma } from "@/lib/prisma"

export interface RecordRef {
  type: string
  id: string
}

// Built-in objects that carry a `customProperties` JSON bag + (mostly) an owner.
const BUILTIN_DELEGATES: Record<string, () => any> = {
  REFERRAL: () => prisma.referral,
  PROVIDER: () => prisma.referringDoctor,
  PRACTICE: () => prisma.referringPractice,
  LOCATION: () => prisma.practiceLocation,
  SURGERY: () => (prisma as any).surgeryCase,
  ACTIVITY: () => prisma.activity,
  TASK: () => prisma.task,
}

export function isCustomObject(type: string): boolean {
  return type.startsWith("CO:")
}

export function delegateFor(type: string): any | null {
  if (isCustomObject(type)) return (prisma as any).customObjectRecord
  return BUILTIN_DELEGATES[type]?.() ?? null
}

export async function loadRecord(type: string, id: string): Promise<Record<string, unknown> | null> {
  const model = delegateFor(type)
  if (!model) return null
  const rec = await model.findUnique({ where: { id } })
  if (!rec) return null
  if (!isCustomObject(type)) return rec as Record<string, unknown>

  // Custom-object records keep their fields in a `values` bag keyed by property
  // id. Flatten them so conditions and tokens can address properties by name.
  const def = await (prisma as any).customObjectDef.findUnique({ where: { key: type.slice(3) } })
  const props: any[] = (def?.properties as any[]) ?? []
  const values: Record<string, any> = (rec.values as any) ?? {}
  const flat: Record<string, unknown> = { ...rec }
  for (const p of props) flat[p.id] = values[p.id]
  return flat
}

// A human label for the record, used in run logs and notifications.
export async function recordLabel(type: string, id: string, loaded?: Record<string, unknown> | null): Promise<string> {
  const rec = loaded ?? (await loadRecord(type, id))
  if (!rec) return id
  if (isCustomObject(type)) {
    const def = await (prisma as any).customObjectDef.findUnique({ where: { key: type.slice(3) } })
    const props: any[] = (def?.properties as any[]) ?? []
    const primary = props.find((p) => p.primary) ?? props[0]
    const values: Record<string, any> = ((rec as any).values as any) ?? {}
    const name = primary ? values[primary.id] : null
    return String(name || `${def?.singular ?? "Record"} #${(rec as any).recordNumber ?? ""}`).trim()
  }
  const r = rec as any
  if (type === "REFERRAL") return [r.patientFirstName, r.patientLastName].filter(Boolean).join(" ") || id
  return String(r.patientName ?? r.name ?? r.title ?? id)
}

// Custom-property writes are addressed as "cp_<customPropertyId>"; on custom
// objects every property lives in the bag, so anything not a real column is a
// property id.
export async function setRecordProperty(type: string, id: string, property: string, value: unknown) {
  const model = delegateFor(type)
  if (!model) throw new Error(`Unknown object type "${type}"`)

  if (isCustomObject(type)) {
    const rec = await model.findUnique({ where: { id }, select: { values: true } })
    const values: Record<string, any> = (rec?.values as any) ?? {}
    values[property] = value
    await model.update({ where: { id }, data: { values } })
    return
  }

  if (property.startsWith("cp_")) {
    const propId = property.slice(3)
    const rec = await model.findUnique({ where: { id }, select: { customProperties: true } })
    const bag: Record<string, any> = (rec?.customProperties as any) ?? {}
    bag[propId] = value
    await model.update({ where: { id }, data: { customProperties: bag } })
    return
  }

  await model.update({ where: { id }, data: { [property]: value } })
}

export async function setRecordOwner(type: string, id: string, ownerId: string | null) {
  const model = delegateFor(type)
  if (!model) throw new Error(`Unknown object type "${type}"`)
  await model.update({ where: { id }, data: { ownerId: ownerId || null } })
}

// The record's email address, so generic sends can reach it.
export async function recordEmailFor(type: string, rec: Record<string, unknown> | null): Promise<string | null> {
  if (!rec) return null
  const r = rec as any
  if (type === "REFERRAL") return r.patientEmail ?? r.email ?? null
  return r.email ?? null
}
