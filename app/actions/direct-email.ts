"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { sendEmail } from "@/lib/graph-mailer"
import { revalidatePath } from "next/cache"

export async function sendDirectEmail(input: {
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  body: string
}): Promise<{ success: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { success: false, error: "Unauthorized" }

  if (input.to.length === 0) return { success: false, error: "At least one recipient required." }
  if (!input.subject.trim()) return { success: false, error: "Subject is required." }
  if (!input.body.trim()) return { success: false, error: "Body is required." }

  // Build HTML with CC/BCC headers visible in body isn't needed — Graph handles headers
  const html = input.body.replace(/\n/g, "<br>")

  // Send to all To recipients (Graph API handles CC/BCC natively via sendMail)
  const result = await sendEmailWithCcBcc(input.to, input.cc, input.bcc, input.subject, html)

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

// ── Graph API send with CC/BCC support ───────────────────────────────────────

async function sendEmailWithCcBcc(
  to: string[],
  cc: string[],
  bcc: string[],
  subject: string,
  html: string
): Promise<{ success: boolean; error?: string }> {
  const tenantId = process.env.MS_TENANT_ID
  const clientId = process.env.MS_CLIENT_ID
  const clientSecret = process.env.MS_CLIENT_SECRET
  const fromEmail = process.env.MS_FROM_EMAIL ?? "Referrals@genesisortho.com"

  if (!tenantId || !clientId || !clientSecret) {
    return { success: false, error: "Microsoft Graph email is not configured." }
  }

  try {
    // Get token
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
          scope: "https://graph.microsoft.com/.default",
        }),
      }
    )
    if (!tokenRes.ok) {
      const t = await tokenRes.text()
      return { success: false, error: `Token error: ${t}` }
    }
    const { access_token } = await tokenRes.json() as { access_token: string }

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromEmail)}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            subject,
            body: { contentType: "HTML", content: html },
            from: { emailAddress: { address: fromEmail, name: "Genesis Ortho CRM" } },
            toRecipients:  to.map(a => ({ emailAddress: { address: a } })),
            ccRecipients:  cc.map(a => ({ emailAddress: { address: a } })),
            bccRecipients: bcc.map(a => ({ emailAddress: { address: a } })),
          },
          saveToSentItems: true,
        }),
      }
    )

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const msg = (body as any)?.error?.message ?? `HTTP ${res.status}`
      return { success: false, error: msg }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
