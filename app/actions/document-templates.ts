"use server"

import { requirePermission } from "@/lib/auth-guard"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import type { DocBlock } from "@/lib/document-blocks"

const revalidate = () => revalidatePath("/settings/documents")

export interface DocTemplate {
  id: string
  name: string
  objectType: string
  blocks: DocBlock[]
  pageSize: string
  isActive: boolean
  updatedAt: string | Date
}

// Admin-managed CRUD.
export async function listDocumentTemplates(objectType?: string): Promise<DocTemplate[]> {
  await requirePermission("MANAGE_USERS")
  const rows = await (prisma as any).documentTemplate.findMany({
    where: objectType ? { objectType } : {},
    orderBy: { updatedAt: "desc" },
  })
  return rows as DocTemplate[]
}

export async function getDocumentTemplate(id: string): Promise<DocTemplate | null> {
  await requirePermission("MANAGE_USERS")
  return (await (prisma as any).documentTemplate.findUnique({ where: { id } })) as DocTemplate | null
}

export async function createDocumentTemplate(input: { name: string; objectType: string }): Promise<{ id?: string; error?: string }> {
  await requirePermission("MANAGE_USERS")
  const name = input.name?.trim()
  if (!name) return { error: "Name is required." }
  if (!input.objectType) return { error: "Pick an object type." }
  const uid = (await auth())?.user?.id ?? null
  const t = await (prisma as any).documentTemplate.create({ data: { name, objectType: input.objectType, blocks: [], createdById: uid } })
  revalidate()
  return { id: t.id }
}

export async function updateDocumentTemplate(id: string, patch: { name?: string; objectType?: string; blocks?: DocBlock[]; pageSize?: string; isActive?: boolean }): Promise<{ ok?: boolean; error?: string }> {
  await requirePermission("MANAGE_USERS")
  const data: Record<string, unknown> = {}
  if (patch.name !== undefined) data.name = patch.name.trim()
  if (patch.objectType !== undefined) data.objectType = patch.objectType
  if (patch.blocks !== undefined) data.blocks = patch.blocks as any
  if (patch.pageSize !== undefined) data.pageSize = patch.pageSize
  if (patch.isActive !== undefined) data.isActive = patch.isActive
  await (prisma as any).documentTemplate.update({ where: { id }, data })
  revalidate()
  return { ok: true }
}

export async function deleteDocumentTemplate(id: string): Promise<{ ok?: boolean; error?: string }> {
  await requirePermission("MANAGE_USERS")
  await (prisma as any).documentTemplate.delete({ where: { id } }).catch(() => {})
  revalidate()
  return { ok: true }
}

// Lightweight list (id/name) of ACTIVE templates for an object — for the record
// "Generate document" menu and the workflow attach picker (any signed-in user).
export async function listActiveDocumentTemplates(objectType: string): Promise<{ id: string; name: string }[]> {
  const session = await auth()
  if (!session?.user) return []
  const rows = await (prisma as any).documentTemplate.findMany({
    where: { objectType, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true },
  })
  return rows as { id: string; name: string }[]
}
