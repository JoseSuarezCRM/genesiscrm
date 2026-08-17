"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { applyUserOrder } from "@/lib/view-order"

export interface ViewFilters {
  search: string
  dateFrom: string
  dateTo: string
  activeTagIds: string[]
  filterPracticeIds: string[]
  filterPracticeMode: "any" | "none"
  filterLocationIds: string[]
  filterLocationMode: "any" | "none"
  filterProviderIds: string[]
  filterProviderMode: "any" | "none"
  columns?: string[]
  frozen?: number
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

export async function getActivityViews() {
  const session = await auth()
  if (!session?.user) return []
  const userId = (session.user as any).id
  const teamIds = await myTeamIds(userId)

  const views = await (prisma as any).activityView.findMany({
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
  return applyUserOrder(userId, "ACTIVITY", "", views.map((v: any) => ({ ...v, isOwner: v.userId === userId })))
}

export async function createActivityView(name: string, filters: ViewFilters, access?: ViewAccess) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  const view = await (prisma as any).activityView.create({
    data: {
      name: name.trim(),
      userId: (session.user as any).id,
      filters,
      visibility: access?.visibility ?? "PRIVATE",
      teamId: access?.visibility === "TEAM" ? access.teamId ?? null : null,
      sharedUserIds: access?.visibility === "CUSTOM" ? access.sharedUserIds ?? [] : [],
    },
  })
  revalidatePath("/activities")
  return { success: true, id: view.id }
}

export async function updateActivityView(id: string, filters: ViewFilters, access?: ViewAccess) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  const userId = (session.user as any).id
  const view = await (prisma as any).activityView.findUnique({ where: { id } })
  if (!view) return { error: "View not found" }
  const teamIds = await myTeamIds(userId)
  // Content (filters/columns) is collaborative — anyone the view is shared with can save.
  const canEdit = view.userId === userId
    || view.visibility === "EVERYONE"
    || (view.visibility === "TEAM" && teamIds.includes(view.teamId))
    || (view.visibility === "CUSTOM" && (view.sharedUserIds ?? []).includes(userId))
  if (!canEdit) return { error: "You don't have access to this view." }
  const data: any = { filters }
  if (access) {
    // Only the owner may change who a view is shared with.
    if (view.userId !== userId) return { error: "Only the view owner can change sharing." }
    data.visibility = access.visibility
    data.teamId = access.visibility === "TEAM" ? access.teamId ?? null : null
    data.sharedUserIds = access.visibility === "CUSTOM" ? access.sharedUserIds ?? [] : []
  }
  await (prisma as any).activityView.update({ where: { id }, data })
  revalidatePath("/activities")
  return { success: true }
}

export async function deleteActivityView(id: string) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  await (prisma as any).activityView.delete({
    where: { id, userId: (session.user as any).id },
  })
  revalidatePath("/activities")
  return { success: true }
}
