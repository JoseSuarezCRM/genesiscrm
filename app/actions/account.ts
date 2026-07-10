"use server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/graph-mailer"
import { availableSendersFor, resolveFromEmail, type SenderChoice } from "@/lib/email-senders"
import { EMAIL_SENDER_OPTIONS } from "@/lib/graph-mailer"
import { revalidatePath } from "next/cache"

// Sender options for workflow/sequence email steps: the record owner, the shared
// mailboxes, or any active user's integrated address (value = that address).
export async function getWorkflowSenderOptions(): Promise<{ value: string; label: string }[]> {
  const session = await auth()
  if (!session?.user) return []
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { email: true },
    orderBy: { email: "asc" },
  })
  return [
    { value: "record_owner", label: "Record owner (assigned or creator)" },
    ...EMAIL_SENDER_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    ...users.map((u) => ({ value: u.email, label: u.email })),
  ]
}

// The From-address options the signed-in user is allowed to pick.
export async function getMySenders(): Promise<SenderChoice[]> {
  const session = await auth()
  const id = (session?.user as any)?.id
  if (!id) return []
  const u = await prisma.user.findUnique({ where: { id }, select: { role: true, email: true, emailSendingEnabled: true } })
  return availableSendersFor(u)
}

// Resolve + enforce a chosen sender value to a concrete from-address for the
// signed-in user. Returns null if they aren't allowed to send as it.
export async function resolveMyFromEmail(value?: string | null): Promise<string | null> {
  const session = await auth()
  const id = (session?.user as any)?.id
  if (!id) return null
  const u = await prisma.user.findUnique({ where: { id }, select: { role: true, email: true, emailSendingEnabled: true } })
  return resolveFromEmail(u, value)
}

// Toggle whether the current user can send app email from their own mailbox.
export async function setMyEmailSending(enabled: boolean) {
  const session = await auth()
  const userId = (session?.user as any)?.id
  if (!userId) return { error: "Unauthorized" }
  await prisma.user.update({ where: { id: userId }, data: { emailSendingEnabled: enabled } })
  revalidatePath("/settings/account")
  return { success: true }
}

// Send a test email from the current user's own address to themselves — verifies
// the org's Microsoft 365 app is allowed to send as their mailbox.
export async function sendMyTestEmail() {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return { error: "Your account has no email address." }

  const html = `<div style="font-family:sans-serif;max-width:520px;color:#1e293b;">
    <p style="font-size:15px;font-weight:600;">✅ Test email</p>
    <p>This was sent from your own address through Genesis Ortho CRM.</p>
    <p style="color:#64748b;font-size:13px;">If you received this, sending as <strong>${email}</strong> works — you can now pick your address when composing emails.</p>
  </div>`
  const result = await sendEmail(email, "Genesis Ortho CRM — test email", html, { fromEmail: email })
  if (!result.success) {
    return { error: result.error ?? "Failed to send. Your mailbox may not be authorized for app sending yet — ask an admin." }
  }
  return { success: true }
}
