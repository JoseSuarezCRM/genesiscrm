"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { logStageTransition, pipelinesForObject } from "@/lib/stages/core"
import { runTrigger_RecordPropertyChanged } from "@/lib/automation-engine"

// Move a record into a stage (logs a transition + updates its stage). Custom objects only for now.
export async function moveRecordStage(recordType: string, recordId: string, pipelineId: string, stageId: string) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }

  // Enforce pipeline rules (allowed stage transitions) from the record's current stage.
  const cur = recordType === "REFERRAL"
    ? await prisma.referral.findUnique({ where: { id: recordId }, select: { stageId: true } as any }).catch(() => null)
    : await (prisma as any).customObjectRecord.findUnique({ where: { id: recordId }, select: { stageId: true } }).catch(() => null)
  const fromStageId = (cur as any)?.stageId
  if (fromStageId && fromStageId !== stageId) {
    const rule = await (prisma as any).pipelineRule.findUnique({ where: { pipelineId_fromStageId: { pipelineId, fromStageId } } }).catch(() => null)
    if (rule && rule.toStageIds.length && !rule.toStageIds.includes(stageId)) {
      return { error: "That stage move isn't allowed by this pipeline's rules." }
    }
  }

  // Enforce required-to-enter fields on the target stage.
  const targetStage = await (prisma as any).pipelineStage.findUnique({ where: { id: stageId }, select: { requiredPropertyIds: true, name: true } }).catch(() => null)
  if (targetStage?.requiredPropertyIds?.length) {
    const missing = await missingRequiredFields(recordType, recordId, targetStage.requiredPropertyIds)
    if (missing.length) return { error: `Fill required field${missing.length > 1 ? "s" : ""} before moving to ${targetStage.name}: ${missing.join(", ")}` }
  }

  const moved = await logStageTransition(recordType, recordId, pipelineId, stageId, session.user.id)
  // A stage change is a "stageId property changed" event for automations.
  if (moved) await runTrigger_RecordPropertyChanged(recordType, recordId, { stageId }, session.user.id).catch(() => {})
  if (recordType.startsWith("CO:")) {
    const key = recordType.slice(3)
    revalidatePath(`/objects/${key}/board`)
    revalidatePath(`/objects/${key}/${recordId}`)
  } else if (recordType === "REFERRAL") {
    revalidatePath(`/referrals/${recordId}`)
    revalidatePath("/referrals")
    revalidatePath("/referrals/board")
  }
  return { success: true }
}

// Board data for Referrals + a pipeline (mirrors getBoardData for custom objects).
export async function getReferralBoardData(pipelineId?: string | null): Promise<BoardData> {
  const pipelines = await pipelinesForObject("REFERRAL")
  const pipeline = (pipelineId ? pipelines.find((p) => p.id === pipelineId) : pipelines[0]) ?? null
  if (!pipeline) return { pipeline: null, stages: [], cards: [] }

  const referrals = await prisma.referral.findMany({
    where: { pipelineId: pipeline.id },
    select: { id: true, patientFirstName: true, patientLastName: true, stageId: true as any, assignedTo: { select: { name: true, email: true } } },
    orderBy: { referralDate: "desc" },
    take: 1000,
  }) as any[]
  const ids = referrals.map((r) => r.id)
  const transitions = ids.length
    ? await (prisma as any).stageTransition.findMany({ where: { recordType: "REFERRAL", recordId: { in: ids } }, orderBy: { enteredAt: "desc" }, select: { recordId: true, enteredAt: true } })
    : []
  const enteredAt = new Map<string, string>()
  for (const t of transitions) if (!enteredAt.has(t.recordId)) enteredAt.set(t.recordId, t.enteredAt.toISOString())

  const cards: BoardCard[] = referrals.map((r) => ({
    id: r.id,
    title: `${r.patientFirstName ?? ""} ${r.patientLastName ?? ""}`.trim() || "Referral",
    ownerName: r.assignedTo?.name || r.assignedTo?.email || null,
    stageId: r.stageId ?? null,
    enteredAt: enteredAt.get(r.id) ?? null,
  }))
  return { pipeline: { id: pipeline.id, name: pipeline.name }, stages: pipeline.stages as any, cards }
}

// Which of `propIds` are empty on the record (custom properties). Returns display names.
async function missingRequiredFields(recordType: string, recordId: string, propIds: string[]): Promise<string[]> {
  const empty = (v: any) => v == null || v === "" || (Array.isArray(v) && v.length === 0)
  let values: Record<string, any> = {}
  const nameMap: Record<string, string> = {}
  if (recordType === "REFERRAL") {
    const r = await prisma.referral.findUnique({ where: { id: recordId }, select: { customProperties: true } }).catch(() => null)
    values = (r?.customProperties as any) ?? {}
    const props = await prisma.customProperty.findMany({ where: { id: { in: propIds } }, select: { id: true, name: true } }).catch(() => [])
    for (const p of props) nameMap[p.id] = p.name
  } else if (recordType.startsWith("CO:")) {
    const r = await (prisma as any).customObjectRecord.findUnique({ where: { id: recordId }, select: { values: true } }).catch(() => null)
    values = (r?.values as any) ?? {}
  }
  return propIds.filter((id) => empty(values[id])).map((id) => nameMap[id] ?? "a required field")
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
