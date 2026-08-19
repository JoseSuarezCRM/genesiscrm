"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { applyUserOrder } from "@/lib/view-order"

export interface TaskViewConfig {
  filter: unknown        // FilterState
  columns: string[]
  frozen?: number
  viewMode?: "table" | "cards"
}

export interface ViewAccess {
  visibility: "PRIVATE" | "EVERYONE" | "TEAM" | "CUSTOM"
  teamId?: string | null
  sharedUserIds?: string[]
}

async function myTeamIds(userId: string): Promise<string[]> {
  const m = await (prisma as any).teamMember.findMany({ where: { userId }, select: { teamId: true } })
  return m.map((x: any) => x.teamId)
}

export async function getTaskViews() {
  const session = await auth()
  if (!session?.user) return []
  const userId = (session.user as any).id
  const teamIds = await myTeamIds(userId)
  const views = await (prisma as any).taskView.findMany({
    where: {
      OR: [
        { userId },
        { visibility: "EVERYONE" },
        { visibility: "TEAM", teamId: { in: teamIds.length ? teamIds : ["__none__"] } },
        { visibility: "CUSTOM", sharedUserIds: { has: userId } },
      ],
    },
    orderBy: { createdAt: "asc" },
  })
  return applyUserOrder(userId, "TASK", "", views.map((v: any) => ({ ...v, isOwner: v.userId === userId })))
}

export async function createTaskView(name: string, config: TaskViewConfig, access?: ViewAccess) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  const view = await (prisma as any).taskView.create({
    data: {
      name: name.trim(), userId: (session.user as any).id, config: config as any,
      visibility: access?.visibility ?? "PRIVATE",
      teamId: access?.visibility === "TEAM" ? access.teamId ?? null : null,
      sharedUserIds: access?.visibility === "CUSTOM" ? access.sharedUserIds ?? [] : [],
    },
  })
  revalidatePath(`/tasks`)
  return { success: true, id: view.id }
}

export async function updateTaskView(id: string, config: TaskViewConfig) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  const userId = (session.user as any).id
  const view = await (prisma as any).taskView.findUnique({ where: { id } })
  if (!view) return { error: "View not found" }
  const teamIds = await myTeamIds(userId)
  const canEdit = view.userId === userId
    || view.visibility === "EVERYONE"
    || (view.visibility === "TEAM" && teamIds.includes(view.teamId))
    || (view.visibility === "CUSTOM" && (view.sharedUserIds ?? []).includes(userId))
  if (!canEdit) return { error: "You don't have access to this view." }
  await (prisma as any).taskView.update({ where: { id }, data: { config: config as any } })
  revalidatePath(`/tasks`)
  return { success: true }
}

export async function deleteTaskView(id: string) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  await (prisma as any).taskView.delete({ where: { id, userId: (session.user as any).id } })
  return { success: true }
}
