import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import SurgeryReportsClient from "@/components/surgery-reports-client"

interface PageProps {
  searchParams: { range?: string; from?: string; to?: string }
}

function resolveRange(range?: string, from?: string, to?: string): { start: Date; end: Date } {
  const now = new Date()
  if (from && to) return { start: new Date(from), end: new Date(to + "T23:59:59") }
  switch (range) {
    case "this_month":  return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }
    case "last_month": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
      return { start: s, end: e }
    }
    case "last_3m":   return { start: new Date(now.getFullYear(), now.getMonth() - 2, 1), end: now }
    case "last_year": return { start: new Date(now.getFullYear() - 1, now.getMonth(), 1), end: now }
    case "all":       return { start: new Date(0), end: now }
    default:          return { start: new Date(now.getFullYear(), now.getMonth() - 5, 1), end: now }
  }
}

export default async function SurgeryReportsPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session) redirect("/login")

  const { start, end } = resolveRange(searchParams.range, searchParams.from, searchParams.to)
  const where = { createdAt: { gte: start, lte: end } }
  const today = new Date()
  const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)

  const [
    allInRange,
    statusCounts,
    facilityCounts,
    providerCounts,
    diagnosisCounts,
    callOutcomes,
    expiringSoon,
    totalEver,
  ] = await Promise.all([
    (prisma as any).surgeryCase.findMany({
      where,
      select: { createdAt: true, status: true },
    }),
    (prisma as any).surgeryCase.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
    (prisma as any).surgeryCase.groupBy({
      by: ["facility"],
      where: { ...where, facility: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { facility: "desc" } },
      take: 10,
    }),
    (prisma as any).surgeryCase.groupBy({
      by: ["orderingProvider"],
      where: { ...where, orderingProvider: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { orderingProvider: "desc" } },
      take: 10,
    }),
    (prisma as any).surgeryCase.groupBy({
      by: ["diagnosis"],
      where: { ...where, diagnosis: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { diagnosis: "desc" } },
      take: 10,
    }),
    (prisma as any).surgeryCallAttempt.groupBy({
      by: ["outcome"],
      _count: { _all: true },
    }),
    (prisma as any).surgeryCase.count({
      where: {
        expires: { gte: today, lte: in30Days },
        status: { notIn: ["COMPLETED", "CANCELED"] },
      },
    }),
    (prisma as any).surgeryCase.count(),
  ])

  // Monthly breakdown (last 6 months by createdAt)
  const now = new Date()
  const monthlyData: { label: string; count: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const ms = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const me = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    const label = ms.toLocaleString("default", { month: "short", year: "2-digit" })
    const count = (allInRange as { createdAt: Date }[]).filter(
      (r) => new Date(r.createdAt) >= ms && new Date(r.createdAt) < me
    ).length
    monthlyData.push({ label, count })
  }

  const total = (allInRange as any[]).length
  const statusMap = Object.fromEntries(
    (statusCounts as { status: string; _count: { _all: number } }[]).map((s) => [s.status, s._count._all])
  ) as Record<string, number>

  const completed = statusMap["COMPLETED"] ?? 0
  const scheduled = statusMap["SCHEDULED"] ?? 0
  const pendingClearance = statusMap["PENDING_CLEARANCE"] ?? 0
  const pendingConfirmation = statusMap["PENDING_CONFIRMATION"] ?? 0
  const canceled = statusMap["CANCELED"] ?? 0
  const newCount = statusMap["NEW"] ?? 0

  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <SurgeryReportsClient
      kpis={{ total, completed, scheduled, pendingClearance, pendingConfirmation, canceled, newCount, completionRate, expiringSoon, totalEver }}
      monthlyData={monthlyData}
      statusMap={statusMap}
      facilitiesData={(facilityCounts as any[]).map((f) => ({ name: f.facility, count: f._count._all }))}
      providersData={(providerCounts as any[]).map((p) => ({ name: p.orderingProvider, count: p._count._all }))}
      diagnosisData={(diagnosisCounts as any[]).map((d) => ({ name: d.diagnosis, count: d._count._all }))}
      callOutcomes={(callOutcomes as any[]).map((o) => ({ outcome: o.outcome, count: o._count._all }))}
      currentRange={searchParams.range ?? "last_6m"}
      currentFrom={searchParams.from}
      currentTo={searchParams.to}
    />
  )
}
