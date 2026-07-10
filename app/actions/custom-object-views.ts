"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"

export interface CustomObjectViewConfig {
  filter: unknown        // FilterState
  columns: string[]
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
  return views.map((v: any) => ({ ...v, isOwner: v.userId === userId }))
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

export async function deleteCustomObjectView(id: string) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  await (prisma as any).customObjectView.delete({ where: { id, userId: (session.user as any).id } })
  return { success: true }
}
