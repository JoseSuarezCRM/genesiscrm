"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { sendEmail } from "@/lib/graph-mailer"
import {
  listSharedMailboxes, invalidateMailboxCache, ensureSeeded,
} from "@/lib/shared-mailboxes"
import { invalidateSignatureCache } from "@/lib/email-signature"
import { sanitizeSignatureHtml } from "@/lib/sanitize-signature"

async function requireAdmin() {
  const session = await auth()
  const user = session?.user as any
  if (!user) throw new Error("Unauthorized")
  if (user.role !== "ADMIN") throw new Error("You don't have permission to do this")
  return session!
}

/** Sender options for the workflow editor's email/invite actions. */
export async function getSharedMailboxOptions(): Promise<{ value: string; label: string }[]> {
  const session = await auth()
  if (!session?.user) return []
  const boxes = await listSharedMailboxes()
  return boxes.map((m) => ({ value: m.legacyKey ?? m.email, label: m.email }))
}

/** The full list for the Settings screen, disabled rows included. */
export async function listMailboxesForSettings() {
  await requireAdmin()
  await ensureSeeded()
  return (prisma as any).sharedMailbox.findMany({
    orderBy: [{ order: "asc" }, { email: "asc" }],
  })
}

export async function createSharedMailbox(input: { email: string; label: string }) {
  const session = await requireAdmin()
  const email = input.email.trim()
  const label = input.label.trim() || email
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "That doesn't look like an email address." }

  const existing = await (prisma as any).sharedMailbox.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  })
  if (existing) return { error: "That mailbox is already on the list." }

  const count = await (prisma as any).sharedMailbox.count()
  await (prisma as any).sharedMailbox.create({
    data: { email, label, order: count, updatedById: (session.user as any).id ?? null },
  })
  invalidateMailboxCache()
  invalidateSignatureCache()
  revalidatePath("/settings/email")
  return { success: true }
}

export async function updateSharedMailbox(
  id: string,
  data: { label?: string; signatureHtml?: string | null; enabled?: boolean; order?: number },
) {
  const session = await requireAdmin()
  // Same rule as the org/personal signatures: raw HTML in, nothing executable stored.
  const signatureHtml = data.signatureHtml == null
    ? data.signatureHtml
    : sanitizeSignatureHtml(data.signatureHtml)
  await (prisma as any).sharedMailbox.update({
    where: { id },
    data: { ...data, ...(data.signatureHtml !== undefined ? { signatureHtml } : {}), updatedById: (session.user as any).id ?? null },
  })
  invalidateMailboxCache()
  invalidateSignatureCache()
  revalidatePath("/settings/email")
  return { success: true }
}

export async function deleteSharedMailbox(id: string) {
  await requireAdmin()
  await (prisma as any).sharedMailbox.delete({ where: { id } })
  invalidateMailboxCache()
  invalidateSignatureCache()
  revalidatePath("/settings/email")
  return { success: true }
}

/**
 * Prove the app can actually send as a mailbox before anyone relies on it.
 *
 * The Azure app has org-wide Mail.Send, so any real @genesisortho.com mailbox
 * should work — but a typo'd address would otherwise sit there looking fine and
 * fail silently inside a 2am cron.
 *
 * The signature rides along deliberately. This button is the only way to see a
 * *shared mailbox's* signature as a recipient gets it — logos embedded, rendered
 * by a real mail client rather than by our preview — so suppressing it would
 * leave that untestable.
 */
export async function testSharedMailbox(id: string) {
  const session = await requireAdmin()
  const box = await (prisma as any).sharedMailbox.findUnique({ where: { id } })
  if (!box) return { error: "Mailbox not found." }
  const to = (session.user as any).email as string
  if (!to) return { error: "Your account has no email address to send the test to." }

  const hasOwn = !!String(box.signatureHtml ?? "").trim()
  const res = await sendEmail(
    to,
    `Test send from ${box.email}`,
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1e293b">` +
    `<p>This confirms the CRM can send as <strong>${box.email}</strong>.</p>` +
    `<p style="color:#64748b;font-size:13px">Below is the ${hasOwn ? "mailbox's own" : "organization"} ` +
    `signature, exactly as a recipient sees it.</p></div>`,
    { fromEmail: box.email },
  )
  if (!res.success) return { error: res.error ?? "The test send failed." }
  return { success: true, sentTo: to }
}
