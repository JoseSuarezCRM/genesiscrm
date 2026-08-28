"use server"

import { requireAccess, requireDelete } from "@/lib/auth-guard"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"

async function requireAdmin() {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  if ((session.user as { role?: string }).role !== "ADMIN") throw new Error("Admin access required")
}

// Per-object pipeline display style ("text" | "dot" | "badge").
export async function getPipelineColorStyle(objectType: string): Promise<string> {
  const row = await (prisma as any).pipelineSettings.findUnique({ where: { objectType } }).catch(() => null)
  return row?.colorStyle ?? "dot"
}

export async function setPipelineColorStyle(objectType: string, colorStyle: string) {
  await requireAccess("PIPELINES", "EDIT")
  await requireAdmin()
  const style = ["text", "dot", "badge"].includes(colorStyle) ? colorStyle : "dot"
  await (prisma as any).pipelineSettings.upsert({
    where: { objectType }, create: { objectType, colorStyle: style }, update: { colorStyle: style },
  })
  revalidatePath("/settings/pipelines")
  return { success: true }
}

export async function getPipelines(objectType = "REFERRAL") {
  return (prisma as any).pipeline.findMany({
    where: { isActive: true, objectType },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { stages: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] } },
  })
}

export async function createPipeline(data: { name: string; color: string; objectType?: string }) {
  await requireAccess("PIPELINES", "EDIT")
  await requireAdmin()
  if (!data.name.trim()) return { error: "Name is required" }
  const objectType = data.objectType ?? "REFERRAL"
  const maxOrder = await prisma.pipeline.aggregate({ where: { objectType } as any, _max: { order: true } })
  const pipeline = await (prisma as any).pipeline.create({
    data: {
      objectType,
      name: data.name.trim(),
      color: data.color || "#3b82f6",
      order: (maxOrder._max.order ?? 0) + 1,
      // seed a first stage so a new pipeline is usable immediately
      stages: { create: [{ name: "New", order: 0 }] },
    },
  })
  revalidatePath("/referrals")
  revalidatePath("/settings/pipelines")
  return { pipeline }
}

// Conditional logic per stage: set which of the object's properties are shown when
// a record is in `stageId`. Reuses CustomProperty.visibilityRule (controllingKey
// "stageId"); only touches unruled or already-stage-ruled properties so pipeline/
// status rules are never clobbered. (REFERRAL / built-in objects using CustomProperty.)
export async function setStageConditionalFields(objectType: string, stageId: string, propertyIds: string[]) {
  await requireAccess("PIPELINES", "EDIT")
  await requireAdmin()
  if (objectType.startsWith("CO:")) return { error: "Custom-object conditional logic is not supported yet." }
  const entityType = objectType // "REFERRAL", etc.
  const props = await prisma.customProperty.findMany({ where: { entityType: entityType as any }, select: { id: true, visibilityRule: true } })
  for (const p of props) {
    const rule = (p.visibilityRule as any) || null
    const isStageRule = !!rule && rule.controllingKey === "stageId"
    if (rule && !isStageRule) continue // don't clobber a pipeline/status rule
    const cur: string[] = isStageRule && Array.isArray(rule.equals) ? rule.equals : []
    const has = cur.includes(stageId)
    const want = propertyIds.includes(p.id)
    if (has === want) continue
    const equals = want ? Array.from(new Set([...cur, stageId])) : cur.filter((x) => x !== stageId)
    const newRule = equals.length ? { controllingKey: "stageId", equals } : null
    await prisma.customProperty.update({ where: { id: p.id }, data: { visibilityRule: newRule as any } })
  }
  revalidatePath("/settings/pipelines")
  revalidatePath("/referrals")
  return { success: true }
}

// ── Pipeline Rules (allowed stage transitions) ───────────────────────────────
export async function getPipelineRules(pipelineId: string): Promise<Record<string, string[]>> {
  const rows = await (prisma as any).pipelineRule.findMany({ where: { pipelineId } }).catch(() => [])
  const out: Record<string, string[]> = {}
  for (const r of rows) out[r.fromStageId] = r.toStageIds ?? []
  return out
}

export async function setPipelineRule(pipelineId: string, fromStageId: string, toStageIds: string[]) {
  await requireAccess("PIPELINES", "EDIT")
  await requireAdmin()
  if (!toStageIds.length) {
    await (prisma as any).pipelineRule.deleteMany({ where: { pipelineId, fromStageId } })
  } else {
    await (prisma as any).pipelineRule.upsert({
      where: { pipelineId_fromStageId: { pipelineId, fromStageId } },
      create: { pipelineId, fromStageId, toStageIds },
      update: { toStageIds },
    })
  }
  revalidatePath("/settings/pipelines")
  return { success: true }
}

// Fields required before a record can ENTER a stage (enforced in moveRecordStage).
export async function setStageRequiredFields(stageId: string, propertyIds: string[]) {
  await requireAccess("PIPELINES", "EDIT")
  await requireAdmin()
  await (prisma as any).pipelineStage.update({ where: { id: stageId }, data: { requiredPropertyIds: propertyIds } })
  revalidatePath("/settings/pipelines")
  return { success: true }
}

export async function reorderPipelines(objectType: string, ids: string[]) {
  await requireAccess("PIPELINES", "EDIT")
  await requireAdmin()
  await Promise.all(ids.map((id, i) => (prisma as any).pipeline.updateMany({ where: { id, objectType }, data: { order: i } })))
  revalidatePath("/settings/pipelines")
  return { success: true }
}

// Make a pipeline the default (first) — new records auto-enroll into the first pipeline.
export async function setDefaultPipeline(objectType: string, id: string) {
  await requireAccess("PIPELINES", "EDIT")
  await requireAdmin()
  const rows = await prisma.pipeline.findMany({ where: { objectType }, orderBy: [{ order: "asc" }, { createdAt: "asc" }], select: { id: true } })
  const ids = [id, ...rows.map((r) => r.id).filter((x) => x !== id)]
  await Promise.all(ids.map((pid, i) => prisma.pipeline.update({ where: { id: pid }, data: { order: i } })))
  revalidatePath("/settings/pipelines")
  return { success: true }
}

// Duplicate a pipeline and its stages.
export async function clonePipeline(id: string) {
  await requireAccess("PIPELINES", "EDIT")
  await requireAdmin()
  const src = await (prisma as any).pipeline.findUnique({ where: { id }, include: { stages: { orderBy: { order: "asc" } } } })
  if (!src) return { error: "Pipeline not found" }
  const maxOrder = await prisma.pipeline.aggregate({ where: { objectType: src.objectType } as any, _max: { order: true } })
  let name = `${src.name} (copy)`, n = 2
  while (await prisma.pipeline.findFirst({ where: { objectType: src.objectType, name } })) name = `${src.name} (copy ${n++})`
  const created = await (prisma as any).pipeline.create({
    data: {
      objectType: src.objectType, name, color: src.color, order: (maxOrder._max.order ?? 0) + 1,
      stages: { create: src.stages.map((s: any) => ({ name: s.name, order: s.order, probability: s.probability, isClosed: s.isClosed, isWon: s.isWon, color: s.color })) },
    },
    include: { stages: true, _count: { select: { stages: true } } },
  })
  revalidatePath("/settings/pipelines")
  return { pipeline: created }
}

// ── Stages ───────────────────────────────────────────────────────────────────
export async function upsertStage(pipelineId: string, stage: { id?: string; name: string; probability?: number | null; isClosed?: boolean; isWon?: boolean; color?: string | null }) {
  await requireAccess("PIPELINES", "EDIT")
  await requireAdmin()
  if (!stage.name.trim()) return { error: "Stage name is required" }
  const data = { name: stage.name.trim(), probability: stage.probability ?? null, isClosed: !!stage.isClosed, isWon: !!stage.isWon, color: stage.color ?? null }
  if (stage.id) {
    await (prisma as any).pipelineStage.update({ where: { id: stage.id }, data })
  } else {
    const max = await (prisma as any).pipelineStage.aggregate({ where: { pipelineId }, _max: { order: true } })
    await (prisma as any).pipelineStage.create({ data: { ...data, pipelineId, order: (max._max.order ?? -1) + 1 } })
  }
  revalidatePath("/settings/pipelines")
  return { success: true }
}

export async function reorderStages(pipelineId: string, ids: string[]) {
  await requireAccess("PIPELINES", "EDIT")
  await requireAdmin()
  await Promise.all(ids.map((id, i) => (prisma as any).pipelineStage.updateMany({ where: { id, pipelineId }, data: { order: i } })))
  revalidatePath("/settings/pipelines")
  return { success: true }
}

export async function deleteStage(id: string) {
  await requireDelete("PIPELINES")
  await requireAdmin()
  // Clear the stage off any records currently in it (they keep their pipeline).
  await (prisma as any).customObjectRecord.updateMany({ where: { stageId: id }, data: { stageId: null } }).catch(() => {})
  await (prisma as any).referral.updateMany({ where: { stageId: id } as any, data: { stageId: null } as any }).catch(() => {})
  await (prisma as any).pipelineStage.delete({ where: { id } })
  revalidatePath("/settings/pipelines")
  return { success: true }
}

export async function updatePipeline(id: string, data: { name?: string; color?: string }) {
  await requireAccess("PIPELINES", "EDIT")
  await requireAdmin()
  const pipeline = await prisma.pipeline.update({
    where: { id },
    data: {
      ...(data.name ? { name: data.name.trim() } : {}),
      ...(data.color ? { color: data.color } : {}),
    },
  })
  revalidatePath("/referrals")
  revalidatePath("/settings/pipelines")
  return { pipeline }
}

export async function deletePipeline(id: string) {
  await requireDelete("PIPELINES")
  await requireAdmin()
  const refs = await prisma.referral.count({ where: { pipelineId: id } })
  const cos = await (prisma as any).customObjectRecord.count({ where: { pipelineId: id } }).catch(() => 0)
  const count = refs + cos
  if (count > 0) return { error: `Cannot delete — ${count} record${count !== 1 ? "s" : ""} are assigned to this pipeline.` }
  await prisma.pipeline.delete({ where: { id } }) // stages cascade
  revalidatePath("/referrals")
  revalidatePath("/settings/pipelines")
  return { success: true }
}
