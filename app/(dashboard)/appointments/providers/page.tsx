import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { Building2, ChevronRight, Calendar } from "lucide-react"

export default async function AppointmentProvidersPage() {
  // Aggregate by referringProvider
  const grouped = await prisma.completedAppointment.groupBy({
    by: ["referringProvider"],
    _count: { id: true },
    _max: { appointmentDate: true },
    orderBy: { _count: { id: "desc" } },
  })

  // Fetch address/phone for each provider (use first record found)
  const providerDetails = await prisma.completedAppointment.findMany({
    where: { referringProvider: { in: grouped.map((g) => g.referringProvider) } },
    distinct: ["referringProvider"],
    select: { referringProvider: true, referringProviderAddress: true, referringProviderPhone: true },
  })
  const detailMap = Object.fromEntries(providerDetails.map((d) => [d.referringProvider, d]))

  const total = grouped.reduce((s, g) => s + g._count.id, 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Referring Providers</h1>
          <p className="text-sm text-slate-500">
            {grouped.length} providers · {total} completed appointments total
          </p>
        </div>
        <Link
          href="/appointments"
          className="text-sm text-blue-600 hover:underline"
        >
          ← All Appointments
        </Link>
      </div>

      {grouped.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
          No referring providers yet — import appointments to see data here.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {grouped.map((g) => {
            const detail = detailMap[g.referringProvider]
            const lastDate = g._max.appointmentDate
            return (
              <Link
                key={g.referringProvider}
                href={`/appointments/providers/${encodeURIComponent(g.referringProvider)}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors group"
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-50 shrink-0">
                    <Building2 className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 group-hover:text-blue-600">
                      {g.referringProvider}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {detail?.referringProviderAddress && (
                        <span className="text-xs text-slate-400">{detail.referringProviderAddress}</span>
                      )}
                      {detail?.referringProviderPhone && (
                        <span className="text-xs text-slate-400">{detail.referringProviderPhone}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-lg font-bold text-slate-800">{g._count.id}</p>
                    <p className="text-xs text-slate-400">appointments</p>
                  </div>
                  {lastDate && (
                    <div className="text-right hidden sm:block">
                      <div className="flex items-center gap-1 text-xs text-slate-400">
                        <Calendar className="h-3 w-3" />
                        Last: {new Date(lastDate).toLocaleDateString()}
                      </div>
                    </div>
                  )}
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500" />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
