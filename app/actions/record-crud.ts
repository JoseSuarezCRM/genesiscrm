"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { requireAccess } from "@/lib/auth-guard"
import { deleteDoctor, deletePractice, deleteLocation, mergeDoctor, mergePractice, mergeLocation } from "@/app/actions/referring-doctors"
import { deleteSurgeryCase } from "@/app/actions/surgery"
import { deleteReferral, mergeReferral } from "@/app/actions/referrals"
import { deleteCustomObjectRecord, createCustomObjectRecord, mergeCustomObjectRecord } from "@/app/actions/custom-object-records"

// Delete dispatches to each object's own guarded delete, so cascade checks
// (e.g. a practice with referrals) still apply.
export async function deleteRecord(entityType: string, id: string): Promise<{ success?: boolean; error?: string }> {
  if (entityType.startsWith("CO:")) {
    await deleteCustomObjectRecord(entityType.slice(3), id)
    return { success: true }
  }
  switch (entityType) {
    case "PROVIDER": return (await deleteDoctor(id)) as any
    case "PRACTICE": return (await deletePractice(id)) as any
    case "LOCATION": return (await deleteLocation(id)) as any
    case "SURGERY": await deleteSurgeryCase(id); return { success: true }
    case "REFERRAL": await deleteReferral(id); return { success: true }
    default: return { error: `Can't delete a ${entityType} record.` }
  }
}

// Clone duplicates the record's own fields (not its relations or engagements) and
// returns the new record's detail URL.
export async function cloneRecord(entityType: string, id: string): Promise<{ url?: string; error?: string }> {
  const session = await auth()
  const uid = (session?.user as any)?.id ?? null

  if (entityType.startsWith("CO:")) {
    const key = entityType.slice(3)
    const rec = await (prisma as any).customObjectRecord.findUnique({ where: { id } })
    if (!rec) return { error: "Record not found" }
    const res = await createCustomObjectRecord(key, (rec.values as any) ?? {})
    return (res as any)?.id ? { url: `/objects/${key}/${(res as any).id}` } : { error: (res as any)?.error ?? "Clone failed" }
  }

  if (entityType === "PROVIDER") {
    await requireAccess("PROVIDERS", "EDIT")
    const d = await prisma.referringDoctor.findUnique({ where: { id } })
    if (!d) return { error: "Not found" }
    const c = await prisma.referringDoctor.create({
      data: {
        name: `${d.name} (copy)`, title: d.title, npi: null, specialty: d.specialty,
        phone: d.phone, officePhone: d.officePhone, email: d.email, contactType: d.contactType,
        practiceId: d.practiceId, customProperties: d.customProperties as any, ownerId: uid, createdById: uid,
      },
    })
    return { url: `/referring-doctors/${c.id}` }
  }

  if (entityType === "PRACTICE") {
    await requireAccess("PRACTICES", "EDIT")
    const p = await prisma.referringPractice.findUnique({ where: { id } })
    if (!p) return { error: "Not found" }
    const c = await prisma.referringPractice.create({
      data: { name: `${p.name} (copy)`, phone: p.phone, fax: p.fax, address: p.address, customProperties: p.customProperties as any, ownerId: uid, createdById: uid },
    })
    return { url: `/practices/${c.id}` }
  }

  if (entityType === "LOCATION") {
    await requireAccess("LOCATIONS", "EDIT")
    const l = await prisma.practiceLocation.findUnique({ where: { id } })
    if (!l) return { error: "Not found" }
    const c = await prisma.practiceLocation.create({
      data: { name: `${l.name} (copy)`, phone: l.phone, fax: l.fax, address: l.address, practiceId: l.practiceId, customProperties: l.customProperties as any, ownerId: uid, createdById: uid },
    })
    return { url: `/locations/${c.id}` }
  }

  if (entityType === "SURGERY") {
    await requireAccess("SURGERY", "EDIT")
    const s = await (prisma as any).surgeryCase.findUnique({ where: { id } })
    if (!s) return { error: "Not found" }
    const { id: _id, recordNumber, createdAt, updatedAt, createdById, updatedById, ...rest } = s
    const c = await (prisma as any).surgeryCase.create({
      data: { ...rest, patientName: `${s.patientName} (copy)`, creationDate: new Date(), createdById: uid, ownerId: uid },
    })
    return { url: `/surgery/${c.id}` }
  }

  return { error: `Can't clone a ${entityType} record.` }
}

const MERGE_DELEGATE: Record<string, () => any> = {
  REFERRAL: () => prisma.referral, PROVIDER: () => prisma.referringDoctor,
  PRACTICE: () => prisma.referringPractice, LOCATION: () => prisma.practiceLocation,
  SURGERY: () => (prisma as any).surgeryCase,
}

// After the base merge, write the field values the user explicitly chose from the
// losing record onto the survivor. Keys are catalog keys ("cp_<id>" for a custom
// property; a property id for a custom object).
async function applyMergeOverrides(entityType: string, survivorId: string, overrides?: Record<string, any>) {
  const keys = Object.keys(overrides ?? {})
  if (!keys.length) return

  if (entityType.startsWith("CO:")) {
    const rec = await (prisma as any).customObjectRecord.findUnique({ where: { id: survivorId }, select: { values: true } })
    await (prisma as any).customObjectRecord.update({ where: { id: survivorId }, data: { values: { ...((rec?.values as any) ?? {}), ...overrides } } })
    return
  }

  const model = MERGE_DELEGATE[entityType]?.()
  if (!model) return
  const cols: Record<string, any> = {}
  const cp: Record<string, any> = {}
  for (const k of keys) {
    if (k.startsWith("cp_")) cp[k.slice(3)] = overrides![k]
    else cols[k] = overrides![k] === "" ? null : overrides![k]
  }
  const data: any = { ...cols }
  if (Object.keys(cp).length) {
    const rec = await model.findUnique({ where: { id: survivorId }, select: { customProperties: true } })
    data.customProperties = { ...((rec?.customProperties as any) ?? {}), ...cp }
  }
  await model.update({ where: { id: survivorId }, data })
}

// Merge dedups two records into one: the source is merged INTO the target, the
// chosen per-field overrides are applied to the target, then its page is returned.
export async function mergeRecord(entityType: string, sourceId: string, targetId: string, overrides?: Record<string, any>): Promise<{ url?: string; error?: string }> {
  if (sourceId === targetId) return { error: "Pick a different record to merge into." }
  let res: any
  let url: string | undefined
  if (entityType.startsWith("CO:")) { res = await mergeCustomObjectRecord(entityType.slice(3), sourceId, targetId); url = `/objects/${entityType.slice(3)}/${targetId}` }
  else if (entityType === "PROVIDER") { res = await mergeDoctor(sourceId, targetId); url = `/referring-doctors/${targetId}` }
  else if (entityType === "PRACTICE") { res = await mergePractice(sourceId, targetId); url = `/practices/${targetId}` }
  else if (entityType === "LOCATION") { res = await mergeLocation(sourceId, targetId); url = `/locations/${targetId}` }
  else if (entityType === "REFERRAL") { res = await mergeReferral(sourceId, targetId); url = `/referrals/${targetId}` }
  else return { error: `Can't merge a ${entityType} record.` }

  if (res?.error) return { error: res.error }
  await applyMergeOverrides(entityType, targetId, overrides).catch(() => {})
  return { url }
}
