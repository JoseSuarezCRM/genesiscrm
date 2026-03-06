import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { checkRateLimit } from "@/lib/rate-limit"
import { sendEmail } from "@/lib/resend-client"

const schema = z.object({
  // Provider (all required)
  providerName: z.string().min(1),
  providerOrg: z.string().min(1),
  providerNpi: z.string().min(1),
  providerEmail: z.string().email(),
  // Patient (all required)
  patientFirstName: z.string().min(1),
  patientLastName: z.string().min(1),
  patientDob: z.string().min(1),
  patientPhone: z.string().min(1),
  reason: z.string().min(1),
})

export async function POST(req: NextRequest) {
  // Rate limit by IP — max 10 submissions per 15 min
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown"
  const rl = checkRateLimit(`web-referral:${ip}`)
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many submissions. Please try again later." }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 422 })
  }

  const { providerName, providerOrg, providerNpi, providerEmail, patientFirstName, patientLastName, patientDob, patientPhone, reason } = parsed.data

  // Build structured notes combining reason + provider details
  const notesParts = [
    `Reason for Referral: ${reason}`,
    `Organization: ${providerOrg}`,
    `NPI: ${providerNpi}`,
    `Provider Email: ${providerEmail}`,
    "(Submitted via web referral form)",
  ]

  await prisma.referral.create({
    data: {
      patientFirstName,
      patientLastName,
      patientDob: new Date(patientDob),
      patientPhone,
      referringDoctorName: providerName,
      notes: notesParts.join("\n"),
      // createdById is null — web submission, no logged-in user
    },
  })

  // Notify users who have opted in to embed form notifications
  const notifyUsers = await prisma.user.findMany({
    where: { notifyOnEmbedReferral: true, isActive: true },
    select: { email: true, name: true },
  })

  if (notifyUsers.length > 0) {
    const subject = `New Web Referral: ${patientFirstName} ${patientLastName}`
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#1e293b;">New Referral Submitted</h2>
        <p style="color:#475569;">A new referral was submitted via the web referral form.</p>

        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          <tr><td colspan="2" style="padding:8px 0;border-bottom:2px solid #e2e8f0;font-weight:600;color:#1e293b;">Patient</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;width:140px;">Name</td><td style="padding:6px 0;color:#1e293b;">${patientFirstName} ${patientLastName}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Date of Birth</td><td style="padding:6px 0;color:#1e293b;">${patientDob}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Phone</td><td style="padding:6px 0;color:#1e293b;">${patientPhone}</td></tr>

          <tr><td colspan="2" style="padding:12px 0 8px;border-bottom:2px solid #e2e8f0;font-weight:600;color:#1e293b;">Referring Provider</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Name</td><td style="padding:6px 0;color:#1e293b;">${providerName}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Organization</td><td style="padding:6px 0;color:#1e293b;">${providerOrg}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">NPI</td><td style="padding:6px 0;color:#1e293b;">${providerNpi}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Email</td><td style="padding:6px 0;color:#1e293b;">${providerEmail}</td></tr>

          <tr><td colspan="2" style="padding:12px 0 8px;border-bottom:2px solid #e2e8f0;font-weight:600;color:#1e293b;">Reason for Referral</td></tr>
          <tr><td colspan="2" style="padding:6px 0;color:#1e293b;">${reason}</td></tr>
        </table>
      </div>
    `
    await Promise.all(notifyUsers.map((u) => sendEmail(u.email, subject, html)))
  }

  return NextResponse.json({ success: true })
}
