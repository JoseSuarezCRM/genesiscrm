import { prisma } from "@/lib/prisma"

// Remember that a merged-away record id now lives at another id, so open URLs and
// bookmarks for the deleted record redirect to the survivor instead of 404ing.
// Best-effort: never let a redirect bookkeeping failure break the merge itself.
export async function recordMergeRedirect(entity: string, fromId: string, toId: string) {
  if (!fromId || !toId || fromId === toId) return
  try {
    // Flatten chains (A→B then B→C): anything that pointed at fromId now → toId.
    await (prisma as any).mergeRedirect.updateMany({ where: { entity, toId: fromId }, data: { toId } })
    await (prisma as any).mergeRedirect.upsert({
      where: { entity_fromId: { entity, fromId } },
      create: { entity, fromId, toId },
      update: { toId },
    })
  } catch (e) {
    console.error("recordMergeRedirect failed:", e)
  }
}

// Returns the surviving id a merged-away record now points to, or null.
export async function resolveMergeRedirect(entity: string, fromId: string): Promise<string | null> {
  try {
    const r = await (prisma as any).mergeRedirect.findUnique({ where: { entity_fromId: { entity, fromId } } })
    return r?.toId ?? null
  } catch {
    return null
  }
}
