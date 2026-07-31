import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { authenticateApiRequest, apiError } from "@/lib/api-tokens"
import { serializeReferral } from "@/lib/api-serializers"

const INCLUDE = {
  referringPractice: { select: { id: true, name: true } },
  referringDoctor: { select: { id: true, name: true } },
}

// GET /api/v1/referrals/:id
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const a = await authenticateApiRequest(req, "referrals:read")
  if ("error" in a) return a.error
  const r = await prisma.referral.findUnique({ where: { id: params.id }, include: INCLUDE })
  if (!r) return apiError(404, "Referral not found.", "not_found")
  return NextResponse.json({ data: serializeReferral(r) })
}

const UpdateSchema = z.object({
  patientFirstName: z.string().min(1).optional(),
  patientLastName: z.string().min(1).optional(),
  patientPhone: z.string().nullable().optional(),
  patientEmail: z.string().email().nullable().optional().or(z.literal("")),
  patientDob: z.string().nullable().optional(),
  patientMrn: z.string().nullable().optional(),
  status: z.enum(["NEW", "CONTACTED", "SCHEDULED", "COMPLETED", "NO_SHOW"]).optional(),
  notes: z.string().nullable().optional(),
  insuranceProvider: z.string().nullable().optional(),
  appointmentDate: z.string().nullable().optional(),
})

// PATCH /api/v1/referrals/:id  → partial update
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const a = await authenticateApiRequest(req, "referrals:write")
  if ("error" in a) return a.error

  let body: unknown
  try { body = await req.json() } catch { return apiError(400, "Invalid JSON body.") }
  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) return apiError(422, "Validation failed.", "validation_error")
  const d = parsed.data

  const exists = await prisma.referral.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!exists) return apiError(404, "Referral not found.", "not_found")

  const data: Record<string, any> = {}
  if (d.patientFirstName !== undefined) data.patientFirstName = d.patientFirstName
  if (d.patientLastName !== undefined) data.patientLastName = d.patientLastName
  if (d.patientPhone !== undefined) data.patientPhone = d.patientPhone || null
  if (d.patientEmail !== undefined) data.patientEmail = d.patientEmail || null
  if (d.patientDob !== undefined) data.patientDob = d.patientDob ? new Date(d.patientDob) : null
  if (d.patientMrn !== undefined) data.patientMrn = d.patientMrn || null
  if (d.status !== undefined) data.status = d.status
  if (d.notes !== undefined) data.notes = d.notes || null
  if (d.insuranceProvider !== undefined) data.insuranceProvider = d.insuranceProvider || null
  if (d.appointmentDate !== undefined) data.appointmentDate = d.appointmentDate ? new Date(d.appointmentDate) : null

  const updated = await prisma.referral.update({ where: { id: params.id }, data, include: INCLUDE })
  return NextResponse.json({ data: serializeReferral(updated) })
}
