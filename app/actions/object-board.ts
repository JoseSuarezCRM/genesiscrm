"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { pipelinesForObject } from "@/lib/stages/core"
import { attachAssociatedRecords } from "@/lib/association-columns"
import { resolverFor, labelFor } from "@/lib/object-registry"

// Board + calendar data for a custom object. Kept apart from the table's paginated
// query because these views group by stage / by day rather than by page.

// A board holds a stage's whole column, so it can't paginate. Cap it and tell the
// client when the cap bit, rather than silently showing a partial pipeline.
const BOARD_CAP = 2000

export interface BoardChip { type: string; typeLabel: string; name: string; url: string }

export interface ObjectBoardCard {
  id: string
  recordNumber: number | null
  title: string
  ownerId: string | null
  ownerName: string | null
  values: Record<string, any>
  stageId: string | null
  enteredAt: string | null
  createdAt: string
  chips: BoardChip[]
  lastActivity: { kind: string; at: string } | null
}

export interface ObjectBoardStage {
  id: string
  name: string
  color: string | null
  probability: number | null
  isClosed: boolean
  isWon: boolean
}

export interface ObjectBoardData {
  pipeline: { id: string; name: string; color: string } | null
  stages: ObjectBoardStage[]
  cards: ObjectBoardCard[]
  truncated: boolean
}

/**
 * Most recent engagement per record, in ONE query per source rather than per card.
 * Covers the sources keyed directly to a record: notes/calls/meetings, plus
 * association-linked tasks and emails. It deliberately skips the address- and
 * phone-matched email/SMS lookups that `listRecordActivities` does — those need each
 * record's contact info and would be N+1 across a whole board.
 */
async function lastActivityFor(recordType: string, ids: string[]): Promise<Map<string, { kind: string; at: string }>> {
  const out = new Map<string, { kind: string; at: string }>()
  if (!ids.length) return out
  const put = (id: string, kind: string, at: Date | null | undefined) => {
    if (!at) return
    const cur = out.get(id)
    if (!cur || new Date(cur.at).getTime() < at.getTime()) out.set(id, { kind, at: at.toISOString() })
  }

  const notes = await (prisma as any).recordNote.findMany({
    where: { recordType, recordId: { in: ids } },
    select: { recordId: true, kind: true, createdAt: true, occurredAt: true },
  }).catch(() => [])
  for (const n of notes) {
    const kind = n.kind === "CALL" ? "Call" : n.kind === "MEETING" ? "Meeting" : "Note"
    put(n.recordId, kind, n.occurredAt ?? n.createdAt)
  }

  const links = await (prisma as any).objectAssociation.findMany({
    where: { OR: [{ fromType: recordType, fromId: { in: ids } }, { toType: recordType, toId: { in: ids } }] },
    select: { fromType: true, fromId: true, toType: true, toId: true },
  }).catch(() => [])
  const owners = new Map<string, string[]>() // otherId → record ids it belongs to
  const byType = new Map<string, Set<string>>()
  for (const l of links) {
    const mine = l.fromType === recordType ? l.fromId : l.toType === recordType ? l.toId : null
    if (!mine || !ids.includes(mine)) continue
    const otherType = l.fromType === recordType ? l.toType : l.fromType
    const otherId = l.fromType === recordType ? l.toId : l.fromId
    if (otherType !== "TASK" && otherType !== "EMAIL") continue
    const arr = owners.get(otherId) ?? []; arr.push(mine); owners.set(otherId, arr)
    const s = byType.get(otherType) ?? new Set(); s.add(otherId); byType.set(otherType, s)
  }

  const taskIds = Array.from(byType.get("TASK") ?? [])
  if (taskIds.length) {
    const tasks = await prisma.task.findMany({ where: { id: { in: taskIds } }, select: { id: true, createdAt: true } }).catch(() => [])
    for (const t of tasks) for (const rid of owners.get(t.id) ?? []) put(rid, "Task", t.createdAt)
  }
  const emailIds = Array.from(byType.get("EMAIL") ?? [])
  if (emailIds.length) {
    const mails = await prisma.directEmail.findMany({ where: { id: { in: emailIds } }, select: { id: true, sentAt: true } }).catch(() => [])
    for (const m of mails) for (const rid of owners.get(m.id) ?? []) put(rid, "Email", m.sentAt)
  }
  return out
}

/** Association chips (first linked record per related type) for a page of rows. */
async function chipsFor(objectType: string, rows: any[]): Promise<Map<string, BoardChip[]>> {
  const out = new Map<string, BoardChip[]>()
  await attachAssociatedRecords(objectType, rows)
  const types = new Set<string>()
  for (const r of rows) for (const t of Object.keys(r.__assoc ?? {})) types.add(t)
  if (!types.size) return out

  // Resolve each related type once, then look records up by id.
  const byType = new Map<string, { label: string; recs: Map<string, { name: string; url: string }> }>()
  for (const t of Array.from(types)) {
    const ids = Array.from(new Set(rows.map((r) => r.__assoc?.[t]?.id).filter(Boolean))) as string[]
    const resolver = await resolverFor(t).catch(() => null)
    const recs = resolver && ids.length ? await resolver.byIds(ids).catch(() => []) : []
    byType.set(t, { label: await labelFor(t).catch(() => t), recs: new Map(recs.map((x) => [x.id, { name: x.name, url: x.url }])) })
  }
  for (const r of rows) {
    const chips: BoardChip[] = []
    for (const [type, rec] of Object.entries((r.__assoc ?? {}) as Record<string, any>)) {
      const meta = byType.get(type); const found = meta?.recs.get(rec?.id)
      if (meta && found) chips.push({ type, typeLabel: meta.label, name: found.name, url: found.url })
    }
    if (chips.length) out.set(r.id, chips)
  }
  return out
}

export async function getObjectBoardData(objectKey: string, opts: {
  pipelineId?: string | null
  withChips?: boolean
  withLastActivity?: boolean
} = {}): Promise<ObjectBoardData> {
  const session = await auth()
  if (!session?.user) return { pipeline: null, stages: [], cards: [], truncated: false }

  const objectType = `CO:${objectKey}`
  const pipelines = await pipelinesForObject(objectType)
  const pipeline = (opts.pipelineId ? pipelines.find((p) => p.id === opts.pipelineId) : pipelines[0]) ?? null
  if (!pipeline) return { pipeline: null, stages: [], cards: [], truncated: false }

  const def = await (prisma as any).customObjectDef.findUnique({ where: { key: objectKey }, select: { id: true, properties: true } })
  if (!def) return { pipeline: { id: pipeline.id, name: pipeline.name, color: pipeline.color }, stages: pipeline.stages, cards: [], truncated: false }
  const props = ((def.properties as any[]) ?? [])
  const primary = props.find((p) => p.primary) ?? props[0]

  const records = await (prisma as any).customObjectRecord.findMany({
    where: { objectDefId: def.id, OR: [{ pipelineId: pipeline.id }, { pipelineId: null }] },
    select: {
      id: true, recordNumber: true, values: true, stageId: true, pipelineId: true, createdAt: true,
      ownerId: true, owner: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: BOARD_CAP + 1,
  })
  const truncated = records.length > BOARD_CAP
  const page = truncated ? records.slice(0, BOARD_CAP) : records

  const ids = page.map((r: any) => r.id)
  // Latest stage entry per record → time-in-stage.
  const transitions = ids.length
    ? await (prisma as any).stageTransition.findMany({
        where: { recordType: objectType, recordId: { in: ids } },
        orderBy: { enteredAt: "desc" }, select: { recordId: true, enteredAt: true },
      }).catch(() => [])
    : []
  const enteredAt = new Map<string, string>()
  for (const t of transitions) if (!enteredAt.has(t.recordId)) enteredAt.set(t.recordId, t.enteredAt.toISOString())

  const chips = opts.withChips ? await chipsFor(objectType, page) : new Map<string, BoardChip[]>()
  const activity = opts.withLastActivity ? await lastActivityFor(objectType, ids) : new Map()

  const cards: ObjectBoardCard[] = page.map((r: any) => ({
    id: r.id,
    recordNumber: r.recordNumber ?? null,
    title: (primary && r.values?.[primary.id]) ? String(r.values[primary.id]) : `#${r.recordNumber ?? ""}`,
    ownerId: r.ownerId ?? null,
    ownerName: r.owner?.name || r.owner?.email || null,
    values: (r.values ?? {}) as Record<string, any>,
    // A record sitting in another pipeline shows up as unassigned here, not misplaced.
    stageId: r.pipelineId === pipeline.id ? r.stageId ?? null : null,
    enteredAt: enteredAt.get(r.id) ?? null,
    createdAt: new Date(r.createdAt).toISOString(),
    chips: chips.get(r.id) ?? [],
    lastActivity: activity.get(r.id) ?? null,
  }))

  return {
    pipeline: { id: pipeline.id, name: pipeline.name, color: pipeline.color },
    stages: pipeline.stages.map((s) => ({
      id: s.id, name: s.name, color: s.color, probability: s.probability, isClosed: s.isClosed, isWon: s.isWon,
    })),
    cards,
    truncated,
  }
}
