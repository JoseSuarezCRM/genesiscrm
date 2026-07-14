import { prisma } from "@/lib/prisma"
import { requireView } from "@/lib/auth-guard"
import { userCanLevel } from "@/lib/permissions"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, Building2, MapPin, ExternalLink } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/status-badge"
import { formatDate } from "@/lib/utils"
import LocationInfoEditor from "@/components/location-info-editor"
import CustomPropertiesDisplay from "@/components/custom-properties-display"
import { loadCustomPropertiesForDetail } from "@/lib/custom-properties-loader"
import RecordActivityFeed from "@/components/record-activity-feed"
import RecordEngagementBar from "@/components/record-engagement-bar"
import RecordOwnerCard from "@/components/record-owner-card"
import RecordDetailShell from "@/components/record-detail-shell"
import RecordPropertyCards from "@/components/record-property-cards"
import { loadPropertyCards } from "@/lib/record-cards"
import RecordMiddleTabs from "@/components/record-middle-tabs"
import { listRecordActivities } from "@/app/actions/record-activity"

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
        owner: { select: { id: true, name: true, email: true } },
        createdBy: { select: { name: true, email: true } },
        updatedBy: { select: { name: true, email: true } },
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

  const [activityItems, feedUsers] = await Promise.all([
    listRecordActivities("LOCATION", location.id),
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ])

  const providers = location.doctors.map((dl) => dl.doctor)
  const completed = location.referrals.filter((r) => r.status === "COMPLETED").length
  const scheduled = location.referrals.filter((r) => r.status === "SCHEDULED").length
  const pending = location.referrals.filter((r) => r.status === "NEW" || r.status === "CONTACTED").length

  const userOptions = feedUsers.map((u) => ({ id: u.id, label: u.name ?? u.email }))
  const canEditCards = userCanLevel(user, "VIEWS", "EDIT")
  const propertyCards = await loadPropertyCards("LOCATION", location as any)

  return (
    <RecordDetailShell
      backHref="/locations"
      backLabel="Back to Locations"
      title={<span className="inline-flex items-center gap-2"><MapPin className="h-5 w-5 text-slate-400 shrink-0" />{location.name}</span>}
      subtitle={
        <Link href={`/practices/${location.practice.id}`} className="inline-flex items-center gap-1 hover:underline">
          <Building2 className="h-3.5 w-3.5" />{location.practice.name}
        </Link>
      }
      engagementBar={
        <RecordEngagementBar recordType="LOCATION" recordId={location.id} users={userOptions} canEdit={canEdit} compact />
      }
      left={
        <>
          <RecordPropertyCards
            entityType="LOCATION"
            recordId={location.id}
            cards={propertyCards.cards}
            catalog={propertyCards.catalog}
            values={propertyCards.values}
            canEdit={canEdit}
            canEditCards={canEditCards}
          />
          <RecordOwnerCard
            type="LOCATION"
            recordId={location.id}
            ownerLabel="Location Owner"
            ownerId={location.ownerId}
            users={userOptions}
            createdByName={location.createdBy?.name ?? location.createdBy?.email ?? null}
            createdAt={location.createdAt}
            updatedByName={location.updatedBy?.name ?? location.updatedBy?.email ?? null}
            updatedAt={location.updatedAt}
            canEdit={canEdit}
          />
        </>
      }
      middle={
        <RecordMiddleTabs
          overview={
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
          }
          activities={
            <RecordActivityFeed
              recordType="LOCATION"
              recordId={location.id}
              items={activityItems as any}
              users={userOptions}
              canEdit={canEdit}
              showActions={false}
            />
          }
        />
      }
      right={
        <>
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

          <Card>
            <CardHeader><CardTitle className="text-base">Providers ({providers.length})</CardTitle></CardHeader>
            <CardContent className="max-h-80 overflow-y-auto">
              {providers.length === 0 ? (
                <p className="text-sm text-slate-400">No providers linked to this location.</p>
              ) : (
                <div className="divide-y">
                  {providers.map((d) => (
                    <Link key={d.id} href={`/referring-doctors/${d.id}`}
                      className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50 -mx-2 px-2 rounded-md transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-blue-600 truncate">{d.name}</p>
                        {d.specialty && <p className="text-xs text-slate-400 truncate">{d.specialty}</p>}
                      </div>
                      <span className="text-xs text-slate-400 shrink-0">{d._count.referrals}</span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      }
    />
  )
}
