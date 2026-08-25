"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { logStageTransition, pipelinesForObject } from "@/lib/stages/core"

// Move a record into a stage (logs a transition + updates its stage). Custom objects only for now.
export async function moveRecordStage(recordType: string, recordId: string, pipelineId: string, stageId: string) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  await logStageTransition(recordType, recordId, pipelineId, stageId, session.user.id)
  if (recordType.startsWith("CO:")) {
    const key = recordType.slice(3)
    revalidatePath(`/objects/${key}/board`)
    revalidatePath(`/objects/${key}/${recordId}`)
  }
  return { success: true }
}

export interface BoardCard { id: string; title: string; ownerName: string | null; stageId: string | null; enteredAt: string | null }
export interface BoardData {
  pipeline: { id: string; name: string } | null
  stages: { id: string; name: string; color: string | null }[]
  cards: BoardCard[]
}

// Board data for a custom object + pipeline: its stages + cards grouped by stage,
// each card carrying the time it entered its current stage (for time-in-stage).
export async function getBoardData(objectKey: string, pipelineId?: string | null): Promise<BoardData> {
  const objectType = `CO:${objectKey}`
  const pipelines = await pipelinesForObject(objectType)
  const pipeline = (pipelineId ? pipelines.find((p) => p.id === pipelineId) : pipelines[0]) ?? null
  if (!pipeline) return { pipeline: null, stages: [], cards: [] }

  const def = await (prisma as any).customObjectDef.findUnique({ where: { key: objectKey }, select: { id: true, properties: true } })
  if (!def) return { pipeline: { id: pipeline.id, name: pipeline.name }, stages: pipeline.stages, cards: [] }
  const primary = ((def.properties as any[]) ?? []).find((p) => p.primary) ?? ((def.properties as any[]) ?? [])[0]

  const records = await (prisma as any).customObjectRecord.findMany({
    where: { objectDefId: def.id, OR: [{ pipelineId: pipeline.id }, { pipelineId: null }] },
    select: { id: true, recordNumber: true, values: true, stageId: true, pipelineId: true, owner: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 1000,
  })

  // Latest stage-entry time per record (for time-in-stage).
  const ids = records.map((r: any) => r.id)
  const transitions = ids.length
    ? await (prisma as any).stageTransition.findMany({ where: { recordType: objectType, recordId: { in: ids } }, orderBy: { enteredAt: "desc" }, select: { recordId: true, enteredAt: true } })
    : []
  const enteredAt = new Map<string, string>()
  for (const t of transitions) if (!enteredAt.has(t.recordId)) enteredAt.set(t.recordId, t.enteredAt.toISOString())

  const cards: BoardCard[] = records
    .filter((r: any) => r.pipelineId === pipeline.id || r.stageId == null) // assigned here or unassigned
    .map((r: any) => ({
      id: r.id,
      title: (primary && r.values?.[primary.id]) ? String(r.values[primary.id]) : `#${r.recordNumber ?? ""}`,
      ownerName: r.owner?.name || r.owner?.email || null,
      stageId: r.pipelineId === pipeline.id ? r.stageId : null,
      enteredAt: enteredAt.get(r.id) ?? null,
    }))

  return { pipeline: { id: pipeline.id, name: pipeline.name }, stages: pipeline.stages, cards }
}
