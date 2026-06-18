import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createAuditLog } from "@/lib/audit"
import { buildSurgeryWhere, surgeryOrderBy } from "@/lib/surgery-query"
import { SURGERY_STATUS_LABELS } from "@/lib/surgery-constants"
import { LANGUAGE_OPTIONS } from "@/lib/automation-properties"
import { AuditAction } from "@prisma/client"

const LANGUAGE_LABELS: Record<string, string> = Object.fromEntries(LANGUAGE_OPTIONS.map((o) => [o.value, o.label]))

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return new NextResponse("Unauthorized", { status: 401 })

  // HIPAA: bulk PHI export is admin-only
  const isAdmin = (session.user as { role?: string }).role === "ADMIN"
  if (!isAdmin) return new NextResponse("Forbidden", { status: 403 })

  const { searchParams } = new URL(req.url)
  const statuses = searchParams.getAll("status")
  const statusMode = searchParams.get("statusMode") === "none" ? "none" : "any"
  const search = searchParams.get("search") ?? undefined
  const from = searchParams.get("from") ?? undefined
  const to = searchParams.get("to") ?? undefined
  const sort = searchParams.get("sort") ?? undefined
  const dir = searchParams.get("dir") === "asc" ? "asc" : "desc"

  const where = buildSurgeryWhere({ search, statuses, statusMode, from, to })

  const cases = await (prisma as any).surgeryCase.findMany({
    where,
    orderBy: surgeryOrderBy(sort, dir),
    include: { _count: { select: { callAttempts: true, documents: true } } },
  })

  const fmt = (d: string | Date | null | undefined) =>
    d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" }) : ""

  const headers = [
    "Patient", "MRN", "Status", "Surgery Date", "Language", "Procedure",
    "Facility", "Ordering Provider", "Diagnosis", "Expires", "Calls", "Documents",
  ]

  function escape(val: string | number | null | undefined): string {
    if (val == null) return ""
    const str = String(val)
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const rows = (cases as any[]).map((c) => [
    c.patientName,
    c.mrn,
    SURGERY_STATUS_LABELS[c.status] ?? c.status,
    fmt(c.surgeryDate),
    LANGUAGE_LABELS[c.language ?? "EN"] ?? c.language,
    c.procedure,
    c.facility,
    c.orderingProvider,
    (c.diagnosis ?? "").replace(/\s+/g, " ").trim(),
    fmt(c.expires),
    c._count.callAttempts,
    c._count.documents,
  ])

  const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n")

  await createAuditLog({
    userId: session.user.id,
    action: AuditAction.EXPORT_CSV,
    metadata: { filters: { statuses, search, from, to }, recordCount: cases.length, entity: "surgery" },
  })

  const rawName = (searchParams.get("filename") || `surgery-cases-${new Date().toISOString().slice(0, 10)}`)
    .replace(/[^a-z0-9_\- ]/gi, "").trim() || "surgery-cases"
  const fileName = rawName.endsWith(".csv") ? rawName : `${rawName}.csv`

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  })
}
