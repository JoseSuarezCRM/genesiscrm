"use server"

import { prisma } from "@/lib/prisma"
import { requireAccess } from "@/lib/auth-guard"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { cpMeta, type CPEntity } from "@/lib/custom-property-entities"
import { runTrigger_RecordPropertyChanged } from "@/lib/automation-engine"

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
export async function updateRecordField(entityType: CPEntity, recordId: string, field: string, value: unknown) {
  const meta = cpMeta(entityType)
  await requireAccess(meta.object, "EDIT")
  const session = await auth()
  const uid = (session?.user as any)?.id ?? null

  const model = delegateFor(entityType)
  if (!model) return { error: `Unknown object "${entityType}"` }

  try {
    if (field.startsWith("cp_")) {
      const propId = field.slice(3)
      const current = await model.findUnique({ where: { id: recordId }, select: { customProperties: true } })
      const bag: Record<string, any> = (current?.customProperties as any) ?? {}
      bag[propId] = value
      await model.update({ where: { id: recordId }, data: { customProperties: bag, ...(entityType === "REFERRAL" ? {} : { updatedById: uid }) } })
    } else {
      await model.update({
        where: { id: recordId },
        data: { [field]: value === "" ? null : value, ...(entityType === "REFERRAL" ? {} : { updatedById: uid }) },
      })
    }

    await runTrigger_RecordPropertyChanged(entityType, recordId, { [field]: value }, uid ?? undefined).catch(() => {})
    revalidatePath(`/${meta.basePath}/${recordId}`)
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
}
