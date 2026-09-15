// Which "From" addresses a given user may send app email as.
//
// The org's Microsoft 365 app can send as any @genesisortho.com mailbox, so a
// user with personal sending enabled can send as their own login address with no
// extra credentials. The shared org mailboxes (referrals@, surgery@, tpl@) are
// restricted to super admins.

import type { EmailSender } from "@/lib/graph-mailer"
import type { SharedMailboxInfo } from "@/lib/shared-mailboxes"

export interface SenderUser {
  role?: string | null
  email?: string | null
  emailSendingEnabled?: boolean | null
}

export interface SenderChoice {
  value: string   // "self", a legacy mailbox key ("surgery"), or a mailbox address
  email: string   // the actual from-address
  label: string
  kind: "self" | "shared"
}

export const SELF_SENDER_VALUE = "self"

// The sender options a user can pick, most-personal first. Everyone may pick any
// integrated address; their own address is listed first so record-based sends
// default to it.
export function availableSendersFor(
  user: SenderUser | null | undefined,
  mailboxes: SharedMailboxInfo[] = [],
): SenderChoice[] {
  const out: SenderChoice[] = []
  if (user?.email) {
    out.push({ value: SELF_SENDER_VALUE, email: user.email, label: `${user.email} (you)`, kind: "self" })
  }
  for (const m of mailboxes) {
    // Prefer the legacy key as the stored value so configs saved before shared
    // mailboxes were rows keep matching.
    out.push({ value: m.legacyKey ?? m.email, email: m.email, label: m.email, kind: "shared" })
  }
  return out
}

// Resolve a chosen sender value to a concrete from-address, enforcing permission.
// Returns null if the user isn't allowed to send as that value.
export function resolveFromEmail(
  user: SenderUser | null | undefined,
  value: string | null | undefined,
  mailboxes: SharedMailboxInfo[] = [],
): string | null {
  const choices = availableSendersFor(user, mailboxes)
  if (!value) return choices[0]?.email ?? null // default to the first allowed sender
  const match = choices.find((c) => c.value === value)
  if (match) return match.email
  // A mailbox added after the value was saved still resolves by address.
  const byEmail = choices.find((c) => c.email.toLowerCase() === value.toLowerCase())
  return byEmail ? byEmail.email : null
}

// Convenience: does this user have any way to send email?
export function canSendEmail(user: SenderUser | null | undefined, mailboxes: SharedMailboxInfo[] = []): boolean {
  return availableSendersFor(user, mailboxes).length > 0
}

export type { EmailSender }
