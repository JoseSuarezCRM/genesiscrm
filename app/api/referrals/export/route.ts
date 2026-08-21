import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createAuditLog } from "@/lib/audit"
import { STATUS_LABELS } from "@/lib/utils"
import { userCan } from "@/lib/permissions"
import { ReferralStatus, AuditAction } from "@prisma/client"
import { buildReferralWhere } from "@/lib/referral-query"
import { referralFilterFields } from "@/lib/referral-filter-fields"
import { decodeFilterParam } from "@/lib/filters"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  // Bulk PHI export requires the Export Data permission (admins always pass).
  if (!userCan(session.user as any, "EXPORT_DATA")) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const statuses = searchParams.getAll("status").filter((s) =>
    Object.values(ReferralStatus).includes(s as ReferralStatus)
  ) as ReferralStatus[]
  const statusMode = searchParams.get("statusMode") === "none" ? "none" : "any"
  const practiceIds = searchParams.getAll("practice")
  const practiceMode = searchParams.get("practiceMode") === "none" ? "none" : "any"
  const doctorIds = searchParams.getAll("doctor")
  const doctorMode = searchParams.get("doctorMode") === "none" ? "none" : "any"
  const tagIds = searchParams.getAll("tag")
  const tagMode = searchParams.get("tagMode") === "none" ? "none" : "any"
  const pipelineId = searchParams.get("pipeline")
  const from = searchParams.get("from")
  const to = searchParams.get("to")

  // Same where-builder as the list, so the export honors quick filters, the
  // advanced FilterBuilder (`filter` param), and the active saved view.
  const referralCustomProps = await prisma.customProperty.findMany({ where: { entityType: "REFERRAL" }, orderBy: { createdAt: "asc" } })
  const filterFields = referralFilterFields({
    customProps: referralCustomProps.map((p) => ({ id: p.id, name: p.name, type: p.type, options: p.options })),
  })
  const where = buildReferralWhere({
    statuses, statusMode, practiceIds, practiceMode, doctorIds, doctorMode,
    tagIds, tagMode, from: from ?? undefined, to: to ?? undefined,
    pipelineId, filter: decodeFilterParam(searchParams.get("filter")),
  }, filterFields) as any

  const referrals = await (prisma as any).referral.findMany({
    where,
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

  const rows = (referrals as any[]).map((r) => [
    r.patientFirstName,
    r.patientLastName,
    r.patientPhone,
    r.patientEmail,
    r.patientDob ? new Date(r.patientDob).toLocaleDateString() : "",
    r.referringPractice?.name,
    r.referringDoctorName,
    r.pipeline?.name,
    STATUS_LABELS[r.status as import("@prisma/client").ReferralStatus],
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

  const rawName = (searchParams.get("filename") || `referrals-${new Date().toISOString().slice(0, 10)}`)
    .replace(/[^a-z0-9_\- ]/gi, "").trim() || "referrals"
  const fileName = rawName.endsWith(".csv") ? rawName : `${rawName}.csv`

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  })
}
