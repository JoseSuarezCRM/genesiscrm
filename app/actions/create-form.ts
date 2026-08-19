"use server"

import { prisma } from "@/lib/prisma"
import { requireAccess } from "@/lib/auth-guard"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"

async function requireAdmin() {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") throw new Error("Admin access required")
}

export interface CreateFormField {
  key: string
  required?: boolean
}

// The configured create-form fields for an object (built-in entity type or "CO:<key>").
// Returns null when unconfigured → callers show the full catalog.
export async function getCreateForm(objectType: string): Promise<CreateFormField[] | null> {
  const row = await (prisma as any).createFormConfig.findUnique({ where: { objectType } })
  if (!row) return null
  const fields = (row.fields as CreateFormField[]) ?? []
  return Array.isArray(fields) ? fields : null
}

export async function saveCreateForm(objectType: string, fields: CreateFormField[]) {
  await requireAdmin()
  await requireAccess("VIEWS", "EDIT")
  await (prisma as any).createFormConfig.upsert({
    where: { objectType },
    create: { objectType, fields: fields as any },
    update: { fields: fields as any },
  })
  // Custom objects live under /objects/<key>; built-ins under their own base path.
  if (objectType.startsWith("CO:")) revalidatePath(`/objects/${objectType.slice(3)}`)
  return { success: true }
}
