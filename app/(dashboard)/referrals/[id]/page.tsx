import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { Trash2 } from "lucide-react"
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

interface Props {
  params: { id: string }
  searchParams: { from?: string }
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

  const [allTags, users, practices, pipelines] = await Promise.all([
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
  ])

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Breadcrumb */}
      <div>
        <BackButton label="Back to Referrals" href={searchParams.from ?? "/referrals"} />

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {referral.patientFirstName} {referral.patientLastName}
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <StatusBadge status={referral.status} />
              <span className="text-sm text-slate-500">
                Referred {formatDate(referral.referralDate)}
              </span>
            </div>
            <div className="mt-2 max-w-xs">
              <ReferralAssignee
                referralId={referral.id}
                assignedTo={referral.assignedTo}
                users={users}
              />
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {(referral.patientPhone || referral.patientEmail) && (
              <OutreachDialog referral={referral} />
            )}
            <EditReferralDialog referral={referral} practices={practices} pipelines={pipelines} />
            <form
              action={async () => {
                "use server"
                await deleteReferral(referral.id)
              }}
            >
              <Button variant="destructive" size="sm" type="submit">
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Status Update + Tags */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Update Status</p>
              <div className="grid grid-cols-3 gap-2">
                {Object.values(ReferralStatus).map((s) => (
                  <form
                    key={s}
                    action={async () => {
                      "use server"
                      await updateReferralStatus(referral.id, s)
                    }}
                  >
                    <Button
                      size="sm"
                      variant={referral.status === s ? "default" : "outline"}
                      type="submit"
                      className={referral.status === s ? "" : "text-slate-600"}
                    >
                      {STATUS_LABELS[s]}
                    </Button>
                  </form>
                ))}
              </div>
            </div>
            <div className="sm:border-l sm:pl-4 min-w-0">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Tags</p>
              <TagSelector
                referralId={referral.id}
                allTags={allTags}
                selectedTagIds={referral.tags.map((t) => t.tagId)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Patient Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Patient Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Name" value={`${referral.patientFirstName} ${referral.patientLastName}`} />
            <Row label="Genesis MRN" value={(referral as any).genesisMrn} />
            <Row label="Referring MRN" value={referral.patientMrn} />
            <Row label="Date of Birth" value={formatDate(referral.patientDob)} />
            <Row label="Phone" value={formatPhone(referral.patientPhone)} />
            <Row label="Email" value={referral.patientEmail} />
          </CardContent>
        </Card>

        {/* Referring Source */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Referring Source</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Practice" value={referral.referringPractice?.name} />
            <Row label="Location" value={referral.referringLocation?.name} />
            <Row label="Location Address" value={referral.referringLocation?.address ?? referral.referringPractice?.address} />
            <Row label="Location Phone" value={formatPhone(referral.referringLocation?.phone ?? referral.referringPractice?.phone)} />
            <Row label="Fax" value={referral.referringLocation?.fax ?? referral.referringPractice?.fax} />
            <Row
              label="Provider"
              value={
                referral.referringDoctor
                  ? [(referral.referringDoctor as any).title, referral.referringDoctor.name].filter(Boolean).join(" ")
                  : referral.referringDoctorName
              }
            />
            <Row label="NPI" value={referral.referringNpi ?? (referral.referringDoctor as any)?.npi} />
            <Row label="Specialty" value={referral.referringDoctor?.specialty} />
            <Row label="Referring Phone" value={formatPhone(referral.referringPhone)} />
            <Row label="Referring Address" value={referral.referringAddress} />
          </CardContent>
        </Card>

        {/* Insurance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Insurance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Provider" value={referral.insuranceProvider} />
            <Row label="Member ID" value={referral.insuranceMemberId} />
            <Row label="Group #" value={referral.insuranceGroup} />
            <Row label="Auth Status" value={referral.authStatus} />
          </CardContent>
        </Card>

        {/* Appointment */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Appointment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Referral Date" value={formatDate(referral.referralDate)} />
            <Row label="Appointment Date" value={formatDate(referral.appointmentDate)} />
            {(referral as any).pipeline?.name?.toUpperCase().includes("MRI") && (
              <Row label="Imaging Type" value={(referral as any).imagingType} />
            )}
            <Row label="Created By" value={referral.createdBy?.name || referral.createdBy?.email} />
            <Row label="Last Updated" value={formatDate(referral.updatedAt)} />
          </CardContent>
        </Card>
      </div>

      {/* Call Tracker */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Call Attempts</CardTitle>
        </CardHeader>
        <CardContent>
          <CallTracker referralId={referral.id} attempts={referral.callAttempts} />
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <ReferralNotesEditor referralId={referral.id} initialNotes={referral.notes} />
        </CardContent>
      </Card>

      {/* Documents */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Documents</CardTitle>
          <DocumentUpload referralId={referral.id} />
        </CardHeader>
        <CardContent>
          <DocumentList documents={referral.documents} referralId={referral.id} />
        </CardContent>
      </Card>
    </div>
  )
}

function Row({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="text-slate-900 font-medium text-right">{value ?? "—"}</span>
    </div>
  )
}
