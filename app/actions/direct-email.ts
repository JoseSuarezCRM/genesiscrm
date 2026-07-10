"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { sendEmail, type EmailAttachment } from "@/lib/graph-mailer"
import { resolveMyFromEmail } from "@/app/actions/account"
import { revalidatePath } from "next/cache"
import { substitutePersonalization, splitName } from "@/lib/personalization"
import { format } from "date-fns"

// Body may already be HTML (from the rich text editor); only convert newlines for legacy plain text.
function toHtml(body: string) {
  return /<[a-z][\s\S]*>/i.test(body) ? body : body.replace(/\n/g, "<br>")
}

// Look up a recipient email and build a personalization data map.
// Tries provider (ReferringDoctor) first, then patient (Referral). Unknown → {}.
async function resolveRecipientData(email: string): Promise<Record<string, string>> {
  const provider = await prisma.referringDoctor.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      name: true, email: true, title: true, specialty: true, npi: true, phone: true,
      practice: { select: { name: true } },
      locations: { select: { location: { select: { name: true } } }, take: 1 },
    },
  })
  if (provider) {
    const { firstName, lastName } = splitName(provider.name)
    return {
      firstName, lastName, fullName: provider.name, email: provider.email ?? email,
      title: provider.title ?? "", specialty: provider.specialty ?? "",
      npi: provider.npi ?? "", phone: provider.phone ?? "",
      practiceName: provider.practice?.name ?? "",
      location: provider.locations[0]?.location?.name ?? "",
    }
  }

  const referral = await prisma.referral.findFirst({
    where: { patientEmail: { equals: email, mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
    select: {
      patientFirstName: true, patientLastName: true, patientEmail: true,
      appointmentDate: true, insuranceProvider: true,
      referringPractice: { select: { name: true } },
      referringDoctor: { select: { name: true } },
    },
  })
  if (referral) {
    return {
      firstName: referral.patientFirstName ?? "",
      lastName: referral.patientLastName ?? "",
      fullName: `${referral.patientFirstName ?? ""} ${referral.patientLastName ?? ""}`.trim(),
      email: referral.patientEmail ?? email,
      appointmentDate: referral.appointmentDate ? format(referral.appointmentDate, "MMMM d, yyyy") : "",
      insurance: referral.insuranceProvider ?? "",
      practiceName: referral.referringPractice?.name ?? "",
      providerName: referral.referringDoctor?.name ?? "",
    }
  }

  return { email }
}

export async function sendDirectEmail(input: {
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  body: string
  sender?: string
  attachments?: EmailAttachment[]
}): Promise<{ success: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { success: false, error: "Unauthorized" }

  if (input.to.length === 0) return { success: false, error: "At least one recipient required." }
  if (!input.subject.trim()) return { success: false, error: "Subject is required." }
  if (!input.body.trim()) return { success: false, error: "Body is required." }

  const fromEmail = await resolveMyFromEmail(input.sender)
  if (!fromEmail) return { success: false, error: "You don't have a sending address. Enable it in My Account, or ask an admin." }

  const hasTokens = /\{\{\s*\w+\s*\}\}/.test(input.subject) || /\{\{\s*\w+\s*\}\}/.test(input.body)

  let result: { success: boolean; error?: string }

  if (hasTokens) {
    // Personalize per recipient: send individually with each recipient's data.
    // CC/BCC ride along on the first send only so they aren't copied repeatedly.
    let anySuccess = false
    let firstError: string | undefined
    for (let i = 0; i < input.to.length; i++) {
      const recipient = input.to[i]
      const data = await resolveRecipientData(recipient)
      const subject = substitutePersonalization(input.subject, data)
      const body = substitutePersonalization(input.body, data)
      const r = await sendEmail(recipient, subject, toHtml(body), {
        cc: i === 0 ? input.cc : [],
        bcc: i === 0 ? input.bcc : [],
        fromEmail,
        attachments: input.attachments,
      })
      if (r.success) anySuccess = true
      else if (!firstError) firstError = r.error
    }
    result = { success: anySuccess, error: anySuccess ? undefined : firstError }
  } else {
    result = await sendEmail(input.to, input.subject, toHtml(input.body), {
      cc: input.cc,
      bcc: input.bcc,
      fromEmail,
      attachments: input.attachments,
    })
  }

  await prisma.directEmail.create({
    data: {
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      body: input.body,
      success: result.success,
      error: result.error ?? null,
      sentById: session.user.id,
    },
  })

  revalidatePath("/broadcasts")
  return result
}

export async function listDirectEmails() {
  const session = await auth()
  if (!session?.user) return []

  return prisma.directEmail.findMany({
    orderBy: { sentAt: "desc" },
    take: 100,
    include: { sentBy: { select: { name: true, email: true } } },
  })
}
