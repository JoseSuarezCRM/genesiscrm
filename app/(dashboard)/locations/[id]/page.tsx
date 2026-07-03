import { prisma } from "@/lib/prisma"
import { requireView } from "@/lib/auth-guard"
import { userCanLevel } from "@/lib/permissions"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, Building2, MapPin, ExternalLink } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/status-badge"
import { formatDate } from "@/lib/utils"
import { format } from "date-fns"
import LocationInfoEditor from "@/components/location-info-editor"
import CustomPropertiesDisplay from "@/components/custom-properties-display"
import { loadCustomPropertiesForDetail } from "@/lib/custom-properties-loader"

interface Props { params: { id: string } }

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="text-slate-900 font-medium text-right">{value ?? "—"}</span>
    </div>
  )
}

export default async function LocationDetailPage({ params }: Props) {
  const session = await requireView("LOCATIONS")
  const user = session?.user as any
  const canEdit = userCanLevel(user, "LOCATIONS", "EDIT") || userCanLevel(user, "PRACTICES", "EDIT")

  const [location, practices, customProperties] = await Promise.all([
    prisma.practiceLocation.findUnique({
      where: { id: params.id },
      include: {
        practice: { select: { id: true, name: true } },
        doctors: {
          include: {
            doctor: { select: { id: true, name: true, title: true, specialty: true, _count: { select: { referrals: true } } } },
          },
        },
        referrals: {
          orderBy: { referralDate: "desc" },
          take: 50,
          select: { id: true, patientFirstName: true, patientLastName: true, patientMrn: true, status: true, referralDate: true },
        },
        activities: {
          orderBy: { date: "desc" },
          take: 25,
          include: { createdBy: { select: { name: true, email: true } } },
        },
        _count: { select: { referrals: true, doctors: true, activities: true } },
      },
    }),
    prisma.referringPractice.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    loadCustomPropertiesForDetail("LOCATION", params.id),
  ])

  if (!location) notFound()

  const providers = location.doctors.map((dl) => dl.doctor)
  const completed = location.referrals.filter((r) => r.status === "COMPLETED").length
  const scheduled = location.referrals.filter((r) => r.status === "SCHEDULED").length
  const pending = location.referrals.filter((r) => r.status === "NEW" || r.status === "CONTACTED").length

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div>
        <Link href="/locations" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-800 mb-3">
          <ChevronLeft className="h-4 w-4 mr-1" /> Back to Locations
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <MapPin className="h-5 w-5 text-slate-400" />{location.name}
        </h1>
        <Link href={`/practices/${location.practice.id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:underline mt-1">
          <Building2 className="h-3.5 w-3.5" />{location.practice.name}
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LocationInfoEditor location={location as any} practices={practices} canEdit={canEdit} />

        <Card>
          <CardHeader><CardTitle className="text-base">Referral Summary</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Total Referrals" value={String(location._count.referrals)} />
            <Row label="Providers Here" value={String(location._count.doctors)} />
            <Row label="Activities" value={String(location._count.activities)} />
            <Row label="Completed" value={String(completed)} />
            <Row label="Scheduled" value={String(scheduled)} />
            <Row label="Pending" value={String(pending)} />
          </CardContent>
        </Card>
      </div>

      {/* Custom Properties */}
      {customProperties.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <CustomPropertiesDisplay entityType="LOCATION" entityId={location.id} properties={customProperties as any} />
          </CardContent>
        </Card>
      )}

      {/* Providers at this location */}
      <Card>
        <CardHeader><CardTitle className="text-base">Providers at this Location ({providers.length})</CardTitle></CardHeader>
        <CardContent>
          {providers.length === 0 ? (
            <p className="text-sm text-slate-400">No providers linked to this location.</p>
          ) : (
            <div className="divide-y">
              {providers.map((d) => (
                <Link key={d.id} href={`/referring-doctors/${d.id}`}
                  className="flex items-center justify-between gap-4 py-3 hover:bg-slate-50 -mx-2 px-2 rounded-md transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-blue-600 inline-flex items-center gap-1">
                      {d.title ? <span className="text-slate-500 font-normal">{d.title}</span> : null}{d.name}
                      <ExternalLink className="h-3 w-3 text-slate-400" />
                    </p>
                    {d.specialty && <p className="text-xs text-slate-400">{d.specialty}</p>}
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{d._count.referrals} referrals</span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Referral history */}
      <Card>
        <CardHeader><CardTitle className="text-base">Referral History ({location._count.referrals})</CardTitle></CardHeader>
        <CardContent>
          {location.referrals.length === 0 ? (
            <p className="text-sm text-slate-400">No referrals from this location yet.</p>
          ) : (
            <div className="divide-y">
              {location.referrals.map((r) => (
                <Link key={r.id} href={`/referrals/${r.id}`}
                  className="flex items-center justify-between gap-4 py-3 hover:bg-slate-50 -mx-2 px-2 rounded-md transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{r.patientFirstName} {r.patientLastName}</p>
                    {r.patientMrn && <p className="text-xs text-slate-400">MRN: {r.patientMrn}</p>}
                  </div>
                  <StatusBadge status={r.status} />
                  <span className="text-xs text-slate-400 shrink-0">{formatDate(r.referralDate)}</span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activities */}
      <Card>
        <CardHeader><CardTitle className="text-base">Activities ({location._count.activities})</CardTitle></CardHeader>
        <CardContent>
          {location.activities.length === 0 ? (
            <p className="text-sm text-slate-400">No activities logged at this location yet.</p>
          ) : (
            <div className="space-y-3">
              {location.activities.map((a) => (
                <div key={a.id} className="flex items-start gap-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="shrink-0 w-12 text-center">
                    <p className="text-xs font-semibold text-blue-600 uppercase">{format(a.date, "MMM")}</p>
                    <p className="text-xl font-bold text-slate-800 leading-none">{format(a.date, "d")}</p>
                    <p className="text-xs text-slate-400">{format(a.date, "yyyy")}</p>
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    {a.notes && <p className="text-sm text-slate-600">{a.notes}</p>}
                    <p className="text-xs text-slate-400">Logged by {a.createdBy.name ?? a.createdBy.email}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
