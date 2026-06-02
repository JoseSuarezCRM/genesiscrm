"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { sendEmail } from "@/lib/graph-mailer"
import { BroadcastStatus, OutreachStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"

export interface BroadcastFilters {
  recipientTypes: ("PATIENT" | "PROVIDER")[]
  // Patient filters
  patientStatuses?: string[]
  appointmentDateFrom?: string
  appointmentDateTo?: string
  practiceIds?: string[]
  providerIds?: string[]
  insuranceProviders?: string[]
  // Provider filters
  providerPracticeIds?: string[]
}

async function requireAuth() {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  return session
}

// Preview recipients matching the given filters (no DB writes)
export async function previewBroadcastRecipients(filters: BroadcastFilters) {
  await requireAuth()

  const recipients: { email: string; name: string; type: "PATIENT" | "PROVIDER" }[] = []

  if (filters.recipientTypes.includes("PATIENT")) {
    const where: Record<string, unknown> = {
      patientEmail: { not: null },
    }
    if (filters.patientStatuses?.length) where.status = { in: filters.patientStatuses }
    if (filters.practiceIds?.length) where.referringPracticeId = { in: filters.practiceIds }
    if (filters.providerIds?.length) where.referringDoctorId = { in: filters.providerIds }
    if (filters.insuranceProviders?.length) where.insuranceProvider = { in: filters.insuranceProviders }
    if (filters.appointmentDateFrom || filters.appointmentDateTo) {
      where.appointmentDate = {}
      if (filters.appointmentDateFrom) (where.appointmentDate as Record<string, unknown>).gte = new Date(filters.appointmentDateFrom)
      if (filters.appointmentDateTo) (where.appointmentDate as Record<string, unknown>).lte = new Date(filters.appointmentDateTo)
    }

    const referrals = await prisma.referral.findMany({
      where,
      select: { patientFirstName: true, patientLastName: true, patientEmail: true },
      distinct: ["patientEmail"],
    })

    for (const r of referrals) {
      if (r.patientEmail) {
        recipients.push({
          email: r.patientEmail,
          name: `${r.patientFirstName} ${r.patientLastName}`,
          type: "PATIENT",
        })
      }
    }
  }

  if (filters.recipientTypes.includes("PROVIDER")) {
    const where: Record<string, unknown> = { email: { not: null } }
    if (filters.providerPracticeIds?.length) where.practiceId = { in: filters.providerPracticeIds }

    const providers = await prisma.referringDoctor.findMany({
      where,
      select: { name: true, email: true },
    })

    for (const p of providers) {
      if (p.email) {
        recipients.push({ email: p.email, name: p.name, type: "PROVIDER" })
      }
    }
  }

  // Deduplicate by email
  const seen = new Set<string>()
  return recipients.filter((r) => {
    if (seen.has(r.email)) return false
    seen.add(r.email)
    return true
  })
}

// Create and optionally send or schedule a broadcast
export async function createBroadcast(data: {
  subject: string
  body: string
  fromSender?: string
  filters: BroadcastFilters
  scheduledAt?: string | null
}) {
  const session = await requireAuth()

  const recipients = await previewBroadcastRecipients(data.filters)
  if (recipients.length === 0) return { error: "No recipients match the selected filters" }

  const status = data.scheduledAt ? BroadcastStatus.SCHEDULED : BroadcastStatus.SENDING

  const broadcast = await (prisma as any).emailBroadcast.create({
    data: {
      subject: data.subject,
      body: data.body,
      fromSender: data.fromSender || "referrals",
      status,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      recipientCount: recipients.length,
      filters: data.filters as object,
      createdById: session.user.id,
      recipients: {
        create: recipients.map((r) => ({
          email: r.email,
          name: r.name,
          type: r.type,
          status: OutreachStatus.SENT, // will be updated after actual send
        })),
      },
    },
  })

  revalidatePath("/broadcasts")
  // Return the id so the client can call /api/broadcasts/send to trigger actual sending
  return { success: true, id: broadcast.id, sendNow: !data.scheduledAt }
}

// Send all pending recipients for a broadcast
export async function sendBroadcastEmails(broadcastId: string) {
  const broadcast = await prisma.emailBroadcast.findUnique({
    where: { id: broadcastId },
    include: { recipients: true },
  })
  if (!broadcast) return

  await prisma.emailBroadcast.update({
    where: { id: broadcastId },
    data: { status: BroadcastStatus.SENDING },
  })

  let sentCount = 0
  let failedCount = 0

  for (const recipient of broadcast.recipients) {
    const result = await sendEmail(recipient.email, broadcast.subject, broadcast.body.replace(/\n/g, "<br>"), { sender: (broadcast as any).fromSender || "referrals" })
    await prisma.emailBroadcastRecipient.update({
      where: { id: recipient.id },
      data: {
        status: result.success ? OutreachStatus.SENT : OutreachStatus.FAILED,
        error: result.error ?? null,
        sentAt: result.success ? new Date() : null,
      },
    })
    if (result.success) sentCount++
    else failedCount++
  }

  await prisma.emailBroadcast.update({
    where: { id: broadcastId },
    data: {
      status: BroadcastStatus.SENT,
      sentAt: new Date(),
      sentCount,
      failedCount,
    },
  })
}

export async function listBroadcasts() {
  await requireAuth()
  return prisma.emailBroadcast.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      subject: true,
      status: true,
      scheduledAt: true,
      sentAt: true,
      recipientCount: true,
      sentCount: true,
      failedCount: true,
      createdAt: true,
      createdBy: { select: { name: true } },
    },
  })
}

export async function deleteBroadcast(id: string) {
  await requireAuth()
  await prisma.emailBroadcast.delete({ where: { id } })
  revalidatePath("/broadcasts")
}

// Called by cron — sends all due scheduled broadcasts
export async function sendScheduledBroadcasts() {
  const due = await prisma.emailBroadcast.findMany({
    where: {
      status: BroadcastStatus.SCHEDULED,
      scheduledAt: { lte: new Date() },
    },
    select: { id: true },
  })
  await Promise.all(due.map((b) => sendBroadcastEmails(b.id)))
}
