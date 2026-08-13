// Batch-loads the object associations for a set of tasks (stored as
// objectAssociation rows with fromType "TASK"), resolving each linked record's
// name + URL via the object registry. Server-only (Prisma); used by the tasks page.

import { prisma } from "@/lib/prisma"
import { resolverFor, labelFor } from "@/lib/object-registry"

export interface TaskAssoc { type: string; typeLabel: string; id: string; name: string; url: string }

export async function loadTaskAssociations(taskIds: string[]): Promise<Map<string, TaskAssoc[]>> {
  const out = new Map<string, TaskAssoc[]>()
  if (!taskIds.length) return out

  const links: any[] = await (prisma as any).objectAssociation.findMany({
    where: { OR: [{ fromType: "TASK", fromId: { in: taskIds } }, { toType: "TASK", toId: { in: taskIds } }] },
  })
  if (!links.length) return out

  // Normalize each link to { taskId, type, id }.
  const norm = links.map((l) =>
    l.fromType === "TASK" ? { taskId: l.fromId, type: l.toType, id: l.toId } : { taskId: l.toId, type: l.fromType, id: l.fromId }
  )

  // Resolve names per type in one pass, then attach.
  const idsByType = new Map<string, Set<string>>()
  for (const n of norm) { if (!idsByType.has(n.type)) idsByType.set(n.type, new Set()); idsByType.get(n.type)!.add(n.id) }

  const resolved = new Map<string, { name: string; url: string }>() // key `${type}:${id}`
  const typeLabels = new Map<string, string>()
  await Promise.all(Array.from(idsByType.entries()).map(async ([type, ids]) => {
    typeLabels.set(type, await labelFor(type))
    const resolver = await resolverFor(type)
    const recs = resolver ? await resolver.byIds(Array.from(ids)) : []
    for (const r of recs) resolved.set(`${type}:${r.id}`, { name: r.name, url: r.url })
  }))

  for (const n of norm) {
    const r = resolved.get(`${n.type}:${n.id}`)
    if (!r) continue
    const arr = out.get(n.taskId) ?? []
    arr.push({ type: n.type, typeLabel: typeLabels.get(n.type) ?? n.type, id: n.id, name: r.name, url: r.url })
    out.set(n.taskId, arr)
  }
  return out
}
