"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { requireAccess } from "@/lib/auth-guard"
import { revalidatePath } from "next/cache"
import { runTrigger_RecordOwnerChanged } from "@/lib/automation-engine"

// Any object key: a built-in, or "CO:<key>" for a custom object.
export type OwnableObject = string

// `column` is the DB field that holds the owner/assignee — most use `ownerId`,
// but Referral and Task use `assignedToId`.
const META: Record<string, { object: string; basePath: string; delegate: () => any; column?: string }> = {
  PROVIDER: { object: "PROVIDERS", basePath: "referring-doctors", delegate: () => prisma.referringDoctor },
  PRACTICE: { object: "PRACTICES", basePath: "practices", delegate: () => prisma.referringPractice },
  LOCATION: { object: "LOCATIONS", basePath: "locations", delegate: () => prisma.practiceLocation },
  SURGERY: { object: "SURGERY", basePath: "surgery", delegate: () => prisma.surgeryCase },
  ACTIVITY: { object: "ACTIVITIES", basePath: "activities", delegate: () => prisma.activity },
  REFERRAL: { object: "REFERRALS", basePath: "referrals", delegate: () => prisma.referral, column: "assignedToId" },
  TASK: { object: "TASKS", basePath: "tasks", delegate: () => prisma.task, column: "assignedToId" },
}

export async function setRecordOwner(type: OwnableObject, id: string, ownerId: string | null) {
  if (type.startsWith("CO:")) {
    await requireAccess(type, "EDIT")
    const s = await auth()
    await (prisma as any).customObjectRecord.update({
      where: { id },
      data: { ownerId: ownerId || null, updatedById: (s?.user as any)?.id ?? null },
    })
    await runTrigger_RecordOwnerChanged(type, id, ownerId || null).catch(() => {})
    revalidatePath(`/objects/${type.slice(3)}/${id}`)
    return { success: true }
  }

  const meta = META[type]
  if (!meta) return { error: `Unknown object "${type}"` }
  await requireAccess(meta.object, "EDIT")
  const session = await auth()
  const uid = (session?.user as any)?.id ?? null

  const column = meta.column ?? "ownerId"
  await meta.delegate().update({
    where: { id },
    // Referral has no updatedById column; everything else records the editor.
    data: { [column]: ownerId || null, ...(type === "REFERRAL" ? {} : { updatedById: uid }) },
  })

  await runTrigger_RecordOwnerChanged(type, id, ownerId || null, uid ?? undefined).catch(() => {})

  revalidatePath(`/${meta.basePath}/${id}`)
  return { success: true }
}
