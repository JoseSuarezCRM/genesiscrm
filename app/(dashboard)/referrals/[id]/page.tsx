import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { Trash2 } from "lucide-react"
import BackButton from "@/components/back-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/status-badge"
import { formatDate } from "@/lib/utils"
import { auth } from "@/lib/auth"
import { requireView } from "@/lib/auth-guard"
import { userCan, userCanLevel } from "@/lib/permissions"
import { deleteReferral } from "@/app/actions/referrals"
import DocumentUpload from "@/components/document-upload"
import DocumentList from "@/components/document-list"
import EditReferralDialog from "@/components/edit-referral-dialog"
import ReferralNotesEditor from "@/components/referral-notes-editor"
import OutreachDialog from "@/components/outreach-dialog"
import CallTracker from "@/components/call-tracker"
import { loadCustomPropertiesForDetail } from "@/lib/custom-properties-loader"
import { getCardLayout, getCardLayouts } from "@/app/actions/card-layouts"
import ReferralDetailLeftColumn from "@/components/referral-detail-left-column"
import ReferralDetailRightColumn from "@/components/referral-detail-right-column"
import RecordEngagementBar from "@/components/record-engagement-bar"
import RecordActivityFeed from "@/components/record-activity-feed"
import RecordPropertyCards from "@/components/record-property-cards"
import RecordMiddleTabs from "@/components/record-middle-tabs"
import { loadPropertyCards } from "@/lib/record-cards"
import { listRecordActivities } from "@/app/actions/record-activity"

interface Props {
  params: { id: string }
  searchParams: { from?: string }
}

export default async function ReferralDetailPage({ params, searchParams }: Props) {
  const session = await requireView("REFERRALS")
  const isAdmin = userCanLevel(session?.user as any, "REFERRALS", "EDIT")
  const canEditCards = userCanLevel(session?.user as any, "VIEWS", "EDIT")

  const referral = await prisma.referral.findUnique({
    where: { id: params.id },
    include: {
      referringPractice: true,
      referringLocation: true,
      referringDoctor: {
        include: {
          locations: { include: { location: { select: { name: true } } } },
        },
      },
      pipeline: { select: { id: true, name: true } },
      createdBy: { select: { name: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      documents: { orderBy: { createdAt: "desc" } },
      tags: { include: { tag: true } },
      callAttempts: {
        orderBy: { createdAt: "asc" },
        include: { calledBy: { select: { name: true, email: true } } },
      },
    },
  })

  if (!referral) notFound()

  const [allTags, users, practices, pipelines, customProperties, referralCardLayout, practiceCardLayout, providerCardLayout, leftCards] = await Promise.all([
    prisma.tag.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
    prisma.referringPractice.findMany({
      orderBy: { name: "asc" },
      include: {
        locations: { orderBy: { name: "asc" } },
        doctors: {
          orderBy: { name: "asc" },
          include: { locations: { select: { locationId: true } } },
        },
      },
    }),
    prisma.pipeline.findMany({
      where: { isActive: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
    loadCustomPropertiesForDetail("REFERRAL", params.id),
    getCardLayout("REFERRAL", "Referral"),
    getCardLayout("REFERRAL", "Practice"),
    getCardLayout("REFERRAL", "Provider"),
    getCardLayouts("REFERRAL", "LEFT"),
  ])

  const referralActivity = await listRecordActivities("REFERRAL", referral.id)
  const canDeleteActivities = userCan(session?.user as any, "DELETE_ACTIVITIES")
  const propertyCards = await loadPropertyCards("REFERRAL", referral as any)

  return (
    <div className="p-6 space-y-6 lg:h-full lg:flex lg:flex-col">
      {/* Header */}
      <div className="shrink-0">
        <BackButton label="Back to Referrals" href={searchParams.from ?? "/referrals"} />
        <div className="flex items-start justify-between gap-4 mt-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              {referral.patientFirstName} {referral.patientLastName}
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <StatusBadge status={referral.status} />
              <span className="text-sm text-slate-500">Referred {formatDate(referral.referralDate)}</span>
            </div>
            <div className="mt-4">
              <RecordEngagementBar
                recordType="REFERRAL"
                recordId={referral.id}
                users={users.map((u: any) => ({ id: u.id, label: u.name ?? u.email }))}
                canEdit={isAdmin}
                compact
              />
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {(referral.patientPhone || referral.patientEmail) && <OutreachDialog referral={referral} />}
            <EditReferralDialog referral={referral} practices={practices} pipelines={pipelines} />
            <form action={async () => { "use server"; await deleteReferral(referral.id) }}>
              <Button variant="destructive" size="sm" type="submit">
                <Trash2 className="h-4 w-4 mr-1.5" /> Delete
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Three-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:flex-1 lg:min-h-0 lg:grid-rows-[minmax(0,1fr)]">
        {/* LEFT: Properties Sidebar (customizable cards) */}
        <div className="lg:col-span-1 space-y-4 lg:overflow-y-auto lg:pr-1">
          <ReferralDetailLeftColumn
            referral={referral}
            users={users}
            allTags={allTags}
            leftCards={leftCards as any}
            customProperties={customProperties}
            isAdmin={isAdmin}
            canEditCards={canEditCards}
          />
        </div>

        {/* MIDDLE: Overview & Activities */}
        <div className="lg:col-span-2 lg:overflow-y-auto lg:pr-1">
          <RecordMiddleTabs
            overview={
              <>
          {/* Property cards placed in the middle column */}
          <RecordPropertyCards
            entityType="REFERRAL"
            recordId={referral.id}
            cards={propertyCards.middleCards}
            catalog={propertyCards.catalog}
            values={propertyCards.values}
            canEdit={isAdmin}
            canEditCards={canEditCards}
            section="MIDDLE"
          />

          {/* Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Pipeline</p>
                  <p className="text-sm font-medium text-slate-900">{referral.pipeline?.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Created</p>
                  <p className="text-sm font-medium text-slate-900">{formatDate(referral.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Created By</p>
                  <p className="text-sm font-medium text-slate-900">{referral.createdBy?.name || referral.createdBy?.email}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Appointment</p>
                  <p className="text-sm font-medium text-slate-900">{formatDate(referral.appointmentDate) ?? "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Call Tracker */}
          <Card>
            <CardHeader>
              <CardTitle>Call Attempts</CardTitle>
            </CardHeader>
            <CardContent>
              <CallTracker referralId={referral.id} attempts={referral.callAttempts} />
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <ReferralNotesEditor referralId={referral.id} initialNotes={referral.notes} />
            </CardContent>
          </Card>

          {/* Documents */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Documents</CardTitle>
              <DocumentUpload referralId={referral.id} />
            </CardHeader>
            <CardContent>
              <DocumentList documents={referral.documents} referralId={referral.id} />
            </CardContent>
          </Card>

              </>
            }
            activities={
              <RecordActivityFeed
                recordType="REFERRAL"
                recordId={referral.id}
                items={referralActivity as any}
                users={users.map((u: any) => ({ id: u.id, label: u.name ?? u.email }))}
                canEdit={isAdmin}
                showActions={false}
                canDeleteActivities={canDeleteActivities}
              />
            }
          />
        </div>

        {/* RIGHT: Associated Objects (Customizable) */}
        <ReferralDetailRightColumn
          referral={referral}
          referralCardLayout={referralCardLayout}
          practiceCardLayout={practiceCardLayout}
          providerCardLayout={providerCardLayout}
          isAdmin={isAdmin}
          canEditCards={canEditCards}
        />
      </div>
    </div>
  )
}
