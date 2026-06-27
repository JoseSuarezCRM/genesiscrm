"use server"

import { requireAccess, requireDelete } from "@/lib/auth-guard"
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
  const templates = await prisma.messageTemplate.findMany({
    where: { channel },
    orderBy: { updatedAt: "desc" },
  })
  // Resolve the audit user ids → display names.
  const ids = Array.from(new Set(templates.flatMap((t) => [t.createdById, t.updatedById, t.lastViewedById]).filter(Boolean) as string[]))
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }) : []
  const nameById = Object.fromEntries(users.map((u) => [u.id, u.name ?? u.email]))
  return templates.map((t) => ({
    ...t,
    createdByName: t.createdById ? nameById[t.createdById] ?? null : null,
    updatedByName: t.updatedById ? nameById[t.updatedById] ?? null : null,
    lastViewedByName: t.lastViewedById ? nameById[t.lastViewedById] ?? null : null,
  }))
}

// Record that the current user viewed a template (for "Last viewed by").
export async function recordTemplateView(id: string) {
  const session = await auth()
  if (!session?.user) return
  await prisma.messageTemplate.update({
    where: { id },
    data: { lastViewedById: session.user.id, lastViewedAt: new Date() },
  }).catch(() => {})
}

export async function createMessageTemplate(data: {
  name: string
  channel: OutreachChannel
  subject?: string | null
  body: string
}) {
  await requireAccess("TEMPLATES", "EDIT")
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
  await requireAccess("TEMPLATES", "EDIT")
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  if (!data.name?.trim()) return { error: "Template name is required" }

  const tpl = await prisma.messageTemplate.update({
    where: { id },
    data: {
      name: data.name.trim(),
      subject: data.subject?.trim() || null,
      body: data.body ?? "",
      updatedById: session.user.id,
    },
  })
  revalidatePath(pathFor(tpl.channel))
  return { success: true }
}

export async function toggleMessageTemplate(id: string, isActive: boolean) {
  await requireAccess("TEMPLATES", "EDIT")
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  const tpl = await prisma.messageTemplate.update({ where: { id }, data: { isActive } })
  revalidatePath(pathFor(tpl.channel))
  return { success: true }
}

export async function deleteMessageTemplate(id: string) {
  await requireDelete("TEMPLATES")
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  const tpl = await prisma.messageTemplate.delete({ where: { id } })
  revalidatePath(pathFor(tpl.channel))
  return { success: true }
}
