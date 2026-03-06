import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { checkRateLimit } from "@/lib/rate-limit"

const schema = z.object({
  // Provider
  providerName: z.string().min(1),
  providerOrg: z.string().optional(),
  providerNpi: z.string().optional(),
  providerEmail: z.string().email().optional().or(z.literal("")),
  // Patient
  patientFirstName: z.string().min(1),
  patientLastName: z.string().min(1),
  patientDob: z.string().optional(),
  patientPhone: z.string().optional(),
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
  const notesParts = [`Reason for Referral: ${reason}`]
  if (providerOrg) notesParts.push(`Organization: ${providerOrg}`)
  if (providerNpi) notesParts.push(`NPI: ${providerNpi}`)
  if (providerEmail) notesParts.push(`Provider Email: ${providerEmail}`)
  notesParts.push("(Submitted via web referral form)")

  await prisma.referral.create({
    data: {
      patientFirstName,
      patientLastName,
      patientDob: patientDob ? new Date(patientDob) : null,
      patientPhone: patientPhone || null,
      referringDoctorName: providerName,
      notes: notesParts.join("\n"),
      // createdById is null — web submission, no logged-in user
    },
  })

  return NextResponse.json({ success: true })
}
