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

// Merge dedups two records into one: the source is merged INTO the target, then
// the target's page is returned. (See lib/record-urls for `isMergeable`.)
export async function mergeRecord(entityType: string, sourceId: string, targetId: string): Promise<{ url?: string; error?: string }> {
  if (sourceId === targetId) return { error: "Pick a different record to merge into." }
  let res: any
  if (entityType.startsWith("CO:")) { res = await mergeCustomObjectRecord(entityType.slice(3), sourceId, targetId); if (!res?.error) return { url: `/objects/${entityType.slice(3)}/${targetId}` } }
  else if (entityType === "PROVIDER") { res = await mergeDoctor(sourceId, targetId); if (!res?.error) return { url: `/referring-doctors/${targetId}` } }
  else if (entityType === "PRACTICE") { res = await mergePractice(sourceId, targetId); if (!res?.error) return { url: `/practices/${targetId}` } }
  else if (entityType === "LOCATION") { res = await mergeLocation(sourceId, targetId); if (!res?.error) return { url: `/locations/${targetId}` } }
  else if (entityType === "REFERRAL") { res = await mergeReferral(sourceId, targetId); if (!res?.error) return { url: `/referrals/${targetId}` } }
  else return { error: `Can't merge a ${entityType} record.` }
  return { error: res?.error ?? "Merge failed" }
}
