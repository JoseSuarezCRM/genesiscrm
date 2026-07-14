import { auth } from "@/lib/auth"
import { requireView } from "@/lib/auth-guard"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, Trash2 } from "lucide-react"
import { getSurgeryCase, deleteSurgeryCase } from "@/app/actions/surgery"
import { SURGERY_STATUS_LABELS } from "@/lib/surgery-constants"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import SurgeryDetailClient from "@/components/surgery-detail-client"
import RecordEngagementBar from "@/components/record-engagement-bar"
import RecordOwnerCard from "@/components/record-owner-card"
import RecordActivityFeed from "@/components/record-activity-feed"
import RecordDetailShell from "@/components/record-detail-shell"
import RecordMiddleTabs from "@/components/record-middle-tabs"
import CustomPropertiesDisplay from "@/components/custom-properties-display"
import { loadCustomPropertiesForDetail } from "@/lib/custom-properties-loader"
import { listRecordActivities } from "@/app/actions/record-activity"
import { userCanLevel } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-zinc-100 text-zinc-700",
  SCHEDULED: "bg-blue-100 text-blue-700",
  PENDING_CONFIRMATION: "bg-amber-100 text-amber-700",
  PENDING_CLEARANCE: "bg-orange-100 text-orange-700",
  CANCELED: "bg-red-100 text-red-700",
  COMPLETED: "bg-green-100 text-green-700",
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="text-slate-900 font-medium text-right">{value ?? "—"}</span>
    </div>
  )
}

function formatDate(d: Date | string | null | undefined) {
  if (!d) return null
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export default async function SurgeryCasePage({ params }: { params: { id: string } }) {
  const session = await requireView("SURGERY")
  if (!session) redirect("/login")

  const surgeryCase = await getSurgeryCase(params.id)
  if (!surgeryCase) notFound()

  const canEdit = userCanLevel(session.user as any, "SURGERY", "EDIT")
  const [customProperties, activityItems, feedUsers] = await Promise.all([
    loadCustomPropertiesForDetail("SURGERY", params.id),
    listRecordActivities("SURGERY", params.id),
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ])
  const userOptions = feedUsers.map((u) => ({ id: u.id, label: u.name ?? u.email }))

  return (
    <RecordDetailShell
      backHref="/surgery"
      backLabel="Surgery"
      title={surgeryCase.patientName}
      badges={
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium ${STATUS_COLORS[surgeryCase.status] ?? "bg-zinc-100 text-zinc-700"}`}>
          {SURGERY_STATUS_LABELS[surgeryCase.status] ?? surgeryCase.status}
        </span>
      }
      subtitle={surgeryCase.mrn ? `MRN: ${surgeryCase.mrn}` : undefined}
      actions={
        <form
          action={async () => {
            "use server"
            await deleteSurgeryCase(params.id)
            redirect("/surgery")
          }}
        >
          <Button variant="destructive" size="sm" type="submit">
            <Trash2 className="h-4 w-4 mr-1.5" />
            Delete
          </Button>
        </form>
      }
      engagementBar={
        <RecordEngagementBar recordType="SURGERY" recordId={params.id} users={userOptions} canEdit={canEdit} compact />
      }
      left={
        <>
          <RecordOwnerCard
            type="SURGERY"
            recordId={params.id}
            ownerLabel="Surgery Case Owner"
            ownerId={surgeryCase.ownerId ?? null}
            users={userOptions}
            createdByName={surgeryCase.createdBy?.name ?? surgeryCase.createdBy?.email ?? null}
            createdAt={surgeryCase.createdAt}
            updatedByName={surgeryCase.updatedBy?.name ?? surgeryCase.updatedBy?.email ?? null}
            updatedAt={surgeryCase.updatedAt}
            canEdit={canEdit}
          />

          <Card>
            <CardHeader><CardTitle className="text-base">Case Information</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Patient Name" value={surgeryCase.patientName} />
              <Row label="MRN" value={surgeryCase.mrn} />
              <Row label="Ordering Provider" value={surgeryCase.orderingProvider} />
              <Row label="Diagnosis" value={surgeryCase.diagnosis} />
              <Row label="Creation Date" value={formatDate(surgeryCase.creationDate)} />
              <Row label="Expires" value={formatDate(surgeryCase.expires)} />
              <Row label="Uploaded by" value={surgeryCase.createdBy?.name ?? surgeryCase.createdBy?.email} />
            </CardContent>
          </Card>

          {customProperties.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <CustomPropertiesDisplay entityType="SURGERY" entityId={params.id} properties={customProperties as any} />
              </CardContent>
            </Card>
          )}
        </>
      }
      middle={
        <RecordMiddleTabs
          overview={<SurgeryDetailClient surgeryCase={surgeryCase} />}
          activities={
            <RecordActivityFeed
              recordType="SURGERY"
              recordId={params.id}
              items={activityItems as any}
              users={userOptions}
              canEdit={canEdit}
              showActions={false}
            />
          }
        />
      }
    />
  )
}
