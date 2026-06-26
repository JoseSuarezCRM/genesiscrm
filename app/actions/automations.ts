"use server"

import { requireAccess, requireDelete } from "@/lib/auth-guard"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { AutomationTrigger, AutomationAction } from "@prisma/client"
import { runScheduledTriggers } from "@/lib/automation-engine"

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

  await prisma.automation.create({
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
  return { success: true }
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
