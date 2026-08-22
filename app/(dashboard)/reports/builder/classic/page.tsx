import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import ReportBuilderClient from "@/components/report-builder-client"
import type { GroupBy, Granularity, ReportRow } from "@/components/report-builder-client"
import { STATUS_LABELS } from "@/lib/utils"
import { getSavedReports } from "@/app/actions/saved-reports"
import { getDashboards } from "@/app/actions/dashboards"
import type { DashboardSummary } from "@/app/actions/dashboards"

function toArray(val: string | string[] | undefined): string[] {
  if (!val) return []
  return Array.isArray(val) ? val : [val]
}

function resolveRange(range?: string, from?: string, to?: string): { start: Date; end: Date } {
  const now = new Date()
  if (from && to) return { start: new Date(from), end: new Date(to + "T23:59:59") }
  switch (range) {
    case "this_month": return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }
    case "last_month": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
      return { start: s, end: e }
    }
    case "last_3m": return { start: new Date(now.getFullYear(), now.getMonth() - 2, 1), end: now }
    case "last_year": return { start: new Date(now.getFullYear() - 1, now.getMonth(), 1), end: now }
    case "all": return { start: new Date(0), end: now }
    default: return { start: new Date(now.getFullYear(), now.getMonth() - 5, 1), end: now }
  }
}

function groupReferrals(referrals: any[], groupBy: GroupBy, granularity: Granularity): ReportRow[] {
  const map = new Map<string, { label: string; refs: any[] }>()

  for (const r of referrals) {
    let key: string
    let label: string

    switch (groupBy) {
      case "practice":
        key = r.referringPracticeId ?? "__none__"
        label = r.referringPractice?.name ?? "Unknown Practice"
        break
      case "pipeline":
        key = r.pipelineId ?? "__none__"
        label = r.pipeline?.name ?? "No Pipeline"
        break
      case "status":
        key = r.status
        label = STATUS_LABELS[r.status as keyof typeof STATUS_LABELS] ?? r.status
        break
      case "provider":
        key = r.referringDoctorId ?? r.referringDoctorName ?? "__none__"
        label = r.referringDoctor?.name ?? r.referringDoctorName ?? "Unknown Provider"
        break
      case "insurance":
        key = r.insuranceProvider ?? "__none__"
        label = r.insuranceProvider ?? "No Insurance"
        break
      case "month": {
        const d = new Date(r.referralDate)
        if (granularity === "day") {
          key = d.toISOString().slice(0, 10)
          label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        } else if (granularity === "week") {
          const ws = new Date(d.getTime())
          ws.setHours(0, 0, 0, 0)
          ws.setDate(ws.getDate() - ((ws.getDay() + 6) % 7))
          key = ws.toISOString().slice(0, 10)
          label = ws.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        } else if (granularity === "year") {
          key = String(d.getFullYear())
          label = String(d.getFullYear())
        } else {
          key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
          label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" })
        }
        break
      }
      default:
        key = "__none__"
        label = "Unknown"
    }

    if (!map.has(key)) map.set(key, { label, refs: [] })
    map.get(key)!.refs.push(r)
  }

  return Array.from(map.entries()).map(([key, { label, refs }]) => {
    const total = refs.length
    const completed = refs.filter((r) => r.status === "COMPLETED").length
    const scheduled = refs.filter((r) => r.status === "SCHEDULED").length
    const noShow = refs.filter((r) => r.status === "NO_SHOW").length
    const pending = refs.filter((r) => ["NEW", "READY_FOR_CALL", "CONTACTED"].includes(r.status)).length
    return {
      key,
      label,
      total,
      completed,
      scheduled,
      noShow,
      pending,
      conversionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    }
  })
}

const REFERRAL_SELECT = {
  id: true,
  status: true,
  referralDate: true,
  referringPracticeId: true,
  referringPractice: { select: { id: true, name: true } },
  referringDoctorName: true,
  referringDoctorId: true,
  referringDoctor: { select: { id: true, name: true } },
  insuranceProvider: true,
  pipelineId: true,
  pipeline: { select: { id: true, name: true } },
}

export default async function ReportBuilderPage({
  searchParams,
}: {
  searchParams: {
    groupBy?: string
    granularity?: string
    range?: string
    from?: string
    to?: string
    practiceId?: string | string[]
    pipelineId?: string | string[]
    statusId?: string | string[]
    doctorId?: string | string[]
    practiceMode?: string
    pipelineMode?: string
    statusMode?: string
    doctorMode?: string
  }
}) {
  const session = await auth()
  if (!session) redirect("/login")

  const groupBy = (searchParams.groupBy ?? "practice") as GroupBy
  const granularity = (searchParams.granularity ?? "month") as Granularity
  const range = searchParams.range ?? "last_6m"
  const practiceIds = toArray(searchParams.practiceId)
  const pipelineIds = toArray(searchParams.pipelineId)
  const statusIds = toArray(searchParams.statusId)
  const doctorIds = toArray(searchParams.doctorId)
  const practiceMode = searchParams.practiceMode === "exclude" ? "exclude" : "include"
  const pipelineMode = searchParams.pipelineMode === "exclude" ? "exclude" : "include"
  const statusMode = searchParams.statusMode === "exclude" ? "exclude" : "include"
  const doctorMode = searchParams.doctorMode === "exclude" ? "exclude" : "include"
  const hasRun = !!searchParams.groupBy

  const [filterPractices, filterPipelines, filterDoctors, savedReports, dashboards] = await Promise.all([
    prisma.referringPractice.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    (prisma as any).pipeline.findMany({
      where: { isActive: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, color: true },
    }),
    (prisma as any).referringDoctor.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getSavedReports(),
    getDashboards(),
  ])

  let rows: ReportRow[] = []
  let comparisonRows: ReportRow[] = []
  let rangeFromStr = ""
  let rangeToStr = ""

  if (hasRun) {
    const { start, end } = resolveRange(range, searchParams.from, searchParams.to)
    rangeFromStr = start.toISOString().slice(0, 10)
    rangeToStr = end.toISOString().slice(0, 10)

    const baseWhere = {
      ...(practiceIds.length > 0 ? { referringPracticeId: practiceMode === "exclude" ? { notIn: practiceIds } : { in: practiceIds } } : {}),
      ...(pipelineIds.length > 0 ? { pipelineId: pipelineMode === "exclude" ? { notIn: pipelineIds } : { in: pipelineIds } } : {}),
      ...(statusIds.length > 0 ? { status: statusMode === "exclude" ? { notIn: statusIds } : { in: statusIds } } : {}),
      ...(doctorIds.length > 0 ? { referringDoctorId: doctorMode === "exclude" ? { notIn: doctorIds } : { in: doctorIds } } : {}),
    }

    // Comparison = same duration immediately before the current range
    const duration = end.getTime() - start.getTime()
    const compStart = new Date(start.getTime() - duration)
    const compEnd = new Date(start.getTime() - 1)

    const [referrals, compReferrals] = await Promise.all([
      (prisma as any).referral.findMany({
        where: { referralDate: { gte: start, lte: end }, ...baseWhere },
        select: REFERRAL_SELECT,
      }),
      // Skip comparison for "all time" — no meaningful previous period
      range !== "all"
        ? (prisma as any).referral.findMany({
            where: { referralDate: { gte: compStart, lte: compEnd }, ...baseWhere },
            select: REFERRAL_SELECT,
          })
        : Promise.resolve([]),
    ])

    rows = groupReferrals(referrals, groupBy, granularity)
    comparisonRows = groupReferrals(compReferrals, groupBy, granularity)

    if (groupBy === "month") {
      rows.sort((a, b) => a.key.localeCompare(b.key))
      comparisonRows.sort((a, b) => a.key.localeCompare(b.key))
    } else {
      rows.sort((a, b) => b.total - a.total)
    }
  }

  return (
    <ReportBuilderClient
      groupBy={groupBy}
      granularity={granularity}
      range={range}
      currentFrom={searchParams.from}
      currentTo={searchParams.to}
      practiceIds={practiceIds}
      pipelineIds={pipelineIds}
      statusIds={statusIds}
      doctorIds={doctorIds}
      practiceMode={practiceMode}
      pipelineMode={pipelineMode}
      statusMode={statusMode}
      doctorMode={doctorMode}
      filterPractices={filterPractices}
      filterPipelines={filterPipelines}
      filterDoctors={filterDoctors}
      rows={rows}
      comparisonRows={comparisonRows}
      hasRun={hasRun}
      rangeFromStr={rangeFromStr}
      rangeToStr={rangeToStr}
      savedReports={savedReports}
      dashboards={dashboards}
    />
  )
}
