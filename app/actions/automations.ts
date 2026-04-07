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
