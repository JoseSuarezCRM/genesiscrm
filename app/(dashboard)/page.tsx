import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { ReferralStatus } from "@prisma/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/status-badge"
import { STATUS_LABELS, formatDate } from "@/lib/utils"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Users,
  TrendingUp,
  Calendar,
  CheckCircle2,
  XCircle,
  Plus,
} from "lucide-react"

async function getStats() {
  const [total, byStatus, recent] = await Promise.all([
    prisma.referral.count(),
    prisma.referral.groupBy({
      by: ["status"],
      _count: { status: true },
    }),
    prisma.referral.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: { referringPractice: true },
    }),
  ])

  const statusMap = Object.fromEntries(
    byStatus.map((s) => [s.status, s._count.status])
  ) as Record<ReferralStatus, number>

  return { total, statusMap, recent }
}

const statCards = [
  {
    status: null,
    label: "Total Referrals",
    icon: Users,
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    status: ReferralStatus.NEW,
    label: "New",
    icon: TrendingUp,
    color: "text-blue-500",
    bg: "bg-blue-50",
  },
  {
    status: ReferralStatus.SCHEDULED,
    label: "Scheduled",
    icon: Calendar,
    color: "text-purple-600",
    bg: "bg-purple-50",
  },
  {
    status: ReferralStatus.COMPLETED,
    label: "Completed",
    icon: CheckCircle2,
    color: "text-green-600",
    bg: "bg-green-50",
  },
  {
    status: ReferralStatus.NO_SHOW,
    label: "No Shows",
    icon: XCircle,
    color: "text-red-500",
    bg: "bg-red-50",
  },
]

export default async function DashboardPage() {
  const session = await auth()
  const { total, statusMap, recent } = await getStats()

  const allStatuses = Object.values(ReferralStatus)
  const statusTotals = allStatuses.map((s) => ({ status: s, count: statusMap[s] ?? 0 }))

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">
            Welcome back, {session?.user?.name || session?.user?.email}
          </p>
        </div>
        <Button asChild>
          <Link href="/referrals/new">
            <Plus className="h-4 w-4 mr-2" />
            New Referral
          </Link>
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {statCards.map(({ status, label, icon: Icon, color, bg }) => {
          const count = status === null ? total : (statusMap[status] ?? 0)
          return (
            <Card key={label}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-slate-600">{label}</p>
                  <div className={`p-2 rounded-lg ${bg}`}>
                    <Icon className={`h-4 w-4 ${color}`} />
                  </div>
                </div>
                <p className="text-3xl font-bold text-slate-900">{count}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Referral Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {statusTotals.map(({ status, count }) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0
              const widthClass = `w-[${pct}%]`
              const colorMap: Record<ReferralStatus, string> = {
                NEW: "bg-blue-500",
                CONTACTED: "bg-yellow-500",
                SCHEDULED: "bg-purple-500",
                COMPLETED: "bg-green-500",
                NO_SHOW: "bg-red-500",
              }
              return (
                <div key={status} className="flex items-center gap-3">
                  <span className="w-24 text-sm text-slate-600 shrink-0">
                    {STATUS_LABELS[status]}
                  </span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full ${colorMap[status]} transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 text-sm font-medium text-slate-700 text-right shrink-0">
                    {count}
                  </span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Referrals */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-semibold">Recent Referrals</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/referrals">View all</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left px-6 py-3 font-medium text-slate-500">Patient</th>
                  <th className="text-left px-6 py-3 font-medium text-slate-500">Referring Practice</th>
                  <th className="text-left px-6 py-3 font-medium text-slate-500">Date</th>
                  <th className="text-left px-6 py-3 font-medium text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                      No referrals yet. <Link href="/referrals/new" className="text-blue-600 hover:underline">Add the first one</Link>.
                    </td>
                  </tr>
                ) : (
                  recent.map((r) => (
                    <tr key={r.id} className="border-b hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3">
                        <Link
                          href={`/referrals/${r.id}`}
                          className="font-medium text-slate-900 hover:text-blue-600"
                        >
                          {r.patientFirstName} {r.patientLastName}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-slate-600">
                        {r.referringPractice?.name ?? "—"}
                      </td>
                      <td className="px-6 py-3 text-slate-600">
                        {formatDate(r.referralDate)}
                      </td>
                      <td className="px-6 py-3">
                        <StatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
