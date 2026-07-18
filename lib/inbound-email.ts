// Poll connected mailboxes for inbound email replies and store them as DirectEmail
// rows (direction INBOUND). Matched into a record's feed by the sender address, the
// same way outbound is matched by recipient. Deduped by internetMessageId.

import { prisma } from "@/lib/prisma"
import { fetchInboundMessages } from "@/lib/graph-mailer"

// The mailboxes we can read: every user who has email sending enabled (their
// @genesisortho.com inbox), plus any shared mailboxes configured via env.
async function connectedMailboxes(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { emailSendingEnabled: true, email: { not: "" } },
    select: { email: true },
  })
  const shared = (process.env.SHARED_MAILBOXES ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  return Array.from(new Set([...users.map((u) => u.email.toLowerCase()), ...shared.map((s) => s.toLowerCase())]))
}

export async function pollInboundEmails(): Promise<{ polled: number; stored: number; errors: string[] }> {
  const mailboxes = await connectedMailboxes()
  const mailboxSet = new Set(mailboxes)
  // Look back a window that comfortably covers the cron interval + clock skew.
  const since = new Date(Date.now() - 30 * 60_000).toISOString()

  let stored = 0
  const errors: string[] = []

  for (const mailbox of mailboxes) {
    try {
      const messages = await fetchInboundMessages(mailbox, since)
      for (const m of messages) {
        if (!m.internetMessageId) continue
        // Skip mail we sent (from one of our own mailboxes) — we only want replies.
        if (m.fromEmail && mailboxSet.has(m.fromEmail)) continue

        try {
          await prisma.directEmail.create({
            data: {
              direction: "INBOUND",
              internetMessageId: m.internetMessageId,
              conversationId: m.conversationId,
              fromEmail: m.fromEmail,
              to: m.toRecipients,
              cc: [],
              bcc: [],
              subject: m.subject,
              body: m.bodyHtml,
              sentAt: new Date(m.receivedAt),
              success: true,
            },
          })
          stored++
        } catch {
          // Unique violation on internetMessageId = already ingested; ignore.
        }
      }
    } catch (e: any) {
      errors.push(e.message ?? String(e))
    }
  }

  return { polled: mailboxes.length, stored, errors }
}
