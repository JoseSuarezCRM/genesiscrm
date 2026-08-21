"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { applyUserOrder } from "@/lib/view-order"

// A referral saved view captures the full list query (filters/sort as a URL query
// string) plus the client-side column prefs.
export interface ReferralViewConfig {
  query: string
  columns: string[]
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

export async function getReferralViews() {
  const session = await auth()
  if (!session?.user) return []
  const userId = (session.user as any).id
  const teamIds = await myTeamIds(userId)

  const views = await (prisma as any).referralView.findMany({
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
  return applyUserOrder(userId, "REFERRAL", "", views.map((v: any) => ({ ...v, isOwner: v.userId === userId })))
}

export async function createReferralView(name: string, config: ReferralViewConfig, access?: ViewAccess) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  const view = await (prisma as any).referralView.create({
    data: {
      name: name.trim(),
      userId: (session.user as any).id,
      config,
      visibility: access?.visibility ?? "PRIVATE",
      teamId: access?.visibility === "TEAM" ? access.teamId ?? null : null,
      sharedUserIds: access?.visibility === "CUSTOM" ? access.sharedUserIds ?? [] : [],
    },
  })
  revalidatePath("/referrals")
  return { success: true, id: view.id }
}

export async function updateReferralView(id: string, config: ReferralViewConfig, access?: ViewAccess) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  const userId = (session.user as any).id
  const view = await (prisma as any).referralView.findUnique({ where: { id } })
  if (!view) return { error: "View not found" }
  const teamIds = await myTeamIds(userId)
  // Content is collaborative — anyone the view is shared with can save changes.
  const canEdit = view.userId === userId
    || view.visibility === "EVERYONE"
    || (view.visibility === "TEAM" && teamIds.includes(view.teamId))
    || (view.visibility === "CUSTOM" && (view.sharedUserIds ?? []).includes(userId))
  if (!canEdit) return { error: "You don't have access to this view." }
  const data: any = { config }
  if (access) {
    if (view.userId !== userId) return { error: "Only the view owner can change sharing." }
    data.visibility = access.visibility
    data.teamId = access.visibility === "TEAM" ? access.teamId ?? null : null
    data.sharedUserIds = access.visibility === "CUSTOM" ? access.sharedUserIds ?? [] : []
  }
  await (prisma as any).referralView.update({ where: { id }, data })
  revalidatePath("/referrals")
  return { success: true }
}

export async function deleteReferralView(id: string) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  await (prisma as any).referralView.delete({
    where: { id, userId: (session.user as any).id },
  })
  revalidatePath("/referrals")
  return { success: true }
}
