// Where an imported custom-object record sits in its object's pipelines.
//
// A file places records with a Pipeline and a Stage column — names as they read
// in Settings → Pipelines, any case, or the internal ids. A record the file says
// nothing about goes where the create form puts it: the default pipeline (the
// first one) and its first stage. Imports skip pipeline rules and stage
// required-fields, as HubSpot's do: they are a data load, not a manual move.

import { prisma } from "@/lib/prisma"
import { logStageTransition } from "@/lib/stages/core"

export interface ImportPipeline {
  id: string
  name: string
  stages: { id: string; name: string }[]
}

export type StagePlacement =
  | { pipelineId: string; stageId: string }
  | { unchanged: true }
  | { error: string }

const norm = (s: string) => s.trim().toLowerCase()
const findStage = (p: ImportPipeline, cell: string) =>
  p.stages.find((s) => s.id === cell.trim() || norm(s.name) === norm(cell))
const names = (list: { name: string }[]) => list.map((x) => x.name).join(", ")

/**
 * Resolve one row. `current` is the existing record's position, or null for a
 * record the row creates. Pipelines come in their configured order, so the first
 * one that has stages is the default.
 */
export function resolveImportStage(
  pipelines: ImportPipeline[],
  pipelineCell: string,
  stageCell: string,
  current: { pipelineId: string | null; stageId: string | null } | null,
): StagePlacement {
  const usable = pipelines.filter((p) => p.stages.length > 0)
  const pCell = (pipelineCell ?? "").trim()
  const sCell = (stageCell ?? "").trim()
  const isNew = current === null
  const defaultPipeline = usable[0]

  if (!pCell && !sCell) {
    if (!isNew || !defaultPipeline) return { unchanged: true }
    return { pipelineId: defaultPipeline.id, stageId: defaultPipeline.stages[0].id }
  }
  if (!usable.length) return { error: "This object has no pipelines with stages yet — set one up in Settings → Pipelines." }

  if (pCell) {
    const p = pipelines.find((x) => x.id === pCell || norm(x.name) === norm(pCell))
    if (!p) return { error: `Unknown pipeline "${pCell}". Pipelines: ${names(usable)}` }
    if (!p.stages.length) return { error: `Pipeline "${p.name}" has no stages yet` }
    if (sCell) {
      const s = findStage(p, sCell)
      return s ? { pipelineId: p.id, stageId: s.id } : { error: `Stage "${sCell}" isn't in ${p.name} (stages: ${names(p.stages)})` }
    }
    if (!isNew && current!.pipelineId === p.id && current!.stageId) return { unchanged: true }
    return { pipelineId: p.id, stageId: p.stages[0].id }
  }

  // A stage on its own: the record's own pipeline first, then the default, then
  // the one pipeline that has a stage by that name.
  const home = !isNew ? usable.find((p) => p.id === current!.pipelineId) : undefined
  for (const p of [home, defaultPipeline]) {
    const s = p && findStage(p, sCell)
    if (p && s) return { pipelineId: p.id, stageId: s.id }
  }
  const matches = usable.filter((p) => findStage(p, sCell))
  if (matches.length === 1) return { pipelineId: matches[0].id, stageId: findStage(matches[0], sCell)!.id }
  if (matches.length > 1) return { error: `Stage "${sCell}" is in ${names(matches)} — add a Pipeline column` }
  return { error: `Unknown stage "${sCell}". Stages: ${usable.map((p) => `${p.name}: ${names(p.stages)}`).join(" · ")}` }
}

/** Keys an import's undo snapshot uses for the record's position; never values-bag properties. */
export const STAGE_SNAPSHOT_KEYS = ["__pipelineId", "__stageId", "__transitionId"] as const

/**
 * Move an existing record to its resolved position, returning what Undo needs:
 * where it was, and the id of the transition this created. Null when it didn't move.
 */
export async function applyImportStage(
  recordType: string,
  recordId: string,
  placement: StagePlacement,
  current: { pipelineId: string | null; stageId: string | null },
  byUserId: string | null,
  db: any = prisma,
): Promise<Record<string, string | null> | null> {
  if (!("pipelineId" in placement)) return null
  const transitionId = await logStageTransition(recordType, recordId, placement.pipelineId, placement.stageId, byUserId, db)
  if (!transitionId) return null
  return { __pipelineId: current.pipelineId, __stageId: current.stageId, __transitionId: transitionId }
}

/**
 * Undo an import's stage move: delete its transition and put the record back —
 * but only while that move is still the record's latest. If someone has moved
 * the record since, their move stands. Returns whether it reverted.
 */
export async function revertImportStage(
  recordType: string,
  recordId: string,
  before: Record<string, unknown>,
  db: any = prisma,
): Promise<boolean> {
  const transitionId = before.__transitionId
  if (typeof transitionId !== "string") return false
  const latest = await db.stageTransition.findFirst({
    where: { recordType, recordId },
    orderBy: [{ enteredAt: "desc" }, { id: "desc" }],
    select: { id: true },
  })
  if (latest?.id !== transitionId) return false
  await db.stageTransition.delete({ where: { id: transitionId } })
  await db.customObjectRecord.update({
    where: { id: recordId },
    data: { pipelineId: (before.__pipelineId as string | null) ?? null, stageId: (before.__stageId as string | null) ?? null },
  })
  return true
}
