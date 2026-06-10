import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { Trash2, Settings } from "lucide-react"
import Link from "next/link"
import BackButton from "@/components/back-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/status-badge"
import { formatDate, formatPhone } from "@/lib/utils"
import { ReferralStatus } from "@prisma/client"
import { STATUS_LABELS } from "@/lib/utils"
import { updateReferralStatus, deleteReferral } from "@/app/actions/referrals"
import DocumentUpload from "@/components/document-upload"
import DocumentList from "@/components/document-list"
import EditReferralDialog from "@/components/edit-referral-dialog"
import ReferralNotesEditor from "@/components/referral-notes-editor"
import OutreachDialog from "@/components/outreach-dialog"
import TagSelector from "@/components/tag-selector"
import CallTracker from "@/components/call-tracker"
import ReferralAssignee from "@/components/referral-assignee"
import CustomPropertiesDisplay from "@/components/custom-properties-display"
import { loadCustomPropertiesForDetail } from "@/lib/custom-properties-loader"
import { getCardLayout } from "@/app/actions/card-layouts"
import ReferralDetailRightColumn from "@/components/referral-detail-right-column"
import ReferralReassignPanel from "@/components/referral-reassign-panel"

interface Props {
  params: { id: string }
  searchParams: { from?: string }
}

function PropertyRow({ label, value, href }: { label: string; value: string | null | undefined; href?: string }) {
  const content = <span className="text-sm text-slate-900 text-right">{value ?? "—"}</span>

  return (
    <div className="flex justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
      {href ? (
        <Link href={href} className="text-sm text-blue-600 hover:text-blue-700 hover:underline text-right">
          {value ?? "—"}
        </Link>
      ) : (
        content
      )}
    </div>
  )
}


export default async function ReferralDetailPage({ params, searchParams }: Props) {
  const referral = await prisma.referral.findUnique({
    where: { id: params.id },
    include: {
      referringPractice: true,
      referringLocation: true,
      referringDoctor: true,
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

  const [allTags, users, practices, pipelines, customProperties, referralCardLayout, practiceCardLayout, providerCardLayout] = await Promise.all([
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
  ])

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
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

      {/* Reassign Practice/Provider */}
      <div id="reassign-panel">
        <ReferralReassignPanel
          referralId={referral.id}
          currentPracticeId={referral.referringPractice?.id || null}
          currentProviderId={referral.referringDoctor?.id || null}
          practices={practices as any}
        />
      </div>

      {/* Three-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* LEFT: Properties Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          {/* Status & Tags */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-1.5">
                {Object.values(ReferralStatus).map((s) => (
                  <form key={s} action={async () => { "use server"; await updateReferralStatus(referral.id, s) }}>
                    <Button size="sm" variant={referral.status === s ? "default" : "outline"} type="submit" className="w-full text-xs">
                      {STATUS_LABELS[s]}
                    </Button>
                  </form>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Assignee */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Assigned To</CardTitle>
            </CardHeader>
            <CardContent>
              <ReferralAssignee referralId={referral.id} assignedTo={referral.assignedTo} users={users} />
            </CardContent>
          </Card>

          {/* Tags */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Tags</CardTitle>
            </CardHeader>
            <CardContent>
              <TagSelector referralId={referral.id} allTags={allTags} selectedTagIds={referral.tags.map((t) => t.tagId)} />
            </CardContent>
          </Card>

          {/* Patient Properties */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Patient</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <PropertyRow label="MRN" value={(referral as any).genesisMrn} />
              <PropertyRow label="DOB" value={formatDate(referral.patientDob)} />
              <PropertyRow label="Phone" value={formatPhone(referral.patientPhone)} />
              <PropertyRow label="Email" value={referral.patientEmail} />
            </CardContent>
          </Card>

          {/* Referral Source Properties */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Source</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <PropertyRow label="Practice" value={referral.referringPractice?.name} />
              <PropertyRow label="Provider" value={referral.referringDoctor ? [(referral.referringDoctor as any).title, referral.referringDoctor.name].filter(Boolean).join(" ") : referral.referringDoctorName} />
              <PropertyRow label="NPI" value={referral.referringNpi ?? (referral.referringDoctor as any)?.npi} />
            </CardContent>
          </Card>

          {/* Custom Properties */}
          {customProperties.length > 0 && (
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Custom Properties</CardTitle>
                <a href="/settings/customization" title="Customize" className="p-1 text-slate-400 hover:text-slate-600">
                  <Settings className="h-4 w-4" />
                </a>
              </CardHeader>
              <CardContent>
                <CustomPropertiesDisplay entityType="REFERRAL" entityId={referral.id} properties={customProperties} />
              </CardContent>
            </Card>
          )}
        </div>

        {/* MIDDLE: Overview & Activities */}
        <div className="lg:col-span-2 space-y-6">
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
        </div>

        {/* RIGHT: Associated Objects (Customizable) */}
        <ReferralDetailRightColumn
          referral={referral}
          referralCardLayout={referralCardLayout}
          practiceCardLayout={practiceCardLayout}
          providerCardLayout={providerCardLayout}
        />
      </div>
    </div>
  )
}
