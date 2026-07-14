"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { requireAccess } from "@/lib/auth-guard"
import { revalidatePath } from "next/cache"
import { runTrigger_RecordOwnerChanged } from "@/lib/automation-engine"

// Any object key: a built-in, or "CO:<key>" for a custom object.
export type OwnableObject = string

const META: Record<string, { object: string; basePath: string; delegate: () => any }> = {
  PROVIDER: { object: "PROVIDERS", basePath: "referring-doctors", delegate: () => prisma.referringDoctor },
  PRACTICE: { object: "PRACTICES", basePath: "practices", delegate: () => prisma.referringPractice },
  LOCATION: { object: "LOCATIONS", basePath: "locations", delegate: () => prisma.practiceLocation },
  SURGERY: { object: "SURGERY", basePath: "surgery", delegate: () => prisma.surgeryCase },
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

  await meta.delegate().update({
    where: { id },
    data: { ownerId: ownerId || null, updatedById: uid },
  })

  await runTrigger_RecordOwnerChanged(type, id, ownerId || null, uid ?? undefined).catch(() => {})

  revalidatePath(`/${meta.basePath}/${id}`)
  return { success: true }
}
