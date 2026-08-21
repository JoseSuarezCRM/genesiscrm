"use server"

import { requireAccess, requireDelete } from "@/lib/auth-guard"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { AutomationTrigger, AutomationAction } from "@prisma/client"
import { runScheduledTriggers, countMatchingRecords, enrollExistingRecords, manualEnrollRecords, searchObjectRecords, matchRecordsByGroups } from "@/lib/automation-engine"

export async function createAutomation(data: {
  name: string
  description?: string
  triggerType: AutomationTrigger
  triggerConfig: Record<string, unknown>
  actionType: AutomationAction
  actionConfig: Record<string, unknown>
  flow?: Record<string, unknown> | null
  graph?: Record<string, unknown> | null
}) {
  await requireAccess("AUTOMATIONS", "EDIT")
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const created = await prisma.automation.create({
    data: {
      name: data.name,
      description: data.description || null,
      triggerType: data.triggerType,
      triggerConfig: data.triggerConfig as any,
      actionType: data.actionType,
      actionConfig: data.actionConfig as any,
      flow: (data.flow ?? undefined) as any,
      graph: (data.graph ?? undefined) as any,
      createdById: session.user.id,
    },
  })

  revalidatePath("/automations")
  return { success: true, id: created.id }
}

// Editor preview: how many existing records currently match this trigger + criteria.
export async function countWorkflowMatches(input: {
  objectType: string
  triggerType: string
  triggerConfig: Record<string, unknown>
}): Promise<{ count: number }> {
  await requireAccess("AUTOMATIONS", "EDIT")
  try {
    const count = await countMatchingRecords(input.objectType, input.triggerType, input.triggerConfig)
    return { count }
  } catch {
    return { count: 0 }
  }
}

// Run the full workflow once on every existing record that currently matches.
export async function enrollExistingForAutomation(automationId: string): Promise<{ matched: number; ran: number; capped: boolean }> {
  await requireAccess("AUTOMATIONS", "EDIT")
  return enrollExistingRecords(automationId)
}

// ─── Manual enrollment ────────────────────────────────────────────────────────

async function automationObjectType(automationId: string): Promise<string> {
  const a = await prisma.automation.findUnique({ where: { id: automationId }, select: { triggerConfig: true } })
  return ((a?.triggerConfig as any)?.objectType as string) || "REFERRAL"
}

// Run the workflow now on an explicit set of records (individual picks or a filter's matches).
export async function manualEnroll(automationId: string, recordIds: string[]): Promise<{ ran: number; capped: boolean }> {
  await requireAccess("AUTOMATIONS", "EDIT")
  if (!Array.isArray(recordIds) || !recordIds.length) return { ran: 0, capped: false }
  return manualEnrollRecords(automationId, recordIds)
}

// Search the workflow object's records by label — for the individual-record picker.
export async function searchEnrollRecords(automationId: string, query: string): Promise<{ id: string; label: string }[]> {
  await requireAccess("AUTOMATIONS", "EDIT")
  const objectType = await automationObjectType(automationId)
  return searchObjectRecords(objectType, query ?? "")
}

// Preview which records match an ad-hoc criteria group set — for the custom-filter mode.
export async function previewCriteriaMatches(automationId: string, groups: any[]): Promise<{ records: { id: string; label: string }[]; count: number; capped: boolean }> {
  await requireAccess("AUTOMATIONS", "EDIT")
  const objectType = await automationObjectType(automationId)
  return matchRecordsByGroups(objectType, (groups ?? []) as any)
}

export async function updateAutomation(id: string, data: {
  name: string
  description?: string
  triggerType: AutomationTrigger
  triggerConfig: Record<string, unknown>
  actionType: AutomationAction
  actionConfig: Record<string, unknown>
  flow?: Record<string, unknown> | null
  graph?: Record<string, unknown> | null
  isActive: boolean
}) {
  await requireAccess("AUTOMATIONS", "EDIT")
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  await prisma.automation.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description || null,
      triggerType: data.triggerType,
      triggerConfig: data.triggerConfig as any,
      actionType: data.actionType,
      actionConfig: data.actionConfig as any,
      flow: (data.flow ?? null) as any,
      graph: (data.graph ?? null) as any,
      isActive: data.isActive,
    },
  })

  revalidatePath("/automations")
  return { success: true }
}

// Duplicate an existing workflow. The (potentially large) graph is copied
// server-side — it never travels over the wire — so this works regardless of
// the Server Action body-size limit. The clone starts paused (isActive: false).
export async function cloneAutomation(id: string) {
  await requireAccess("AUTOMATIONS", "EDIT")
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const src = await prisma.automation.findUnique({ where: { id } })
  if (!src) throw new Error("Workflow not found")

  const created = await prisma.automation.create({
    data: {
      name: `${src.name} (copy)`,
      description: src.description,
      triggerType: src.triggerType,
      triggerConfig: (src.triggerConfig ?? undefined) as any,
      actionType: src.actionType,
      actionConfig: (src.actionConfig ?? undefined) as any,
      flow: (src.flow ?? undefined) as any,
      graph: (src.graph ?? undefined) as any,
      isActive: false,
      createdById: session.user.id,
    },
  })

  revalidatePath("/automations")
  return { success: true, id: created.id }
}

export async function toggleAutomation(id: string, isActive: boolean) {
  await requireAccess("AUTOMATIONS", "EDIT")
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  await prisma.automation.update({ where: { id }, data: { isActive } })
  revalidatePath("/automations")
  return { success: true }
}

export async function deleteAutomation(id: string) {
  await requireDelete("AUTOMATIONS")
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  await prisma.automation.delete({ where: { id } })
  revalidatePath("/automations")
  return { success: true }
}

export async function runScheduledAutomationsAction() {
  await requireAccess("AUTOMATIONS", "EDIT")
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  await runScheduledTriggers()
  revalidatePath("/automations")
  return { success: true }
}

export async function getAutomationRuns(automationId: string, limit = 100) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const runs = await prisma.automationRun.findMany({
    where: { automationId },
    orderBy: { triggeredAt: "desc" },
    take: Math.min(limit, 300),
    select: { id: true, triggeredAt: true, result: true, contextType: true, contextId: true, detail: true, meta: true },
  })
  return runs.map(r => ({ ...r, triggeredAt: r.triggeredAt.toISOString() }))
}
