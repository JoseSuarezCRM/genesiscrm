"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { requireAccess, requirePermission } from "@/lib/auth-guard"
import { recordPermKey } from "@/lib/record-perm-key"
import { userCanLevel } from "@/lib/permissions"
import type { FilterState } from "@/lib/filters"
import { fieldsFor } from "@/lib/object-fields-server"
import { toFilterFields, type ObjectFieldDef } from "@/lib/object-fields"
import { queryObjectIds, countObjectMatches } from "@/lib/object-query"
import { segmentRecordIds, segmentSummary, type SegmentRow } from "@/lib/segments"
import { delegateFor, isCustomObject, recordLabel } from "@/lib/automation-records"
import { labelFor } from "@/lib/object-registry"

// A segment dereferences records of another object, so access to the segment is
// never enough on its own — the caller must also be allowed to VIEW that object.
// Without this, someone with Segments access but REFERRALS:NONE could read
// patient records through a saved segment.
async function requireObjectView(objectType: string) {
  await requireAccess(recordPermKey(objectType), "VIEW")
}

async function myTeamIds(userId: string): Promise<string[]> {
  const m = await (prisma as any).teamMember.findMany({ where: { userId }, select: { teamId: true } })
  return m.map((x: any) => x.teamId)
}

/** The same visibility model every saved-view table uses. */
async function visibleWhere(userId: string) {
  const teamIds = await myTeamIds(userId)
  return {
    OR: [
      { userId },
      { visibility: "EVERYONE" },
      { visibility: "TEAM", teamId: { in: teamIds.length ? teamIds : ["__none__"] } },
      { visibility: "CUSTOM", sharedUserIds: { has: userId } },
    ],
  }
}

export interface SegmentAccess {
  visibility: "PRIVATE" | "EVERYONE" | "TEAM" | "CUSTOM"
  teamId?: string | null
  sharedUserIds?: string[]
}

export async function listSegments(objectType?: string) {
  const session = await auth()
  if (!session?.user) return []
  const user = session.user as any
  const rows: SegmentRow[] = await (prisma as any).segment.findMany({
    where: { ...(objectType ? { objectType } : {}), ...(await visibleWhere(user.id)) },
    orderBy: { updatedAt: "desc" },
  })

  // Only segments over objects this person may read. The list would otherwise
  // leak the existence — and the size — of records they can't open.
  const allowed = rows.filter((s) => userCanLevel(user, recordPermKey(s.objectType), "VIEW"))
  const creators = await prisma.user.findMany({
    where: { id: { in: Array.from(new Set(allowed.map((s) => s.userId))) } },
    select: { id: true, name: true, email: true },
  })
  const byId = Object.fromEntries(creators.map((u) => [u.id, u.name ?? u.email]))

  return Promise.all(allowed.map(async (s) => ({
    ...s,
    creatorName: byId[s.userId] ?? "—",
    objectLabel: await labelFor(s.objectType).catch(() => s.objectType),
    summary: await segmentSummary(s).catch(() => ""),
  })))
}

export async function getSegment(id: string) {
  const session = await auth()
  if (!session?.user) return null
  const user = session.user as any
  const seg: SegmentRow | null = await (prisma as any).segment.findFirst({
    where: { id, ...(await visibleWhere(user.id)) },
  })
  if (!seg) return null
  await requireObjectView(seg.objectType)
  return seg
}

export async function createSegment(input: {
  name: string
  description?: string | null
  objectType: string
  kind: "ACTIVE" | "STATIC"
  source?: "FILTER" | "IMPORT" | "MANUAL"
  filter?: FilterState | null
  sourceConfig?: { importRunIds?: string[] } | null
  access?: SegmentAccess
}) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  await requireObjectView(input.objectType)
  const userId = (session.user as any).id
  const name = input.name.trim()
  if (!name) return { error: "Give the segment a name." }

  const seg = await (prisma as any).segment.create({
    data: {
      name,
      description: input.description?.trim() || null,
      objectType: input.objectType,
      kind: input.kind,
      source: input.source ?? "FILTER",
      filter: (input.filter ?? null) as any,
      sourceConfig: (input.sourceConfig ?? null) as any,
      userId,
      visibility: input.access?.visibility ?? "PRIVATE",
      teamId: input.access?.visibility === "TEAM" ? input.access.teamId ?? null : null,
      sharedUserIds: input.access?.visibility === "CUSTOM" ? input.access.sharedUserIds ?? [] : [],
    },
  })

  // STATIC freezes its membership now; ACTIVE only caches a size.
  if (input.kind === "STATIC") await rebuildSegment(seg.id)
  else await refreshSegmentSize(seg.id)

  revalidatePath("/segments")
  return { success: true, id: seg.id as string }
}

async function loadEditable(id: string, userId: string) {
  const seg: SegmentRow | null = await (prisma as any).segment.findUnique({ where: { id } })
  if (!seg) return { error: "Segment not found" as const }
  const teamIds = await myTeamIds(userId)
  const canEdit = seg.userId === userId
    || seg.visibility === "EVERYONE"
    || (seg.visibility === "TEAM" && teamIds.includes(seg.teamId ?? ""))
    || (seg.visibility === "CUSTOM" && (seg.sharedUserIds ?? []).includes(userId))
  if (!canEdit) return { error: "You don't have access to this segment." as const }
  return { seg }
}

export async function updateSegment(id: string, patch: {
  name?: string
  description?: string | null
  filter?: FilterState | null
  access?: SegmentAccess
}) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  const found = await loadEditable(id, (session.user as any).id)
  if ("error" in found) return { error: found.error }
  await requireObjectView(found.seg.objectType)

  await (prisma as any).segment.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
      ...(patch.filter !== undefined ? { filter: patch.filter as any } : {}),
      ...(patch.access ? {
        visibility: patch.access.visibility,
        teamId: patch.access.visibility === "TEAM" ? patch.access.teamId ?? null : null,
        sharedUserIds: patch.access.visibility === "CUSTOM" ? patch.access.sharedUserIds ?? [] : [],
      } : {}),
    },
  })
  if (patch.filter !== undefined) await refreshSegmentSize(id)
  revalidatePath("/segments")
  revalidatePath(`/segments/${id}`)
  return { success: true }
}

export async function deleteSegment(id: string) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  const found = await loadEditable(id, (session.user as any).id)
  if ("error" in found) return { error: found.error }
  await (prisma as any).segment.delete({ where: { id } })
  revalidatePath("/segments")
  return { success: true }
}

/** Recompute and cache an ACTIVE segment's size, or count a STATIC one's members. */
export async function refreshSegmentSize(id: string) {
  const seg: SegmentRow | null = await (prisma as any).segment.findUnique({ where: { id } })
  if (!seg) return { error: "Segment not found" }
  const r = await segmentRecordIds(seg)
  await (prisma as any).segment.update({
    where: { id },
    data: { size: r.total, sizeAt: new Date(), sizeExact: r.exact },
  })
  return { success: true, total: r.total, exact: r.exact }
}

/** Refresh several sizes at once — the list page fires this after paint. */
export async function refreshSegmentSizes(ids: string[]) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  const out: Record<string, { total: number; exact: boolean }> = {}
  for (const id of ids.slice(0, 50)) {
    const r = await refreshSegmentSize(id)
    if ("total" in r && r.total !== undefined) out[id] = { total: r.total, exact: (r as any).exact }
  }
  return { success: true, sizes: out }
}

/** Materialise a STATIC segment's membership. */
export async function rebuildSegment(id: string) {
  const seg: SegmentRow | null = await (prisma as any).segment.findUnique({ where: { id } })
  if (!seg) return { error: "Segment not found" }
  if (seg.kind !== "STATIC") return { error: "Only a static segment has a stored membership." }
  await requireObjectView(seg.objectType)

  // Resolve against the filter/import source, not the existing membership.
  const r = seg.source === "IMPORT" || seg.filter
    ? await segmentRecordIds({ ...seg, kind: "ACTIVE" })
    : { ids: [] as string[], total: 0, exact: true, warnings: [] }

  await (prisma as any).segmentMember.deleteMany({ where: { segmentId: id } })
  for (let i = 0; i < r.ids.length; i += 1000) {
    await (prisma as any).segmentMember.createMany({
      data: r.ids.slice(i, i + 1000).map((recordId) => ({ segmentId: id, recordId })),
      skipDuplicates: true,
    })
  }
  await (prisma as any).segment.update({
    where: { id },
    data: { size: r.ids.length, sizeAt: new Date(), sizeExact: r.exact, lastBuiltAt: new Date() },
  })
  revalidatePath(`/segments/${id}`)
  return { success: true, total: r.ids.length }
}

/** Add records to a STATIC segment (the bulk action on a list). */
export async function addToSegment(segmentId: string, recordIds: string[]) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  const found = await loadEditable(segmentId, (session.user as any).id)
  if ("error" in found) return { error: found.error }
  // An ACTIVE segment is defined by its filter — hand-adding would silently do
  // nothing on the next read. Rejected here as well as hidden in the picker.
  if (found.seg.kind !== "STATIC") {
    return { error: "This is an active segment; its members come from its filter." }
  }
  await requireObjectView(found.seg.objectType)
  await (prisma as any).segmentMember.createMany({
    data: recordIds.map((recordId) => ({ segmentId, recordId })),
    skipDuplicates: true,
  })
  await refreshSegmentSize(segmentId)
  revalidatePath(`/segments/${segmentId}`)
  return { success: true, added: recordIds.length }
}

export async function removeFromSegment(segmentId: string, recordIds: string[]) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  const found = await loadEditable(segmentId, (session.user as any).id)
  if ("error" in found) return { error: found.error }
  await (prisma as any).segmentMember.deleteMany({ where: { segmentId, recordId: { in: recordIds } } })
  await refreshSegmentSize(segmentId)
  revalidatePath(`/segments/${segmentId}`)
  return { success: true }
}

/** Live count + sample rows for the create flow, as the filter is edited. */
export async function previewSegment(objectType: string, filter: FilterState | null, limit = 25) {
  await requireObjectView(objectType)
  const defs = await fieldsFor(objectType)
  const r = await queryObjectIds(objectType, filter, { defs })
  const sample = r.ids.slice(0, limit)
  const rows = await Promise.all(sample.map(async (id) => ({
    id, label: await recordLabel(objectType, id).catch(() => id),
  })))
  return { total: r.total, exact: r.exact, warnings: r.warnings, rows }
}

/** A page of a segment's members, for the detail table. */
export async function segmentMembers(id: string, page = 1, pageSize = 50) {
  const seg = await getSegment(id)
  if (!seg) return { error: "Segment not found" }
  const defs = await fieldsFor(seg.objectType)
  const r = await segmentRecordIds(seg, defs)
  const slice = r.ids.slice((page - 1) * pageSize, page * pageSize)
  const rows = await Promise.all(slice.map(async (rid) => ({
    id: rid, label: await recordLabel(seg.objectType, rid).catch(() => rid),
  })))
  return { total: r.total, exact: r.exact, warnings: r.warnings, rows, page, pageSize }
}

/** Import runs that can seed a segment, newest first. Undone runs are excluded. */
export async function listImportRunsForSegments() {
  const session = await auth()
  if (!session?.user) return []
  await requirePermission("IMPORT_DATA").catch(() => {})
  const runs = await (prisma as any).importRun.findMany({
    where: { status: "active" }, orderBy: { createdAt: "desc" }, take: 50,
    select: { id: true, objectKey: true, created: true, updated: true, createdAt: true, createdById: true },
  })
  // `created` is a best-effort counter written with .catch(() => {}), so the real
  // membership is counted from the change rows rather than trusted from it.
  return Promise.all(runs.map(async (r: any) => {
    const n = await (prisma as any).importRunChange.count({ where: { runId: r.id } })
    return { ...r, objectType: `CO:${r.objectKey}`, changeRows: n }
  }))
}
