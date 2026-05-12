import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createAuditLog } from "@/lib/audit"
import { STATUS_LABELS } from "@/lib/utils"
import { ReferralStatus, AuditAction } from "@prisma/client"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  // HIPAA: bulk PHI export is admin-only
  const isAdmin = (session.user as { role?: string }).role === "ADMIN"
  if (!isAdmin) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const statuses = searchParams.getAll("status").filter((s) =>
    Object.values(ReferralStatus).includes(s as ReferralStatus)
  ) as ReferralStatus[]
  const practiceIds = searchParams.getAll("practice")
  const doctorIds = searchParams.getAll("doctor")
  const tagIds = searchParams.getAll("tag")
  const pipelineId = searchParams.get("pipeline")
  const from = searchParams.get("from")
  const to = searchParams.get("to")

  const referrals = await (prisma as any).referral.findMany({
    where: {
      ...(pipelineId ? { pipelineId } : {}),
      ...(statuses.length > 0 ? { status: { in: statuses } } : {}),
      ...(practiceIds.length > 0 ? { referringPracticeId: { in: practiceIds } } : {}),
      ...(doctorIds.length > 0 ? { referringDoctorId: { in: doctorIds } } : {}),
      ...(tagIds.length > 0 ? { tags: { some: { tagId: { in: tagIds } } } } : {}),
      ...(from || to
        ? {
            referralDate: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    },
    include: {
      referringPractice: true,
      pipeline: { select: { name: true } },
      createdBy: { select: { name: true, email: true } },
    },
    orderBy: { referralDate: "desc" },
  })

  const headers = [
    "Patient First Name",
    "Patient Last Name",
    "Patient Phone",
    "Patient Email",
    "Date of Birth",
    "Referring Practice",
    "Referring Doctor",
    "Pipeline",
    "Status",
    "Referral Date",
    "Appointment Date",
    "Insurance Provider",
    "Insurance Member ID",
    "Insurance Group",
    "Auth Status",
    "Notes",
    "Created By",
    "Created At",
  ]

  function escape(val: string | null | undefined): string {
    if (!val) return ""
    const str = String(val)
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const rows = referrals.map((r) => [
    r.patientFirstName,
    r.patientLastName,
    r.patientPhone,
    r.patientEmail,
    r.patientDob ? new Date(r.patientDob).toLocaleDateString() : "",
    r.referringPractice?.name,
    r.referringDoctorName,
    r.pipeline?.name,
    STATUS_LABELS[r.status],
    new Date(r.referralDate).toLocaleDateString(),
    r.appointmentDate ? new Date(r.appointmentDate).toLocaleDateString() : "",
    r.insuranceProvider,
    r.insuranceMemberId,
    r.insuranceGroup,
    r.authStatus,
    r.notes,
    r.createdBy?.name || r.createdBy?.email,
    new Date(r.createdAt).toLocaleDateString(),
  ])

  const csv = [headers, ...rows]
    .map((row) => row.map(escape).join(","))
    .join("\n")

  await createAuditLog({
    userId: session.user.id,
    action: AuditAction.EXPORT_CSV,
    metadata: {
      filters: { statuses, practiceIds, doctorIds, tagIds, from, to },
      recordCount: referrals.length,
    },
  })

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="referrals-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
