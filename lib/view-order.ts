// Per-user ordering for saved-view tabs. A single UserViewOrder row per
// (user, viewType, scopeKey) stores the view ids in the user's preferred order.
// Server-only (Prisma).

import { prisma } from "@/lib/prisma"

export type ViewType = "SURGERY" | "ACTIVITY" | "PROVIDER" | "CUSTOM_OBJECT" | "TASK" | "REFERRAL"

// Re-sort `views` by the user's saved order: ids present in the saved list come
// first (in that order); any others (new or newly-shared views) keep their
// incoming order, appended. Never hides a view.
export async function applyUserOrder<T extends { id: string }>(
  userId: string,
  viewType: ViewType,
  scopeKey: string,
  views: T[],
): Promise<T[]> {
  if (views.length < 2) return views
  const row = await (prisma as any).userViewOrder.findUnique({
    where: { userId_viewType_scopeKey: { userId, viewType, scopeKey } },
    select: { orderedIds: true },
  })
  const ordered: string[] = row?.orderedIds ?? []
  if (!ordered.length) return views

  const rank = new Map(ordered.map((id, i) => [id, i]))
  return [...views].sort((a, b) => {
    const ra = rank.has(a.id) ? rank.get(a.id)! : Infinity
    const rb = rank.has(b.id) ? rank.get(b.id)! : Infinity
    return ra - rb // stable sort keeps unranked views in their original relative order
  })
}
