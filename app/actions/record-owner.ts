"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { requireAccess } from "@/lib/auth-guard"
import { revalidatePath } from "next/cache"

export type OwnableObject = "PROVIDER" | "PRACTICE" | "LOCATION" | "SURGERY"

const META: Record<OwnableObject, { object: string; basePath: string; delegate: () => any }> = {
  PROVIDER: { object: "PROVIDERS", basePath: "referring-doctors", delegate: () => prisma.referringDoctor },
  PRACTICE: { object: "PRACTICES", basePath: "practices", delegate: () => prisma.referringPractice },
  LOCATION: { object: "LOCATIONS", basePath: "locations", delegate: () => prisma.practiceLocation },
  SURGERY: { object: "SURGERY", basePath: "surgery", delegate: () => prisma.surgeryCase },
}

export async function setRecordOwner(type: OwnableObject, id: string, ownerId: string | null) {
  const meta = META[type]
  await requireAccess(meta.object, "EDIT")
  const session = await auth()
  const uid = (session?.user as any)?.id ?? null

  await meta.delegate().update({
    where: { id },
    data: { ownerId: ownerId || null, updatedById: uid },
  })

  revalidatePath(`/${meta.basePath}/${id}`)
  return { success: true }
}
