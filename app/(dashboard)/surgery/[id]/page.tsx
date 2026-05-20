import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, Trash2 } from "lucide-react"
import { getSurgeryCase, deleteSurgeryCase } from "@/app/actions/surgery"
import { SURGERY_STATUS_LABELS } from "@/lib/surgery-constants"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import SurgeryDetailClient from "@/components/surgery-detail-client"

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
  const session = await auth()
  if (!session) redirect("/login")

  const surgeryCase = await getSurgeryCase(params.id)
  if (!surgeryCase) notFound()

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/surgery"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-3"
        >
          <ChevronLeft className="h-4 w-4" />
          Surgery
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{surgeryCase.patientName}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium ${STATUS_COLORS[surgeryCase.status] ?? "bg-zinc-100 text-zinc-700"}`}>
                {SURGERY_STATUS_LABELS[surgeryCase.status] ?? surgeryCase.status}
              </span>
              {surgeryCase.mrn && (
                <span className="text-sm text-slate-500">MRN: {surgeryCase.mrn}</span>
              )}
            </div>
          </div>
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
        </div>
      </div>

      {/* From-file info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Case Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Patient Name" value={surgeryCase.patientName} />
          <Row label="MRN" value={surgeryCase.mrn} />
          <Row label="Diagnosis" value={surgeryCase.diagnosis} />
          <Row label="Creation Date" value={formatDate(surgeryCase.creationDate)} />
          <Row label="Expires" value={formatDate(surgeryCase.expires)} />
          <Row label="Uploaded by" value={surgeryCase.createdBy?.name ?? surgeryCase.createdBy?.email} />
        </CardContent>
      </Card>

      {/* Editable clinical + scheduling fields, call tracker, documents */}
      <SurgeryDetailClient surgeryCase={surgeryCase} />
    </div>
  )
}
