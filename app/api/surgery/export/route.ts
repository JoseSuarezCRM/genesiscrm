import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createAuditLog } from "@/lib/audit"
import { buildSurgeryWhere, surgeryOrderBy } from "@/lib/surgery-query"
import { decodeFilterParam } from "@/lib/filter-to-prisma"
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
  const filter = decodeFilterParam(searchParams.get("filter"))

  const where = buildSurgeryWhere({ search, statuses, statusMode, from, to, filter })

  const cases = await (prisma as any).surgeryCase.findMany({
    where,
    orderBy: surgeryOrderBy(sort, dir),
    include: { _count: { select: { callAttempts: true, documents: true } } },
  })

  const fmt = (d: string | Date | null | undefined) =>
    d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" }) : ""

  // Conditional fields fold their free-text detail into the same cell, so the
  // "External" Physical Therapy note isn't lost in the export.
  const physicalTherapyValue = (c: any) =>
    !c.physicalTherapy ? ""
      : c.physicalTherapy === "External" && c.physicalTherapyDetail
        ? `External — ${c.physicalTherapyDetail}`
        : c.physicalTherapy

  // One definition per column, keyed to match the table's column keys so the
  // export can mirror the on-screen view (the `cols` param lists what to include).
  const COLUMN_DEFS: Record<string, { header: string; value: (c: any) => string | number | null | undefined }> = {
    patient:          { header: "Patient",             value: (c) => c.patientName },
    mrn:              { header: "MRN",                  value: (c) => c.mrn },
    status:           { header: "Status",              value: (c) => SURGERY_STATUS_LABELS[c.status] ?? c.status },
    surgeryDate:      { header: "Surgery Date",        value: (c) => fmt(c.surgeryDate) },
    language:         { header: "Language",            value: (c) => LANGUAGE_LABELS[c.language ?? "EN"] ?? c.language },
    procedure:        { header: "Procedure",           value: (c) => c.procedure },
    facility:         { header: "Facility",            value: (c) => c.facility },
    orderingProvider: { header: "Ordering Provider",   value: (c) => c.orderingProvider },
    diagnosis:        { header: "Diagnosis",           value: (c) => (c.diagnosis ?? "").replace(/\s+/g, " ").trim() },
    referral:         { header: "Referral Source",     value: (c) => c.referral },
    medicalClearance: { header: "Medical Clearance",   value: (c) => c.medicalClearance },
    secondaryClearance: { header: "Secondary Clearance", value: (c) => c.secondaryClearance },
    dentalClearance:  { header: "Dental Clearance",    value: (c) => c.dentalClearance },
    ctRequired:       { header: "CT Required",         value: (c) => c.ctRequired },
    glp1:             { header: "GLP-1",               value: (c) => c.glp1 },
    dme:              { header: "DME",                 value: (c) => c.dme },
    physicalTherapy:  { header: "Physical Therapy",    value: physicalTherapyValue },
    email:            { header: "Email",               value: (c) => c.email },
    expires:          { header: "Expires",             value: (c) => fmt(c.expires) },
    calls:            { header: "Calls",               value: (c) => c._count.callAttempts },
    docs:             { header: "Documents",           value: (c) => c._count.documents },
  }
  const ALL_KEYS = Object.keys(COLUMN_DEFS)

  // Which columns to export: the on-screen selection passed via `cols`, filtered
  // to known keys; fall back to the full set when none is provided.
  const requested = (searchParams.get("cols") ?? "").split(",").map((k) => k.trim()).filter((k) => COLUMN_DEFS[k])
  const keys = requested.length > 0 ? requested : ALL_KEYS

  const headers = keys.map((k) => COLUMN_DEFS[k].header)

  function escape(val: string | number | null | undefined): string {
    if (val == null) return ""
    const str = String(val)
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const rows = (cases as any[]).map((c) => keys.map((k) => COLUMN_DEFS[k].value(c)))

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
