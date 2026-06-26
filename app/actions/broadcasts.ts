"use server"

import { requireAccess } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { sendEmail, type EmailAttachment } from "@/lib/graph-mailer"
import { BroadcastStatus, OutreachStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { substitutePersonalization, splitName } from "@/lib/personalization"
import { format } from "date-fns"

// Body may already be HTML (rich text editor); only convert newlines for legacy plain text.
function toHtml(body: string) {
  return /<[a-z][\s\S]*>/i.test(body) ? body : body.replace(/\n/g, "<br>")
}

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

export interface BroadcastRecipient {
  email: string
  name: string
  type: "PATIENT" | "PROVIDER"
  data: Record<string, string>
}

// Preview recipients matching the given filters (no DB writes)
export async function previewBroadcastRecipients(filters: BroadcastFilters): Promise<BroadcastRecipient[]> {
  await requireAuth()

  const recipients: BroadcastRecipient[] = []

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
      select: {
        patientFirstName: true, patientLastName: true, patientEmail: true,
        appointmentDate: true, insuranceProvider: true,
        referringPractice: { select: { name: true } },
        referringDoctor: { select: { name: true } },
      },
      distinct: ["patientEmail"],
    })

    for (const r of referrals) {
      if (r.patientEmail) {
        recipients.push({
          email: r.patientEmail,
          name: `${r.patientFirstName} ${r.patientLastName}`,
          type: "PATIENT",
          data: {
            firstName: r.patientFirstName ?? "",
            lastName: r.patientLastName ?? "",
            fullName: `${r.patientFirstName} ${r.patientLastName}`.trim(),
            email: r.patientEmail,
            appointmentDate: r.appointmentDate ? format(r.appointmentDate, "MMMM d, yyyy") : "",
            insurance: r.insuranceProvider ?? "",
            practiceName: r.referringPractice?.name ?? "",
            providerName: r.referringDoctor?.name ?? "",
          },
        })
      }
    }
  }

  if (filters.recipientTypes.includes("PROVIDER")) {
    const where: Record<string, unknown> = { email: { not: null } }
    if (filters.providerPracticeIds?.length) where.practiceId = { in: filters.providerPracticeIds }

    const providers = await prisma.referringDoctor.findMany({
      where,
      select: {
        name: true, email: true, title: true, specialty: true, npi: true, phone: true,
        practice: { select: { name: true } },
        locations: { select: { location: { select: { name: true } } }, take: 1 },
      },
    })

    for (const p of providers) {
      if (p.email) {
        const { firstName, lastName } = splitName(p.name)
        recipients.push({
          email: p.email,
          name: p.name,
          type: "PROVIDER",
          data: {
            firstName,
            lastName,
            fullName: p.name,
            email: p.email,
            title: p.title ?? "",
            specialty: p.specialty ?? "",
            npi: p.npi ?? "",
            phone: p.phone ?? "",
            practiceName: p.practice?.name ?? "",
            location: p.locations[0]?.location?.name ?? "",
          },
        })
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
  attachments?: EmailAttachment[]
  filters: BroadcastFilters
  scheduledAt?: string | null
}) {
  await requireAccess("BROADCASTS", "EDIT")
  const session = await requireAuth()

  const recipients = await previewBroadcastRecipients(data.filters)
  if (recipients.length === 0) return { error: "No recipients match the selected filters" }

  const status = data.scheduledAt ? BroadcastStatus.SCHEDULED : BroadcastStatus.SENDING

  const broadcast = await (prisma as any).emailBroadcast.create({
    data: {
      subject: data.subject,
      body: data.body,
      fromSender: data.fromSender || "referrals",
      attachments: (data.attachments ?? []) as object,
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
          data: r.data as object,
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
  await requireAccess("BROADCASTS", "EDIT")
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

  const broadcastAttachments = ((broadcast as any).attachments ?? []) as EmailAttachment[]
  for (const recipient of broadcast.recipients) {
    const data = ((recipient as any).data ?? {}) as Record<string, string>
    const subject = substitutePersonalization(broadcast.subject, data)
    const body = substitutePersonalization(broadcast.body, data)
    const result = await sendEmail(recipient.email, subject, toHtml(body), {
      sender: (broadcast as any).fromSender || "referrals",
      attachments: broadcastAttachments,
    })
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
  await requireAccess("BROADCASTS", "EDIT")
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
