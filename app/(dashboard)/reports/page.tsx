import { prisma } from "@/lib/prisma"
import { ReferralStatus } from "@prisma/client"
import { STATUS_LABELS } from "@/lib/utils"
import ReportsClient from "@/components/reports-client"

interface PageProps {
  searchParams: {
    from?: string
    to?: string
    range?: string
    practiceId?: string | string[]
    doctorId?: string | string[]
    pipelineId?: string | string[]
    practiceMode?: string
    doctorMode?: string
    pipelineMode?: string
  }
}

function toArray(val: string | string[] | undefined): string[] {
  if (!val) return []
  return Array.isArray(val) ? val : [val]
}

const STATUS_COLORS: Record<ReferralStatus, string> = {
  NEW: "bg-blue-500",
  READY_FOR_CALL: "bg-orange-500",
  CONTACTED: "bg-yellow-500",
  SCHEDULED: "bg-purple-500",
  COMPLETED: "bg-green-500",
  NO_SHOW: "bg-red-400",
  LOST: "bg-slate-400",
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

export default async function ReportsPage({ searchParams }: PageProps) {
  const { start, end } = resolveRange(searchParams.range, searchParams.from, searchParams.to)
  const fromStr = start.toISOString().slice(0, 10)
  const toStr = end.toISOString().slice(0, 10)

  const practiceIds = toArray(searchParams.practiceId)
  const doctorIds = toArray(searchParams.doctorId)
  const pipelineIds = toArray(searchParams.pipelineId)
  const practiceMode = searchParams.practiceMode === "none" ? "none" : "any"
  const doctorMode = searchParams.doctorMode === "none" ? "none" : "any"
  const pipelineMode = searchParams.pipelineMode === "none" ? "none" : "any"

  const entityFilter = {
    ...(practiceIds.length > 0 ? { referringPracticeId: practiceMode === "none" ? { notIn: practiceIds } : { in: practiceIds } } : {}),
    ...(doctorIds.length > 0 ? { referringDoctorId: doctorMode === "none" ? { notIn: doctorIds } : { in: doctorIds } } : {}),
    ...(pipelineIds.length > 0 ? { pipelineId: pipelineMode === "none" ? { notIn: pipelineIds } : { in: pipelineIds } } : {}),
  }
  const where = { referralDate: { gte: start, lte: end }, ...entityFilter }

  const [
    allInRange,
    statusCounts,
    topPractices,
    topProviders,
    topInsurance,
    totalEver,
    filterPractices,
    filterDoctors,
    filterPipelines,
  ] = await Promise.all([
    prisma.referral.findMany({
      where,
      select: { referralDate: true, status: true, referringPracticeId: true },
    }),
    prisma.referral.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.referringPractice.findMany({
      where: { referrals: { some: { referralDate: { gte: start, lte: end }, ...entityFilter } } },
      select: { id: true, name: true, _count: { select: { referrals: true } } },
      orderBy: { referrals: { _count: "desc" } },
      take: 10,
    }),
    prisma.referringDoctor.findMany({
      where: { referrals: { some: { referralDate: { gte: start, lte: end }, ...entityFilter } } },
      select: { id: true, name: true, specialty: true, practice: { select: { name: true } }, _count: { select: { referrals: true } } },
      orderBy: { referrals: { _count: "desc" } },
      take: 10,
    }),
    prisma.referral.groupBy({
      by: ["insuranceProvider"],
      where: { ...where, insuranceProvider: { not: null } },
      _count: true,
      orderBy: { _count: { insuranceProvider: "desc" } },
      take: 8,
    }),
    prisma.referral.count({ where: Object.keys(entityFilter).length > 0 ? entityFilter : undefined }),
    prisma.referringPractice.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.referringDoctor.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, title: true, practiceId: true },
    }),
    (prisma as any).pipeline.findMany({
      where: { isActive: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, color: true },
    }),
  ])

  // Monthly breakdown
  const now = new Date()
  const monthlyData: { label: string; year: number; month: number; count: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const ms = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const me = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    const label = ms.toLocaleString("default", { month: "short", year: "2-digit" })
    const count = allInRange.filter((r) => r.referralDate >= ms && r.referralDate < me).length
    monthlyData.push({ label, year: ms.getFullYear(), month: ms.getMonth() + 1, count })
  }

  const total = allInRange.length
  const completed = allInRange.filter((r) => r.status === "COMPLETED").length
  const scheduled = allInRange.filter((r) => r.status === "SCHEDULED").length
  const pending = allInRange.filter((r) => r.status === "NEW" || r.status === "CONTACTED" || r.status === "READY_FOR_CALL").length
  const conversionRate = total > 0 ? Math.round((completed / total) * 100) : 0
  const scheduleRate = total > 0 ? Math.round(((completed + scheduled) / total) * 100) : 0

  const statusCountMap = Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all])) as Record<string, number>

  return (
    <ReportsClient
      kpis={{ total, completed, scheduled, pending, conversionRate, scheduleRate, totalEver }}
      rawDates={allInRange.map((r) => r.referralDate.toISOString())}
      rangeStart={fromStr}
      rangeEnd={toStr}
      statusCountMap={statusCountMap}
      statusColors={STATUS_COLORS}
      statusLabels={STATUS_LABELS}
      practicesData={topPractices.map((p) => ({ id: p.id, name: p.name, count: p._count.referrals }))}
      providersData={topProviders.map((d) => ({ id: d.id, name: d.name, specialty: d.specialty, practiceName: d.practice?.name ?? null, count: d._count.referrals }))}
      insuranceData={topInsurance.filter((i) => i.insuranceProvider).map((i) => ({ name: i.insuranceProvider!, count: typeof i._count === "number" ? i._count : 0 }))}
      currentRange={searchParams.range ?? "last_6m"}
      currentFrom={searchParams.from}
      currentTo={searchParams.to}
      rangeFromStr={fromStr}
      rangeToStr={toStr}
      practiceIds={practiceIds}
      doctorIds={doctorIds}
      pipelineIds={pipelineIds}
      practiceMode={practiceMode}
      doctorMode={doctorMode}
      pipelineMode={pipelineMode}
      filterPractices={filterPractices}
      filterDoctors={filterDoctors.map((d) => ({ id: d.id, label: d.title ? `${d.name}, ${d.title}` : d.name, practiceId: d.practiceId }))}
      filterPipelines={(filterPipelines as { id: string; name: string; color: string }[]) ?? []}
    />
  )
}
