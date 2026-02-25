import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, Pencil, Trash2, FileUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/status-badge"
import { formatDate } from "@/lib/utils"
import { ReferralStatus } from "@prisma/client"
import { STATUS_LABELS } from "@/lib/utils"
import { updateReferralStatus, deleteReferral } from "@/app/actions/referrals"
import DocumentUpload from "@/components/document-upload"
import DocumentList from "@/components/document-list"
import EditReferralDialog from "@/components/edit-referral-dialog"

interface Props {
  params: { id: string }
}

export default async function ReferralDetailPage({ params }: Props) {
  const referral = await prisma.referral.findUnique({
    where: { id: params.id },
    include: {
      referringPractice: true,
      referringLocation: true,
      referringDoctor: true,
      createdBy: { select: { name: true, email: true } },
      documents: { orderBy: { createdAt: "desc" } },
    },
  })

  if (!referral) notFound()

  const practices = await prisma.referringPractice.findMany({
    orderBy: { name: "asc" },
    include: {
      locations: { orderBy: { name: "asc" } },
      doctors: {
        orderBy: { name: "asc" },
        include: { locations: { select: { locationId: true } } },
      },
    },
  })

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Breadcrumb */}
      <div>
        <Link
          href="/referrals"
          className="inline-flex items-center text-sm text-slate-500 hover:text-slate-800 mb-3"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Referrals
        </Link>

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
          </div>
          <div className="flex gap-2 shrink-0">
            <EditReferralDialog referral={referral} practices={practices} />
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

      {/* Status Update */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Update Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
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
            <Row label="MRN" value={referral.patientMrn} />
            <Row label="Date of Birth" value={formatDate(referral.patientDob)} />
            <Row label="Phone" value={referral.patientPhone} />
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
            <Row label="Location Phone" value={referral.referringLocation?.phone ?? referral.referringPractice?.phone} />
            <Row label="Fax" value={referral.referringLocation?.fax ?? referral.referringPractice?.fax} />
            <Row
              label="Provider"
              value={
                referral.referringDoctor
                  ? [(referral.referringDoctor as any).title, referral.referringDoctor.name].filter(Boolean).join(" ")
                  : referral.referringDoctorName
              }
            />
            <Row label="NPI" value={(referral.referringDoctor as any)?.npi} />
            <Row label="Specialty" value={referral.referringDoctor?.specialty} />
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
            <Row label="Created By" value={referral.createdBy?.name || referral.createdBy?.email} />
            <Row label="Last Updated" value={formatDate(referral.updatedAt)} />
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {referral.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{referral.notes}</p>
          </CardContent>
        </Card>
      )}

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
