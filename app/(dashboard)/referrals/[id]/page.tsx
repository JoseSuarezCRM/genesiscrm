import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/status-badge"
import { formatDate } from "@/lib/utils"
import { requireView } from "@/lib/auth-guard"
import { userCan, userCanLevel, userCanDelete } from "@/lib/permissions"
import DocumentUpload from "@/components/document-upload"
import DocumentList from "@/components/document-list"
import ReferralNotesEditor from "@/components/referral-notes-editor"
import CallTracker from "@/components/call-tracker"
import { loadCustomPropertiesForDetail } from "@/lib/custom-properties-loader"
import { getCardLayouts } from "@/app/actions/card-layouts"
import ReferralDetailLeftColumn from "@/components/referral-detail-left-column"
import RecordAssociationCards from "@/components/record-association-cards"
import ReferralPipelineSelect from "@/components/referral-pipeline-select"
import RecordDetailShell from "@/components/record-detail-shell"
import ReferralActions from "@/components/referral-actions"
import { loadAssociationCards } from "@/lib/record-associations"
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

  const [allTags, users, practices, pipelines, customProperties, leftCards] = await Promise.all([
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
    getCardLayouts("REFERRAL", "LEFT"),
  ])

  const referralActivity = await listRecordActivities("REFERRAL", referral.id)
  const canDeleteActivities = userCan(session?.user as any, "DELETE_ACTIVITIES")
  const propertyCards = await loadPropertyCards("REFERRAL", referral as any)
  const assocCards = await loadAssociationCards("REFERRAL", referral.id)
  const userOptions = users.map((u: any) => ({ id: u.id, label: u.name ?? u.email }))
  const userMap = Object.fromEntries(userOptions.map((u) => [u.id, u.label]))
  const canDelete = userCanDelete(session?.user as any, "REFERRALS")

  return (
    <RecordDetailShell
      backHref={searchParams.from ?? "/referrals"}
      backLabel="Back to Referrals"
      title={`${referral.patientFirstName} ${referral.patientLastName}`}
      badges={<StatusBadge status={referral.status} />}
      subtitle={`Referred ${formatDate(referral.referralDate)}`}
      actions={
        <ReferralActions
          referral={referral}
          practices={practices}
          pipelines={pipelines}
          catalog={propertyCards.catalog}
          values={propertyCards.values}
          userMap={userMap}
          canEdit={isAdmin}
          canDelete={canDelete}
          canOutreach={!!(referral.patientPhone || referral.patientEmail)}
        />
      }
      engagementBar={
        <RecordEngagementBar recordType="REFERRAL" recordId={referral.id} users={userOptions} canEdit={isAdmin} compact />
      }
      left={
        <ReferralDetailLeftColumn
          referral={referral}
          users={users}
          allTags={allTags}
          leftCards={leftCards as any}
          customProperties={customProperties}
          pipelines={pipelines as any}
          isAdmin={isAdmin}
          canEditCards={canEditCards}
        />
      }
      middle={
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
                  <ReferralPipelineSelect referralId={referral.id} value={referral.pipelineId} name={referral.pipeline?.name} pipelines={pipelines as any} canEdit={isAdmin} />
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
      }
      right={
        <RecordAssociationCards recordType="REFERRAL" recordId={referral.id} cards={assocCards} canEdit={isAdmin} />
      }
    />
  )
}
