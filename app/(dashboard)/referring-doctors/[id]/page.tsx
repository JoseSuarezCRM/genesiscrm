import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { requireView } from "@/lib/auth-guard"
import { userCan, userCanLevel } from "@/lib/permissions"
import { notFound, redirect } from "next/navigation"
import { resolveMergeRedirect } from "@/lib/merge-redirect"
import Link from "next/link"
import { ChevronLeft, Building2, MapPin } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/status-badge"
import { formatDate } from "@/lib/utils"
import ProviderInfoEditor from "@/components/provider-info-editor"
import RecordActivityFeed from "@/components/record-activity-feed"
import RecordEngagementBar from "@/components/record-engagement-bar"
import RecordDetailShell from "@/components/record-detail-shell"
import RecordActionsMenu from "@/components/record-actions-menu"
import RecordPropertyCards from "@/components/record-property-cards"
import RecordAssociationCards from "@/components/record-association-cards"
import { loadAssociationCards } from "@/lib/record-associations"
import { loadPropertyCards } from "@/lib/record-cards"
import { userCanLevel as canLevel, userCanDelete } from "@/lib/permissions"
import RecordMiddleTabs from "@/components/record-middle-tabs"
import { listRecordActivities } from "@/app/actions/record-activity"
import CustomPropertiesDisplay from "@/components/custom-properties-display"
import { loadCustomPropertiesForDetail } from "@/lib/custom-properties-loader"
import { format } from "date-fns"

interface Props { params: { id: string } }

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="text-slate-900 font-medium text-right">{value ?? "—"}</span>
    </div>
  )
}

export default async function ProviderDetailPage({ params }: Props) {
  const session = await requireView("PROVIDERS")
  const isAdmin = userCanLevel(session?.user as any, "PROVIDERS", "EDIT")

  const [provider, activities, allPractices, customProperties] = await Promise.all([
    prisma.referringDoctor.findUnique({
      where: { id: params.id },
      include: {
        practice: true,
        owner: { select: { id: true, name: true, email: true } },
        createdBy: { select: { name: true, email: true } },
        updatedBy: { select: { name: true, email: true } },
        locations: { include: { location: true } },
        referrals: { orderBy: { referralDate: "desc" } },
        providerNotes: {
          orderBy: { createdAt: "desc" },
          include: { createdBy: { select: { name: true, email: true } } },
        },
      },
    }),
    prisma.activity.findMany({
      where: { providers: { some: { doctorId: params.id } } },
      orderBy: { date: "desc" },
      include: {
        practice: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        createdBy: { select: { name: true, email: true } },
      },
    }),
    prisma.referringPractice.findMany({
      orderBy: { name: "asc" },
      include: { locations: { orderBy: { name: "asc" }, select: { id: true, name: true } } },
    }),
    loadCustomPropertiesForDetail("PROVIDER", params.id),
  ])

  if (!provider) {
    // The provider may have been merged into another; follow the redirect.
    const to = await resolveMergeRedirect("PROVIDER", params.id)
    if (to) redirect(`/referring-doctors/${to}`)
    notFound()
  }

  const [activityItems, feedUsers] = await Promise.all([
    listRecordActivities("PROVIDER", provider.id),
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ])

  const isPrefixTitle = provider.title?.startsWith("Dr")
  const displayName = provider.title
    ? isPrefixTitle ? `${provider.title} ${provider.name}` : `${provider.name}, ${provider.title}`
    : provider.name

  const userOptions = feedUsers.map((u) => ({ id: u.id, label: u.name ?? u.email }))
  const canEditCards = canLevel(session?.user as any, "VIEWS", "EDIT")
  const propertyCards = await loadPropertyCards("PROVIDER", provider as any, "Provider Owner")
  const canDelete = userCanDelete(session?.user as any, "PROVIDERS")
  const assocCards = await loadAssociationCards("PROVIDER", provider.id)
  const canDeleteActivities = userCan(session?.user as any, "DELETE_ACTIVITIES")

  return (
    <RecordDetailShell
      backHref="/referring-doctors"
      backLabel="Back to Referring Providers"
      title={displayName}
      actions={
        <RecordActionsMenu entityType="PROVIDER" recordId={provider.id} title={displayName}
          catalog={propertyCards.catalog} values={propertyCards.values}
          userMap={Object.fromEntries(userOptions.map((u) => [u.id, u.label]))}
          canEdit={isAdmin} canDelete={canDelete} />
      }
      subtitle={provider.specialty ?? undefined}
      engagementBar={
        <RecordEngagementBar recordType="PROVIDER" recordId={provider.id} users={userOptions} canEdit={isAdmin} compact />
      }
      left={
        <>
          <RecordPropertyCards
            entityType="PROVIDER"
            recordId={provider.id}
            cards={propertyCards.cards}
            catalog={propertyCards.catalog}
            values={propertyCards.values}
            canEdit={isAdmin}
            canEditCards={canEditCards}
            users={userOptions}
          />
        </>
      }
      middle={
        <RecordMiddleTabs
          overview={
            <>
          <RecordPropertyCards
            entityType="PROVIDER"
            recordId={provider.id}
            cards={propertyCards.middleCards}
            catalog={propertyCards.catalog}
            values={propertyCards.values}
            canEdit={isAdmin}
            canEditCards={canEditCards}
            section="MIDDLE"
            users={userOptions}
          />
            <Card>
              <CardHeader><CardTitle className="text-base">Referral History ({provider.referrals.length})</CardTitle></CardHeader>
              <CardContent>
                {provider.referrals.length === 0 ? (
                  <p className="text-sm text-slate-400">No referrals yet from this provider.</p>
                ) : (
                  <div className="divide-y">
                    {provider.referrals.map((r) => (
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
            </>
          }
          activities={
            <RecordActivityFeed
              recordType="PROVIDER"
              recordId={provider.id}
              items={activityItems as any}
              users={userOptions}
              canEdit={isAdmin}
              showActions={false}
              canDeleteActivities={canDeleteActivities}
            />
          }
        />
      }
      right={
        <>
        <Card>
          <CardHeader><CardTitle className="text-base">Referral Summary</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Total Referrals" value={String(provider.referrals.length)} />
            <Row label="Most Recent" value={provider.referrals[0] ? formatDate(provider.referrals[0].referralDate) : undefined} />
            <Row label="Completed" value={String(provider.referrals.filter((r) => r.status === "COMPLETED").length)} />
            <Row label="Scheduled" value={String(provider.referrals.filter((r) => r.status === "SCHEDULED").length)} />
            <Row label="Pending" value={String(provider.referrals.filter((r) => r.status === "NEW" || r.status === "CONTACTED").length)} />
          </CardContent>
        </Card>

        <RecordAssociationCards recordType="PROVIDER" recordId={provider.id} cards={assocCards} canEdit={isAdmin} />
        </>
      }
    />
  )
}
