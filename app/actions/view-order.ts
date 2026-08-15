"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import type { ViewType } from "@/lib/view-order"

// Save the current user's preferred order of saved-view tabs for a given list.
export async function reorderViews(viewType: ViewType, scopeKey: string, orderedIds: string[]) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  const userId = (session.user as any).id
  const key = scopeKey ?? ""

  await (prisma as any).userViewOrder.upsert({
    where: { userId_viewType_scopeKey: { userId, viewType, scopeKey: key } },
    create: { userId, viewType, scopeKey: key, orderedIds },
    update: { orderedIds },
  })
  return { success: true as const }
}
