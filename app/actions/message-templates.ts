"use server"

import { requireAccess, requireDelete } from "@/lib/auth-guard"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { OutreachChannel } from "@prisma/client"
import { renderEmailHtml } from "@/lib/email-html"
import { asEmailBlocks, type EmailBlock } from "@/lib/email-blocks"

function pathFor(channel: OutreachChannel) {
  return channel === "SMS" ? "/communications/sms" : "/communications/email"
}

export async function getMessageTemplate(id: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  return prisma.messageTemplate.findUnique({ where: { id } })
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
  blocks?: EmailBlock[] | null
}) {
  await requireAccess("TEMPLATES", "EDIT")
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  if (!data.name?.trim()) return { error: "Template name is required" }

  // Block mode: render the body from blocks (authoritative). Otherwise store body as-is.
  const useBlocks = data.channel === "EMAIL" && data.blocks != null
  const body = useBlocks ? renderEmailHtml(asEmailBlocks(data.blocks)) : (data.body ?? "")

  const created = await prisma.messageTemplate.create({
    data: {
      name: data.name.trim(),
      channel: data.channel,
      subject: data.channel === "EMAIL" ? (data.subject?.trim() || null) : null,
      body,
      blocks: useBlocks ? (data.blocks as any) : undefined,
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
  // `blocks`: an array = block mode (body is rendered from it); null = clear blocks
  // (rich-text mode, keep body); undefined = leave blocks untouched.
  blocks?: EmailBlock[] | null
}) {
  await requireAccess("TEMPLATES", "EDIT")
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  if (!data.name?.trim()) return { error: "Template name is required" }

  const patch: Record<string, unknown> = {
    name: data.name.trim(),
    subject: data.subject?.trim() || null,
    updatedById: session.user.id,
  }
  if (data.blocks === null) { patch.blocks = null; patch.body = data.body ?? "" }
  else if (data.blocks !== undefined) { patch.blocks = data.blocks as any; patch.body = renderEmailHtml(asEmailBlocks(data.blocks)) }
  else { patch.body = data.body ?? "" }

  const tpl = await prisma.messageTemplate.update({ where: { id }, data: patch })
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
