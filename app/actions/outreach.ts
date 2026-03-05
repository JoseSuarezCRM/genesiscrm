"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { createAuditLog } from "@/lib/audit"
import { sendSMS } from "@/lib/twilio"
import { sendEmail } from "@/lib/resend-client"
import {
  AuditAction,
  OutreachChannel,
  OutreachTrigger,
  OutreachStatus,
} from "@prisma/client"
import { format } from "date-fns"

const PRACTICE_NAME = process.env.PRACTICE_NAME ?? "Genesis Ortho"
const PRACTICE_PHONE = process.env.PRACTICE_PHONE ?? "our office"

function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "")
}

type ManualChannel = "SMS" | "EMAIL" | "BOTH"

export async function sendManualOutreach(
  referralId: string,
  channel: ManualChannel,
  message: string
): Promise<{ success?: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }

  const referral = await prisma.referral.findUnique({
    where: { id: referralId },
    select: {
      patientFirstName: true,
      patientPhone: true,
      patientEmail: true,
    },
  })

  if (!referral) return { error: "Referral not found" }

  const results: { success: boolean; channel: OutreachChannel; recipient: string; error?: string }[] = []

  if ((channel === "SMS" || channel === "BOTH") && referral.patientPhone) {
    const result = await sendSMS(referral.patientPhone, message)
    results.push({ ...result, channel: OutreachChannel.SMS, recipient: referral.patientPhone })
  }

  if ((channel === "EMAIL" || channel === "BOTH") && referral.patientEmail) {
    const result = await sendEmail(referral.patientEmail, "Message from Genesis Ortho", `<p>${message}</p>`)
    results.push({ ...result, channel: OutreachChannel.EMAIL, recipient: referral.patientEmail })
  }

  if (results.length === 0) {
    return { error: "Patient has no contact information for the selected channel" }
  }

  // Save a record for each message sent
  for (const r of results) {
    await prisma.outreachMessage.create({
      data: {
        referralId,
        channel: r.channel,
        trigger: OutreachTrigger.MANUAL,
        status: r.success ? OutreachStatus.SENT : OutreachStatus.FAILED,
        recipient: r.recipient,
        message,
        error: r.error ?? null,
        sentById: session.user.id,
      },
    })
  }

  await createAuditLog({
    userId: session.user.id,
    action: AuditAction.OUTREACH_SENT,
    resourceType: "Referral",
    resourceId: referralId,
    metadata: { channel, trigger: "MANUAL", count: results.length },
  })

  const anyFailed = results.some((r) => !r.success)
  if (anyFailed && results.every((r) => !r.success)) {
    return { error: "Failed to send message. Please try again." }
  }

  return { success: true }
}

// Internal — called by status change actions and cron job
export async function triggerAutoOutreach(
  referralId: string,
  trigger: OutreachTrigger
): Promise<void> {
  try {
    const referral = await prisma.referral.findUnique({
      where: { id: referralId },
      select: {
        patientFirstName: true,
        patientPhone: true,
        patientEmail: true,
        appointmentDate: true,
      },
    })

    if (!referral) return
    if (!referral.patientPhone && !referral.patientEmail) return

    const dateStr = referral.appointmentDate
      ? format(referral.appointmentDate, "MMMM d, yyyy")
      : ""

    const vars = {
      firstName: referral.patientFirstName,
      appointmentDate: dateStr,
      practiceName: PRACTICE_NAME,
      practicePhone: PRACTICE_PHONE,
    }

    // Load templates from DB — skip channel if no active template found
    const [smsTemplate, emailTemplate] = await Promise.all([
      referral.patientPhone
        ? prisma.outreachTemplate.findUnique({
            where: { trigger_channel: { trigger, channel: OutreachChannel.SMS } },
          })
        : null,
      referral.patientEmail
        ? prisma.outreachTemplate.findUnique({
            where: { trigger_channel: { trigger, channel: OutreachChannel.EMAIL } },
          })
        : null,
    ])

    const sends: Promise<void>[] = []

    if (smsTemplate?.isActive && referral.patientPhone) {
      const smsBody = renderTemplate(smsTemplate.body, vars)
      sends.push(
        sendSMS(referral.patientPhone, smsBody).then(async (result) => {
          await prisma.outreachMessage.create({
            data: {
              referralId,
              channel: OutreachChannel.SMS,
              trigger,
              status: result.success ? OutreachStatus.SENT : OutreachStatus.FAILED,
              recipient: referral.patientPhone!,
              message: smsBody,
              error: result.error ?? null,
            },
          })
        })
      )
    }

    if (emailTemplate?.isActive && referral.patientEmail) {
      const emailSubject = renderTemplate(emailTemplate.subject ?? "", vars)
      const emailHtml = renderTemplate(emailTemplate.body, vars)
      sends.push(
        sendEmail(referral.patientEmail, emailSubject, emailHtml).then(async (result) => {
          await prisma.outreachMessage.create({
            data: {
              referralId,
              channel: OutreachChannel.EMAIL,
              trigger,
              status: result.success ? OutreachStatus.SENT : OutreachStatus.FAILED,
              recipient: referral.patientEmail!,
              message: emailSubject,
              error: result.error ?? null,
            },
          })
        })
      )
    }

    await Promise.all(sends)

    await createAuditLog({
      action: AuditAction.OUTREACH_SENT,
      resourceType: "Referral",
      resourceId: referralId,
      metadata: { trigger, channels: ["SMS", "EMAIL"].filter((c) =>
        c === "SMS" ? !!referral.patientPhone : !!referral.patientEmail
      )},
    })
  } catch (err) {
    // Auto outreach must never crash the main action
    console.error("[OUTREACH] Auto trigger failed:", err)
  }
}
