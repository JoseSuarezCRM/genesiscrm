import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { STATUS_LABELS } from "@/lib/utils"
import { ReferralStatus } from "@prisma/client"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") as ReferralStatus | null
  const from = searchParams.get("from")
  const to = searchParams.get("to")

  const referrals = await prisma.referral.findMany({
    where: {
      ...(status ? { status } : {}),
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

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="referrals-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
