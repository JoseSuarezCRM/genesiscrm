"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"

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
}

export async function getActivityViews() {
  const session = await auth()
  if (!session?.user) return []
  return (prisma as any).activityView.findMany({
    where: { userId: (session.user as any).id },
    orderBy: { createdAt: "asc" },
  })
}

export async function createActivityView(name: string, filters: ViewFilters) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  const view = await (prisma as any).activityView.create({
    data: { name: name.trim(), userId: (session.user as any).id, filters },
  })
  revalidatePath("/activities")
  return { success: true, id: view.id }
}

export async function updateActivityView(id: string, filters: ViewFilters) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  await (prisma as any).activityView.update({
    where: { id, userId: (session.user as any).id },
    data: { filters },
  })
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
