"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { applyUserOrder } from "@/lib/view-order"

export interface ProviderViewConfig {
  columns: string[]
  sort: "name" | "referrals"
  search: string
}

export interface ViewAccess {
  visibility: "PRIVATE" | "EVERYONE" | "TEAM" | "CUSTOM"
  teamId?: string | null
  sharedUserIds?: string[]
}

// Returns the set of team IDs the user belongs to
async function myTeamIds(userId: string): Promise<string[]> {
  const memberships = await (prisma as any).teamMember.findMany({
    where: { userId },
    select: { teamId: true },
  })
  return memberships.map((m: any) => m.teamId)
}

export async function getProviderViews() {
  const session = await auth()
  if (!session?.user) return []
  const userId = (session.user as any).id
  const teamIds = await myTeamIds(userId)

  const views = await (prisma as any).providerView.findMany({
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
  // Mark which views the current user owns (can edit/delete)
  return applyUserOrder(userId, "PROVIDER", "", views.map((v: any) => ({ ...v, isOwner: v.userId === userId })))
}

export async function createProviderView(name: string, config: ProviderViewConfig, access?: ViewAccess) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  const view = await (prisma as any).providerView.create({
    data: {
      name: name.trim(),
      userId: (session.user as any).id,
      config,
      visibility: access?.visibility ?? "PRIVATE",
      teamId: access?.visibility === "TEAM" ? access.teamId ?? null : null,
      sharedUserIds: access?.visibility === "CUSTOM" ? access.sharedUserIds ?? [] : [],
    },
  })
  revalidatePath("/referring-doctors")
  return { success: true, id: view.id }
}

export async function updateProviderView(id: string, config: ProviderViewConfig, access?: ViewAccess) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  const data: any = { config }
  if (access) {
    data.visibility = access.visibility
    data.teamId = access.visibility === "TEAM" ? access.teamId ?? null : null
    data.sharedUserIds = access.visibility === "CUSTOM" ? access.sharedUserIds ?? [] : []
  }
  await (prisma as any).providerView.update({
    where: { id, userId: (session.user as any).id },
    data,
  })
  revalidatePath("/referring-doctors")
  return { success: true }
}

export async function deleteProviderView(id: string) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  await (prisma as any).providerView.delete({
    where: { id, userId: (session.user as any).id },
  })
  revalidatePath("/referring-doctors")
  return { success: true }
}
