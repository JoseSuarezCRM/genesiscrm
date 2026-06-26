"use server"

import { requirePermission } from "@/lib/auth-guard"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { OutreachChannel } from "@prisma/client"

function pathFor(channel: OutreachChannel) {
  return channel === "SMS" ? "/communications/sms" : "/communications/email"
}

export async function getMessageTemplates(channel: OutreachChannel) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  return prisma.messageTemplate.findMany({
    where: { channel },
    orderBy: { updatedAt: "desc" },
  })
}

export async function createMessageTemplate(data: {
  name: string
  channel: OutreachChannel
  subject?: string | null
  body: string
}) {
  await requirePermission("MANAGE_TEMPLATES")
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  if (!data.name?.trim()) return { error: "Template name is required" }

  const created = await prisma.messageTemplate.create({
    data: {
      name: data.name.trim(),
      channel: data.channel,
      subject: data.channel === "EMAIL" ? (data.subject?.trim() || null) : null,
      body: data.body ?? "",
      createdById: session.user.id,
    },
  })
  revalidatePath(pathFor(data.channel))
  return { success: true, id: created.id }
}

export async function updateMessageTemplate(id: string, data: {
  name: string
  subject?: string | null
  body: string
}) {
  await requirePermission("MANAGE_TEMPLATES")
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  if (!data.name?.trim()) return { error: "Template name is required" }

  const tpl = await prisma.messageTemplate.update({
    where: { id },
    data: {
      name: data.name.trim(),
      subject: data.subject?.trim() || null,
      body: data.body ?? "",
    },
  })
  revalidatePath(pathFor(tpl.channel))
  return { success: true }
}

export async function toggleMessageTemplate(id: string, isActive: boolean) {
  await requirePermission("MANAGE_TEMPLATES")
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  const tpl = await prisma.messageTemplate.update({ where: { id }, data: { isActive } })
  revalidatePath(pathFor(tpl.channel))
  return { success: true }
}

export async function deleteMessageTemplate(id: string) {
  await requirePermission("MANAGE_TEMPLATES")
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  const tpl = await prisma.messageTemplate.delete({ where: { id } })
  revalidatePath(pathFor(tpl.channel))
  return { success: true }
}
