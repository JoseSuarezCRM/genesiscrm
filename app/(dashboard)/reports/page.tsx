import { prisma } from "@/lib/prisma"
import { ReferralStatus } from "@prisma/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { STATUS_LABELS } from "@/lib/utils"
import { Users, TrendingUp, Calendar, Clock } from "lucide-react"

const STATUS_COLORS: Record<ReferralStatus, string> = {
  NEW: "bg-blue-500",
  CONTACTED: "bg-yellow-500",
  SCHEDULED: "bg-purple-500",
  COMPLETED: "bg-green-500",
  NO_SHOW: "bg-red-400",
}

export default async function ReportsPage() {
  const now = new Date()
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)

  const [
    totalReferrals,
    thisMonthReferrals,
    lastMonthReferrals,
    pendingReferrals,
    allReferrals,
    topPractices,
    topProviders,
  ] = await Promise.all([
    prisma.referral.count(),
    prisma.referral.count({ where: { referralDate: { gte: startOfThisMonth } } }),
    prisma.referral.count({ where: { referralDate: { gte: startOfLastMonth, lt: startOfThisMonth } } }),
    prisma.referral.count({ where: { status: { in: [ReferralStatus.NEW, ReferralStatus.CONTACTED] } } }),
    prisma.referral.findMany({
      where: { referralDate: { gte: sixMonthsAgo } },
      select: { referralDate: true, status: true },
    }),
    prisma.referringPractice.findMany({
      include: { _count: { select: { referrals: true } } },
      orderBy: { referrals: { _count: "desc" } },
      take: 5,
    }),
    prisma.referringDoctor.findMany({
      include: { _count: { select: { referrals: true } } },
      orderBy: { referrals: { _count: "desc" } },
      take: 5,
    }),
  ])

  // Monthly breakdown (last 6 months)
  const monthlyData: { label: string; count: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    const label = monthStart.toLocaleString("default", { month: "short", year: "2-digit" })
    const count = allReferrals.filter(
      (r) => r.referralDate >= monthStart && r.referralDate < monthEnd
    ).length
    monthlyData.push({ label, count })
  }
  const maxMonthly = Math.max(...monthlyData.map((m) => m.count), 1)

  // Status breakdown
  const statusCounts = Object.values(ReferralStatus).map((s) => ({
    status: s,
    count: allReferrals.filter((r) => r.status === s).length,
  }))
  const totalInRange = allReferrals.length || 1

  // Month-over-month change
  const momChange = lastMonthReferrals === 0
    ? null
    : Math.round(((thisMonthReferrals - lastMonthReferrals) / lastMonthReferrals) * 100)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500">Overview of referral activity</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Referrals"
          value={totalReferrals}
          icon={<Users className="h-4 w-4 text-blue-500" />}
        />
        <KpiCard
          title="This Month"
          value={thisMonthReferrals}
          icon={<Calendar className="h-4 w-4 text-purple-500" />}
          sub={momChange !== null ? `${momChange >= 0 ? "+" : ""}${momChange}% vs last month` : undefined}
          subColor={momChange !== null && momChange >= 0 ? "text-green-600" : "text-red-500"}
        />
        <KpiCard
          title="Last Month"
          value={lastMonthReferrals}
          icon={<TrendingUp className="h-4 w-4 text-green-500" />}
        />
        <KpiCard
          title="Pending Follow-up"
          value={pendingReferrals}
          icon={<Clock className="h-4 w-4 text-yellow-500" />}
          sub="New + Contacted"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Referrals (Last 6 Months)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {monthlyData.map(({ label, count }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-12 shrink-0">{label}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                    <div
                      className="h-6 bg-blue-500 rounded-full flex items-center px-2 transition-all"
                      style={{ width: `${Math.max((count / maxMonthly) * 100, count > 0 ? 8 : 0)}%` }}
                    >
                      {count > 0 && <span className="text-xs text-white font-medium">{count}</span>}
                    </div>
                  </div>
                  {count === 0 && <span className="text-xs text-slate-400">0</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Status Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status Breakdown (Last 6 Months)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {statusCounts.map(({ status, count }) => (
                <div key={status} className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-24 shrink-0">{STATUS_LABELS[status]}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                    <div
                      className={`h-6 ${STATUS_COLORS[status]} rounded-full flex items-center px-2 transition-all`}
                      style={{ width: `${Math.max((count / totalInRange) * 100, count > 0 ? 8 : 0)}%` }}
                    >
                      {count > 0 && <span className="text-xs text-white font-medium">{count}</span>}
                    </div>
                  </div>
                  {count === 0 && <span className="text-xs text-slate-400">0</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Practices */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Referring Practices</CardTitle>
          </CardHeader>
          <CardContent>
            {topPractices.length === 0 ? (
              <p className="text-sm text-slate-400">No data yet</p>
            ) : (
              <div className="space-y-3">
                {topPractices.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-400 w-4">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                    </div>
                    <span className="text-sm font-bold text-blue-600 shrink-0">
                      {p._count.referrals}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Providers */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Referring Providers</CardTitle>
          </CardHeader>
          <CardContent>
            {topProviders.length === 0 ? (
              <p className="text-sm text-slate-400">No data yet</p>
            ) : (
              <div className="space-y-3">
                {topProviders.map((d, i) => (
                  <div key={d.id} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-400 w-4">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {(d as any).title ? `${(d as any).title} ${d.name}` : d.name}
                      </p>
                      {d.specialty && (
                        <p className="text-xs text-slate-400 truncate">{d.specialty}</p>
                      )}
                    </div>
                    <span className="text-sm font-bold text-blue-600 shrink-0">
                      {d._count.referrals}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function KpiCard({
  title,
  value,
  icon,
  sub,
  subColor = "text-slate-400",
}: {
  title: string
  value: number
  icon: React.ReactNode
  sub?: string
  subColor?: string
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{title}</span>
          {icon}
        </div>
        <p className="text-3xl font-bold text-slate-900">{value}</p>
        {sub && <p className={`text-xs mt-1 ${subColor}`}>{sub}</p>}
      </CardContent>
    </Card>
  )
}
