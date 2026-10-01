"use server"

import { requireAccess } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { userCanLevel, type AccessLevel } from "@/lib/permissions"
import { revalidatePath } from "next/cache"
import twilio from "twilio"

function getClient() {
  return twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
}

/** Normalise to E.164. Handles 10-digit US numbers. */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`
  return `+${digits}`
}

/**
 * The signed-in user, if they have `level` on SMS. Every action here checks it
 * up front: the inbox page is gated, but a server action can be called
 * directly, so the page's check protects nothing on its own.
 */
async function smsUser(level: AccessLevel) {
  const session = await auth()
  if (!session?.user || !userCanLevel(session.user as any, "SMS", level)) return null
  return session
}

// ── Thread management ────────────────────────────────────────────────────────

export async function getThreads() {
  if (!(await smsUser("VIEW"))) return []

  return prisma.smsThread.findMany({
    orderBy: { lastMessageAt: "desc" },
    include: {
      referral: { select: { id: true, patientFirstName: true, patientLastName: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { sentBy: { select: { name: true, email: true } } },
      },
    },
  })
}

export async function getMessages(threadId: string) {
  if (!(await smsUser("VIEW"))) return []

  return prisma.smsMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    include: { sentBy: { select: { name: true, email: true } } },
  })
}

export async function createThread(
  phone: string,
  contactName: string,
  referralId?: string
): Promise<{ threadId: string } | { error: string }> {
  if (!(await smsUser("EDIT"))) return { error: "You don't have permission to send SMS." }

  const normalized = normalizePhone(phone)

  // Re-use existing thread for this phone number
  const existing = await prisma.smsThread.findFirst({ where: { phone: normalized } })
  if (existing) return { threadId: existing.id }

  const thread = await prisma.smsThread.create({
    data: {
      phone: normalized,
      contactName: contactName.trim() || null,
      referralId: referralId || null,
    },
  })

  revalidatePath("/messages")
  return { threadId: thread.id }
}

export async function markThreadRead(threadId: string) {
  await requireAccess("SMS", "EDIT")
  const session = await auth()
  if (!session?.user) return

  await prisma.smsThread.update({
    where: { id: threadId },
    data: { unreadCount: 0 },
  })

  revalidatePath("/messages")
}

// ── Send outbound SMS ────────────────────────────────────────────────────────

export async function sendSms(
  threadId: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  const session = await smsUser("EDIT")
  if (!session) return { success: false, error: "You don't have permission to send SMS." }
  if (!body.trim()) return { success: false, error: "Message cannot be empty." }

  const thread = await prisma.smsThread.findUnique({ where: { id: threadId } })
  if (!thread) return { success: false, error: "Thread not found." }

  try {
    const msg = await getClient().messages.create({
      body: body.trim(),
      from: process.env.TWILIO_PHONE!,
      to: thread.phone,
    })

    await prisma.$transaction([
      prisma.smsMessage.create({
        data: {
          threadId,
          body: body.trim(),
          direction: "OUTBOUND",
          status: msg.status,
          twilioSid: msg.sid,
          sentById: (session.user as any).id,
        },
      }),
      prisma.smsThread.update({
        where: { id: threadId },
        data: { lastMessageAt: new Date() },
      }),
    ])

    revalidatePath("/messages")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Failed to send SMS." }
  }
}

export async function linkThreadToReferral(threadId: string, referralId: string | null) {
  if (!(await smsUser("EDIT"))) return { error: "You don't have permission to change SMS threads." }

  await prisma.smsThread.update({
    where: { id: threadId },
    data: { referralId: referralId || null },
  })

  revalidatePath("/messages")
  return { success: true }
}

export async function searchReferralsForSms(query: string) {
  // Returns patients' names, MRNs and phones: needs Referrals access as well.
  const session = await smsUser("EDIT")
  if (!session || !userCanLevel(session.user as any, "REFERRALS", "VIEW")) return []

  const q = query.trim()
  if (!q) return []

  return prisma.referral.findMany({
    where: {
      OR: [
        { patientFirstName: { contains: q, mode: "insensitive" } },
        { patientLastName: { contains: q, mode: "insensitive" } },
        { patientMrn: { contains: q, mode: "insensitive" } },
        { patientPhone: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      patientFirstName: true,
      patientLastName: true,
      patientMrn: true,
      patientPhone: true,
      status: true,
      referralDate: true,
    },
    orderBy: { referralDate: "desc" },
    take: 15,
  })
}

export async function deleteThread(threadId: string) {
  await requireAccess("SMS", "EDIT")
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") return { error: "Unauthorized" }

  await prisma.smsThread.delete({ where: { id: threadId } })
  revalidatePath("/messages")
  return { success: true }
}
