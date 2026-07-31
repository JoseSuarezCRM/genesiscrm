import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { authenticateApiRequest, apiError } from "@/lib/api-tokens"
import { serializeReferral } from "@/lib/api-serializers"
import { resolveOrCreatePractice } from "@/app/actions/org-rules"
import { resolveOrCreateProvider } from "@/lib/provider-resolve"

const INCLUDE = {
  referringPractice: { select: { id: true, name: true } },
  referringDoctor: { select: { id: true, name: true } },
}

// GET /api/v1/referrals?limit=&cursor=&status=  → paginated list
export async function GET(req: Request) {
  const a = await authenticateApiRequest(req, "referrals:read")
  if ("error" in a) return a.error

  const url = new URL(req.url)
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)))
  const status = url.searchParams.get("status") ?? undefined
  const cursor = url.searchParams.get("cursor") ?? undefined

  const rows = await prisma.referral.findMany({
    where: status ? { status: status as any } : {},
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: "desc" },
    include: INCLUDE,
  })
  const hasMore = rows.length > limit
  return NextResponse.json({
    data: rows.slice(0, limit).map(serializeReferral),
    nextCursor: hasMore ? rows[limit - 1].id : null,
  })
}

const CreateSchema = z.object({
  patientFirstName: z.string().min(1),
  patientLastName: z.string().min(1),
  patientPhone: z.string().optional(),
  patientEmail: z.string().email().optional().or(z.literal("")),
  patientDob: z.string().optional(),
  patientMrn: z.string().optional(),
  status: z.enum(["NEW", "CONTACTED", "SCHEDULED", "COMPLETED", "NO_SHOW"]).optional(),
  notes: z.string().optional(),
  insuranceProvider: z.string().optional(),
  referringPracticeId: z.string().optional(),
  practiceName: z.string().optional(),
  referringDoctorId: z.string().optional(),
  providerName: z.string().optional(),
  appointmentDate: z.string().optional(),
})

// POST /api/v1/referrals  → create a referral
export async function POST(req: Request) {
  const a = await authenticateApiRequest(req, "referrals:write")
  if ("error" in a) return a.error

  let body: unknown
  try { body = await req.json() } catch { return apiError(400, "Invalid JSON body.") }
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return apiError(422, "Validation failed.", "validation_error")
  const d = parsed.data

  // Resolve practice/provider by id, or find-or-create by name.
  let practiceId = d.referringPracticeId ?? null
  let locationId: string | null = null
  if (!practiceId && d.practiceName) {
    const r = await resolveOrCreatePractice(d.practiceName)
    practiceId = r.practiceId; locationId = r.locationId ?? null
  }
  let doctorId = d.referringDoctorId ?? null
  if (!doctorId && d.providerName && practiceId) {
    doctorId = await resolveOrCreateProvider({ practiceId, name: d.providerName, locationId })
  }

  const created = await prisma.referral.create({
    data: {
      patientFirstName: d.patientFirstName,
      patientLastName: d.patientLastName,
      patientPhone: d.patientPhone || null,
      patientEmail: d.patientEmail || null,
      patientDob: d.patientDob ? new Date(d.patientDob) : null,
      patientMrn: d.patientMrn || null,
      status: (d.status as any) ?? "NEW",
      notes: d.notes || null,
      insuranceProvider: d.insuranceProvider || null,
      referringPracticeId: practiceId,
      referringLocationId: locationId,
      referringDoctorId: doctorId,
      referringDoctorName: d.providerName || null,
      appointmentDate: d.appointmentDate ? new Date(d.appointmentDate) : null,
    },
    include: INCLUDE,
  })
  return NextResponse.json({ data: serializeReferral(created) }, { status: 201 })
}
