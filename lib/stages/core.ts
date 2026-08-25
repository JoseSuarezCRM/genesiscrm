// Shared pipeline/stage logic used by custom objects and Referrals.
// A record (recordType = "REFERRAL" or "CO:<key>") sits in one pipeline + stage;
// every move appends a StageTransition — the source of truth for durations.
import { prisma } from "@/lib/prisma"

export interface Stage {
  id: string
  pipelineId: string
  name: string
  order: number
  probability: number | null
  isClosed: boolean
  isWon: boolean
  color: string | null
}

export interface PipelineWithStages {
  id: string
  objectType: string
  name: string
  color: string
  order: number
  isActive: boolean
  stages: Stage[]
}

// All pipelines (with stages) for an object type, ordered.
export async function pipelinesForObject(objectType: string): Promise<PipelineWithStages[]> {
  const rows = await (prisma as any).pipeline.findMany({
    where: { objectType, isActive: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { stages: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] } },
  }).catch(() => [])
  return rows as PipelineWithStages[]
}

export async function stagesForPipeline(pipelineId: string): Promise<Stage[]> {
  return (prisma as any).pipelineStage.findMany({
    where: { pipelineId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  }).catch(() => [])
}

// Record the current stage of a record: no-op when unchanged, else append a
// StageTransition and update the record's pipelineId/stageId. Returns whether it moved.
export async function logStageTransition(
  recordType: string,
  recordId: string,
  pipelineId: string,
  toStageId: string,
  byUserId?: string | null,
): Promise<boolean> {
  const current = await currentStage(recordType, recordId)
  if (current?.stageId === toStageId && current?.pipelineId === pipelineId) return false

  await (prisma as any).stageTransition.create({
    data: { recordType, recordId, pipelineId, fromStageId: current?.stageId ?? null, toStageId, byUserId: byUserId ?? null },
  })
  await setRecordStage(recordType, recordId, pipelineId, toStageId)
  return true
}

// Read a record's current pipeline/stage from its own row (fast path).
async function currentStage(recordType: string, recordId: string): Promise<{ pipelineId: string | null; stageId: string | null } | null> {
  if (recordType === "REFERRAL") {
    const r = await prisma.referral.findUnique({ where: { id: recordId }, select: { pipelineId: true, stageId: true } }).catch(() => null)
    return r ? { pipelineId: r.pipelineId, stageId: (r as any).stageId ?? null } : null
  }
  if (recordType.startsWith("CO:")) {
    const r = await (prisma as any).customObjectRecord.findUnique({ where: { id: recordId }, select: { pipelineId: true, stageId: true } }).catch(() => null)
    return r ? { pipelineId: r.pipelineId, stageId: r.stageId } : null
  }
  return null
}

async function setRecordStage(recordType: string, recordId: string, pipelineId: string, stageId: string): Promise<void> {
  if (recordType === "REFERRAL") {
    await prisma.referral.update({ where: { id: recordId }, data: { pipelineId, stageId } as any }).catch(() => {})
  } else if (recordType.startsWith("CO:")) {
    await (prisma as any).customObjectRecord.update({ where: { id: recordId }, data: { pipelineId, stageId } }).catch(() => {})
  }
}
