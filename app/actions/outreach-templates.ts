"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { createAuditLog } from "@/lib/audit"
import { AuditAction } from "@prisma/client"

async function requireAdmin() {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  if ((session.user as { role?: string }).role !== "ADMIN") {
    throw new Error("Admin access required")
  }
  return session
}

export async function getOutreachTemplates() {
  await requireAdmin()
  return prisma.outreachTemplate.findMany({
    orderBy: [{ trigger: "asc" }, { channel: "asc" }],
  })
}

export async function updateOutreachTemplate(
  id: string,
  data: { body: string; subject?: string | null; isActive: boolean }
) {
  const session = await requireAdmin()

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
