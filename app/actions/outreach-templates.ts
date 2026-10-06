"use server"

import { requireSettingsPage } from "@/lib/auth-guard"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { createAuditLog } from "@/lib/audit"
import { AuditAction } from "@prisma/client"

// Everything here belongs to the outreach settings page: admins, or anyone given
// that page's box in User Management (lib/settings-pages.ts).
const requirePageAccess = () => requireSettingsPage("outreach")

export async function getOutreachTemplates() {
  await requirePageAccess()
  return prisma.outreachTemplate.findMany({
    orderBy: [{ trigger: "asc" }, { channel: "asc" }],
  })
}

// Used by the outreach dialog — available to all authenticated staff
export async function getEmailTemplates() {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  return prisma.outreachTemplate.findMany({
    where: { channel: "EMAIL", isActive: true },
    orderBy: { trigger: "asc" },
    select: { id: true, trigger: true, subject: true, body: true },
  })
}

export async function toggleOutreachTemplate(id: string) {
  const session = await requirePageAccess()

  const current = await prisma.outreachTemplate.findUniqueOrThrow({ where: { id } })
  const template = await prisma.outreachTemplate.update({
    where: { id },
    data: { isActive: !current.isActive },
  })

  await createAuditLog({
    userId: session.user.id,
    action: AuditAction.USER_UPDATE,
    resourceType: "OutreachTemplate",
    resourceId: id,
    metadata: { trigger: template.trigger, channel: template.channel, isActive: template.isActive },
  })

  revalidatePath("/settings/outreach")
  return { isActive: template.isActive }
}

export async function updateOutreachTemplate(
  id: string,
  data: { body: string; subject?: string | null; isActive: boolean }
) {
  const session = await requirePageAccess()

  const template = await prisma.outreachTemplate.update({
    where: { id },
    data: {
      body: data.body,
      subject: data.subject ?? null,
      isActive: data.isActive,
    },
  })

  await createAuditLog({
    userId: session.user.id,
    action: AuditAction.USER_UPDATE,
    resourceType: "OutreachTemplate",
    resourceId: id,
    metadata: { trigger: template.trigger, channel: template.channel, isActive: template.isActive },
  })

  revalidatePath("/settings/outreach")
  return { success: true }
}
