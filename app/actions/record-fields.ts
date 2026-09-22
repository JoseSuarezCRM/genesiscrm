"use server"

import { prisma } from "@/lib/prisma"
import { requireAccess } from "@/lib/auth-guard"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { cpMeta, type CPEntity } from "@/lib/custom-property-entities"
import { checkUniqueCustomValue } from "@/app/actions/custom-properties"
import { runTrigger_RecordPropertyChanged } from "@/lib/automation-engine"
import { clinicDateOnlyValue } from "@/lib/tz"
import { RECORD_FIELDS } from "@/lib/record-field-catalog"

function delegateFor(type: CPEntity): any {
  return ({
    REFERRAL: prisma.referral,
    PROVIDER: prisma.referringDoctor,
    PRACTICE: prisma.referringPractice,
    LOCATION: prisma.practiceLocation,
    SURGERY: (prisma as any).surgeryCase,
    ACTIVITY: prisma.activity,
    TASK: prisma.task,
  } as any)[type]
}

/**
 * Inline click-to-edit on a record's property card. `field` is either a real
 * column or "cp_<customPropertyId>" for a custom property.
 */
export async function updateRecordField(entityType: string, recordId: string, field: string, value: unknown) {
  // Custom objects keep every property in a JSON values bag.
  if (entityType.startsWith("CO:")) {
    // Pipeline and stage are columns on the record, not bag entries — writing them
    // here would store a dead key and leave the record where it was. They move
    // through moveRecordStage, which also enforces the pipeline's rules.
    if (field === "__pipeline" || field === "__stage") {
      return { error: "Use the pipeline and stage control to move this record." }
    }
    await requireAccess(entityType, "EDIT")
    const session = await auth()
    const uid = (session?.user as any)?.id ?? null
    const rec = await (prisma as any).customObjectRecord.findUnique({ where: { id: recordId }, select: { values: true } })
    const values: Record<string, any> = (rec?.values as any) ?? {}
    values[field] = value === "" ? null : value
    await (prisma as any).customObjectRecord.update({ where: { id: recordId }, data: { values, updatedById: uid } })
    await runTrigger_RecordPropertyChanged(entityType, recordId, { [field]: value }, uid ?? undefined).catch(() => {})
    revalidatePath(`/objects/${entityType.slice(3)}/${recordId}`)
    return { success: true }
  }

  const meta = cpMeta(entityType as CPEntity)
  await requireAccess(meta.object, "EDIT")
  const session = await auth()
  const uid = (session?.user as any)?.id ?? null

  const model = delegateFor(entityType as CPEntity)
  if (!model) return { error: `Unknown object "${entityType}"` }

  try {
    if (field.startsWith("cp_")) {
      const propId = field.slice(3)
      const dup = await checkUniqueCustomValue(entityType as any, propId, value, recordId)
      if (dup) return { error: dup }
      const current = await model.findUnique({ where: { id: recordId }, select: { customProperties: true } })
      const bag: Record<string, any> = (current?.customProperties as any) ?? {}
      bag[propId] = value
      await model.update({ where: { id: recordId }, data: { customProperties: bag, ...(entityType === "REFERRAL" ? {} : { updatedById: uid }) } })
    } else {
      // A native DATE column holds a calendar day, so it's stored at noon UTC —
      // midnight would fall on the previous day anywhere west of UTC and the
      // record would read back a day early. DATETIME columns are real instants
      // and pass through untouched.
      const def = (RECORD_FIELDS[entityType] ?? []).find((f) => f.key === field)
      const toWrite = value === "" ? null
        : def?.type === "date" ? clinicDateOnlyValue(value as any)
        : value
      await model.update({
        where: { id: recordId },
        data: { [field]: toWrite, ...(entityType === "REFERRAL" ? {} : { updatedById: uid }) },
      })
    }

    // Custom properties are watched by workflows under "custom:<id>" (matching
    // customPropertyToDef), so translate "cp_<id>" → "custom:<id>" when firing.
    const triggerKey = field.startsWith("cp_") ? `custom:${field.slice(3)}` : field
    await runTrigger_RecordPropertyChanged(entityType, recordId, { [triggerKey]: value }, uid ?? undefined).catch(() => {})
    revalidatePath(`/${meta.basePath}/${recordId}`)
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
}

// The field values of a record, keyed to match the property catalog — used by the
// merge preview to show two records side by side.
export async function getRecordValues(entityType: string, id: string): Promise<Record<string, any>> {
  if (entityType.startsWith("CO:")) {
    await requireAccess(entityType, "VIEW")
    const rec = await (prisma as any).customObjectRecord.findUnique({ where: { id } })
    return (rec?.values as any) ?? {}
  }
  const meta = cpMeta(entityType as CPEntity)
  await requireAccess(meta.object, "VIEW")
  const model = delegateFor(entityType as CPEntity)
  if (!model) return {}
  const rec = await model.findUnique({ where: { id } })
  if (!rec) return {}
  const out: Record<string, any> = { ...rec }
  const bag = (rec.customProperties as any) ?? {}
  for (const [k, v] of Object.entries(bag)) out[`cp_${k}`] = v
  return out
}
