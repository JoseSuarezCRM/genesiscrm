// Which "From" addresses a given user may send app email as.
//
// The org's Microsoft 365 app can send as any @genesisortho.com mailbox, so a
// user with personal sending enabled can send as their own login address with no
// extra credentials. The shared org mailboxes (referrals@, surgery@, tpl@) are
// restricted to super admins.

import { EMAIL_SENDER_OPTIONS, type EmailSender } from "@/lib/graph-mailer"

export interface SenderUser {
  role?: string | null
  email?: string | null
  emailSendingEnabled?: boolean | null
}

export interface SenderChoice {
  value: string   // "self" or an EmailSender key ("referrals" | "surgery" | "tpl")
  email: string   // the actual from-address
  label: string
  kind: "self" | "shared"
}

export const SELF_SENDER_VALUE = "self"

// The sender options this user is allowed to pick, most-personal first.
export function availableSendersFor(user: SenderUser | null | undefined): SenderChoice[] {
  const out: SenderChoice[] = []
  if (user?.emailSendingEnabled && user.email) {
    out.push({ value: SELF_SENDER_VALUE, email: user.email, label: `${user.email} (you)`, kind: "self" })
  }
  // Shared org mailboxes — super admins only.
  if (user?.role === "ADMIN") {
    for (const o of EMAIL_SENDER_OPTIONS) {
      out.push({ value: o.value, email: o.label, label: o.label, kind: "shared" })
    }
  }
  return out
}

// Resolve a chosen sender value to a concrete from-address, enforcing permission.
// Returns null if the user isn't allowed to send as that value.
export function resolveFromEmail(user: SenderUser | null | undefined, value: string | null | undefined): string | null {
  const choices = availableSendersFor(user)
  if (!value) return choices[0]?.email ?? null // default to the first allowed sender
  const match = choices.find((c) => c.value === value)
  return match ? match.email : null
}

// Convenience: does this user have any way to send email?
export function canSendEmail(user: SenderUser | null | undefined): boolean {
  return availableSendersFor(user).length > 0
}

export type { EmailSender }
