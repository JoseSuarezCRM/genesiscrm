"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { sendEmail, type EmailSender } from "@/lib/graph-mailer"
import { revalidatePath } from "next/cache"

export async function sendDirectEmail(input: {
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  body: string
  sender?: EmailSender
}): Promise<{ success: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { success: false, error: "Unauthorized" }

  if (input.to.length === 0) return { success: false, error: "At least one recipient required." }
  if (!input.subject.trim()) return { success: false, error: "Subject is required." }
  if (!input.body.trim()) return { success: false, error: "Body is required." }

  const html = input.body.replace(/\n/g, "<br>")
  const result = await sendEmail(input.to, input.subject, html, {
    cc: input.cc,
    bcc: input.bcc,
    sender: input.sender || "referrals",
  })

  await prisma.directEmail.create({
    data: {
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      body: input.body,
      success: result.success,
      error: result.error ?? null,
      sentById: session.user.id,
    },
  })

  revalidatePath("/broadcasts")
  return result
}

export async function listDirectEmails() {
  const session = await auth()
  if (!session?.user) return []

  return prisma.directEmail.findMany({
    orderBy: { sentAt: "desc" },
    take: 100,
    include: { sentBy: { select: { name: true, email: true } } },
  })
}
