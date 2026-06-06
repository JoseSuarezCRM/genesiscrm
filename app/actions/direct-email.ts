"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { sendEmail, type EmailSender, type EmailAttachment } from "@/lib/graph-mailer"
import { revalidatePath } from "next/cache"

// Body may already be HTML (from the rich text editor); only convert newlines for legacy plain text.
function toHtml(body: string) {
  return /<[a-z][\s\S]*>/i.test(body) ? body : body.replace(/\n/g, "<br>")
}

export async function sendDirectEmail(input: {
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  body: string
  sender?: EmailSender
  attachments?: EmailAttachment[]
}): Promise<{ success: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { success: false, error: "Unauthorized" }

  if (input.to.length === 0) return { success: false, error: "At least one recipient required." }
  if (!input.subject.trim()) return { success: false, error: "Subject is required." }
  if (!input.body.trim()) return { success: false, error: "Body is required." }

  const result = await sendEmail(input.to, input.subject, toHtml(input.body), {
    cc: input.cc,
    bcc: input.bcc,
    sender: input.sender || "referrals",
    attachments: input.attachments,
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
