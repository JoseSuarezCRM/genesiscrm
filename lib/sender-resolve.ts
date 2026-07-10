// Resolve a workflow/sequence "sender" setting to a concrete from-address.
// Server-only (uses Prisma). Shared by the automation engine and the sequence
// cron so "record owner" / integrated-address senders behave identically.

import { prisma } from "@/lib/prisma"
import type { EmailSender } from "@/lib/graph-mailer"

export interface ResolvedSender { fromEmail?: string; senderKey?: EmailSender }

// The email of a record's owner: the assigned user, else the creator.
export async function recordOwnerEmail(
  record: Record<string, unknown> | null | undefined,
  referralId: string | null,
): Promise<string | null> {
  if (referralId) {
    const r = await prisma.referral.findUnique({
      where: { id: referralId },
      select: { assignedTo: { select: { email: true } }, createdBy: { select: { email: true } } },
    })
    return r?.assignedTo?.email ?? r?.createdBy?.email ?? null
  }
  const uid = (record?.assignedToId ?? record?.createdById) as string | undefined
  if (uid) {
    const u = await prisma.user.findUnique({ where: { id: uid }, select: { email: true } })
    return u?.email ?? null
  }
  return null
}

//  • "record_owner" → the record owner's email
//  • an "@" address  → that integrated mailbox
//  • a legacy key    → a shared org mailbox
export async function resolveWorkflowSender(
  value: unknown,
  record: Record<string, unknown> | null | undefined,
  referralId: string | null,
): Promise<ResolvedSender> {
  const v = (typeof value === "string" && value.trim()) || "referrals"
  if (v === "record_owner") {
    const email = await recordOwnerEmail(record, referralId)
    return email ? { fromEmail: email } : { senderKey: "referrals" }
  }
  if (v.includes("@")) return { fromEmail: v }
  return { senderKey: v as EmailSender }
}
