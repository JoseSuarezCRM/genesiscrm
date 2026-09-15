// Which signature goes on an outbound email, and how it's attached.
//
// Outlook signatures can't be read: Microsoft has no Graph API for them — they
// live in the Outlook client, not the mailbox — and Graph's sendMail transmits
// exactly the HTML it's given. So the CRM stores its own.
//
// One rule decides everything, keyed off the from-address:
//
//   shared mailbox  → that mailbox's signature (or the org default if blank)
//   a person        → their personal signature, else the org default
//   anything else   → the org default
//
// That's what lets cron reports, workflow mail and invites work with no special
// casing: they send from a shared mailbox and pick up its signature on the way
// past. It also settles the case where someone composes *as* a department —
// from-address is surgery@, so it signs off as Surgery, not as them.
//
// Server-only: imports Prisma.

import { prisma } from "@/lib/prisma"
import { findMailboxByEmail } from "@/lib/shared-mailboxes"

export const ORG_SIGNATURE_ID = "org"

// Sends happen in loops — a sequence run, a broadcast, a report to a list — and
// the signature is the same every time round. Cache briefly per from-address.
const TTL_MS = 60_000
const cache = new Map<string, { at: number; html: string }>()

export function invalidateSignatureCache() {
  cache.clear()
}

async function signatureRow(id: string): Promise<string | null> {
  try {
    const row = await (prisma as any).emailSignature.findUnique({ where: { id } })
    if (!row || !row.enabled) return null
    const html = String(row.html ?? "").trim()
    return html || null
  } catch {
    return null
  }
}

/** The organization default, or "" if none is set. */
export async function orgSignature(): Promise<string> {
  return (await signatureRow(ORG_SIGNATURE_ID)) ?? ""
}

/**
 * The signature for a given from-address. Returns "" when there is none — never
 * throws, because a signature lookup must not be able to stop an email.
 */
export async function signatureForSender(fromEmail: string | null | undefined): Promise<string> {
  const key = (fromEmail ?? "").trim().toLowerCase()
  if (!key) return ""

  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.html

  let html = ""
  try {
    const mailbox = await findMailboxByEmail(key)
    if (mailbox) {
      html = (mailbox.signatureHtml ?? "").trim() || (await orgSignature())
    } else {
      const user = await prisma.user.findFirst({
        where: { email: { equals: key, mode: "insensitive" } },
        select: { id: true },
      })
      html = (user ? await signatureRow(user.id) : null) ?? (await orgSignature())
    }
  } catch {
    html = ""
  }

  cache.set(key, { at: Date.now(), html })
  return html
}

/**
 * Attach a signature to a message body. Separated by a rule so it reads as a
 * sign-off rather than more of the message, and wrapped in the same base font
 * the send paths use so it doesn't inherit whatever the body ended with.
 */
export function appendSignature(html: string, signature: string): string {
  const sig = (signature ?? "").trim()
  if (!sig) return html
  return (
    `${html}` +
    `<div style="margin-top:18px;padding-top:12px;border-top:1px solid #e2e8f0;` +
    `font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#334155;">` +
    `${sig}</div>`
  )
}

/** Resolve and attach in one step — what the send paths call. */
export async function withSignature(html: string, fromEmail: string | null | undefined): Promise<string> {
  return appendSignature(html, await signatureForSender(fromEmail))
}
