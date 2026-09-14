"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { applyUserOrder } from "@/lib/view-order"

// The stored shape is lib/object-views.ts → ObjectViewConfig. It stays `unknown` here
// because older rows carry the legacy { filter, columns } shape; readers normalize.
export type CustomObjectViewConfig = Record<string, unknown>

export interface ViewAccess {
  visibility: "PRIVATE" | "EVERYONE" | "TEAM" | "CUSTOM"
  teamId?: string | null
  sharedUserIds?: string[]
}

async function myTeamIds(userId: string): Promise<string[]> {
  const m = await (prisma as any).teamMember.findMany({ where: { userId }, select: { teamId: true } })
  return m.map((x: any) => x.teamId)
}

export async function getCustomObjectViews(objectKey: string) {
  const session = await auth()
  if (!session?.user) return []
  const userId = (session.user as any).id
  const teamIds = await myTeamIds(userId)
  const views = await (prisma as any).customObjectView.findMany({
    where: {
      objectKey,
      OR: [
        { userId },
        { visibility: "EVERYONE" },
        { visibility: "TEAM", teamId: { in: teamIds.length ? teamIds : ["__none__"] } },
        { visibility: "CUSTOM", sharedUserIds: { has: userId } },
      ],
    },
    orderBy: { createdAt: "asc" },
  })
  return applyUserOrder(userId, "CUSTOM_OBJECT", objectKey, views.map((v: any) => ({ ...v, isOwner: v.userId === userId })))
}

export async function createCustomObjectView(objectKey: string, name: string, config: CustomObjectViewConfig, access?: ViewAccess) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  const view = await (prisma as any).customObjectView.create({
    data: {
      objectKey, name: name.trim(), userId: (session.user as any).id, config: config as any,
      visibility: access?.visibility ?? "PRIVATE",
      teamId: access?.visibility === "TEAM" ? access.teamId ?? null : null,
      sharedUserIds: access?.visibility === "CUSTOM" ? access.sharedUserIds ?? [] : [],
    },
  })
  revalidatePath(`/objects/${objectKey}`)
  return { success: true, id: view.id }
}

// The owner can always edit; anyone a shared view reaches can edit it too — shared
// views are collaborative, so saving updates it for everyone.
async function loadEditable(id: string, userId: string) {
  const view = await (prisma as any).customObjectView.findUnique({ where: { id } })
  if (!view) return { error: "View not found" as const }
  const teamIds = await myTeamIds(userId)
  const canEdit = view.userId === userId
    || view.visibility === "EVERYONE"
    || (view.visibility === "TEAM" && teamIds.includes(view.teamId))
    || (view.visibility === "CUSTOM" && (view.sharedUserIds ?? []).includes(userId))
  if (!canEdit) return { error: "You don't have access to this view." as const }
  return { view }
}

export async function updateCustomObjectView(id: string, config: CustomObjectViewConfig) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  const found = await loadEditable(id, (session.user as any).id)
  if ("error" in found) return { error: found.error }
  await (prisma as any).customObjectView.update({ where: { id }, data: { config: config as any } })
  revalidatePath(`/objects/${found.view.objectKey}`)
  return { success: true }
}

// Rename from the View settings panel.
export async function renameCustomObjectView(id: string, name: string) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  const trimmed = name.trim()
  if (!trimmed) return { error: "A view needs a name." }
  const found = await loadEditable(id, (session.user as any).id)
  if ("error" in found) return { error: found.error }
  await (prisma as any).customObjectView.update({ where: { id }, data: { name: trimmed } })
  revalidatePath(`/objects/${found.view.objectKey}`)
  return { success: true }
}

// "Manage sharing" in the View settings panel. Only the owner may change who can see
// a view — otherwise anyone it's shared with could lock the owner out of it.
export async function setCustomObjectViewAccess(id: string, access: ViewAccess) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  const userId = (session.user as any).id
  const view = await (prisma as any).customObjectView.findUnique({ where: { id } })
  if (!view) return { error: "View not found" }
  if (view.userId !== userId) return { error: "Only the view's owner can change sharing." }
  await (prisma as any).customObjectView.update({
    where: { id },
    data: {
      visibility: access.visibility,
      teamId: access.visibility === "TEAM" ? access.teamId ?? null : null,
      sharedUserIds: access.visibility === "CUSTOM" ? access.sharedUserIds ?? [] : [],
    },
  })
  revalidatePath(`/objects/${view.objectKey}`)
  return { success: true }
}

export async function deleteCustomObjectView(id: string) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  await (prisma as any).customObjectView.delete({ where: { id, userId: (session.user as any).id } })
  return { success: true }
}
