"use server"

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

export async function toggleAutomation(id: string, isActive: boolean) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  await prisma.automation.update({ where: { id }, data: { isActive } })
  revalidatePath("/automations")
  return { success: true }
}

export async function deleteAutomation(id: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  await prisma.automation.delete({ where: { id } })
  revalidatePath("/automations")
  return { success: true }
}

export async function runScheduledAutomationsAction() {
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
    select: { id: true, triggeredAt: true, result: true, contextType: true, contextId: true, detail: true },
  })
  return runs.map(r => ({ ...r, triggeredAt: r.triggeredAt.toISOString() }))
}
