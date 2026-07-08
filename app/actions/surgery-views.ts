"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"

// A surgery saved view captures the full list query (filters/sort as a URL query
// string) plus the client-side column + layout prefs.
export interface SurgeryViewConfig {
  query: string
  columns: string[]
  viewMode: "cards" | "table"
}

export interface ViewAccess {
  visibility: "PRIVATE" | "EVERYONE" | "TEAM" | "CUSTOM"
  teamId?: string | null
  sharedUserIds?: string[]
}

async function myTeamIds(userId: string): Promise<string[]> {
  const memberships = await (prisma as any).teamMember.findMany({
    where: { userId },
    select: { teamId: true },
  })
  return memberships.map((m: any) => m.teamId)
}

export async function getSurgeryViews() {
  const session = await auth()
  if (!session?.user) return []
  const userId = (session.user as any).id
  const teamIds = await myTeamIds(userId)

  const views = await (prisma as any).surgeryView.findMany({
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
  return views.map((v: any) => ({ ...v, isOwner: v.userId === userId }))
}

export async function createSurgeryView(name: string, config: SurgeryViewConfig, access?: ViewAccess) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  const view = await (prisma as any).surgeryView.create({
    data: {
      name: name.trim(),
      userId: (session.user as any).id,
      config,
      visibility: access?.visibility ?? "PRIVATE",
      teamId: access?.visibility === "TEAM" ? access.teamId ?? null : null,
      sharedUserIds: access?.visibility === "CUSTOM" ? access.sharedUserIds ?? [] : [],
    },
  })
  revalidatePath("/surgery")
  return { success: true, id: view.id }
}

export async function updateSurgeryView(id: string, config: SurgeryViewConfig, access?: ViewAccess) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  const data: any = { config }
  if (access) {
    data.visibility = access.visibility
    data.teamId = access.visibility === "TEAM" ? access.teamId ?? null : null
    data.sharedUserIds = access.visibility === "CUSTOM" ? access.sharedUserIds ?? [] : []
  }
  await (prisma as any).surgeryView.update({
    where: { id, userId: (session.user as any).id },
    data,
  })
  revalidatePath("/surgery")
  return { success: true }
}

export async function deleteSurgeryView(id: string) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  await (prisma as any).surgeryView.delete({
    where: { id, userId: (session.user as any).id },
  })
  revalidatePath("/surgery")
  return { success: true }
}
