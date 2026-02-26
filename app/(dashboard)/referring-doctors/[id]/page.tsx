import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/status-badge"
import { formatDate } from "@/lib/utils"
import ProviderNotesSection from "@/components/provider-notes-section"

interface Props {
  params: { id: string }
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="text-slate-900 font-medium text-right">{value ?? "—"}</span>
    </div>
  )
}

export default async function ProviderDetailPage({ params }: Props) {
  const provider = await prisma.referringDoctor.findUnique({
    where: { id: params.id },
    include: {
      practice: true,
      locations: { include: { location: true } },
      referrals: {
        orderBy: { referralDate: "desc" },
      },
      providerNotes: {
        orderBy: { createdAt: "desc" },
        include: { createdBy: { select: { name: true, email: true } } },
      },
    },
  })

  if (!provider) notFound()

  const displayName = [provider.title, provider.name].filter(Boolean).join(" ")

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Breadcrumb */}
      <div>
        <Link
          href="/referring-doctors"
          className="inline-flex items-center text-sm text-slate-500 hover:text-slate-800 mb-3"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Referring Providers
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">{displayName}</h1>
        {provider.specialty && (
          <p className="text-sm text-slate-500 mt-0.5">{provider.specialty}</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Provider Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Provider Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Name" value={displayName} />
            <Row label="NPI" value={provider.npi} />
            <Row label="Specialty" value={provider.specialty} />
            <Row label="Phone" value={provider.phone} />
            <Row label="Email" value={provider.email} />
            <Row label="Practice" value={provider.practice.name} />
            <Row
              label="Locations"
              value={
                provider.locations.length > 0
                  ? provider.locations.map((dl) => dl.location.name).join(", ")
                  : undefined
              }
            />
          </CardContent>
        </Card>

        {/* Referral Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Referral Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Total Referrals" value={String(provider.referrals.length)} />
            <Row
              label="Most Recent"
              value={provider.referrals[0] ? formatDate(provider.referrals[0].referralDate) : undefined}
            />
            <Row
              label="Completed"
              value={String(provider.referrals.filter((r) => r.status === "COMPLETED").length)}
            />
            <Row
              label="Scheduled"
              value={String(provider.referrals.filter((r) => r.status === "SCHEDULED").length)}
            />
            <Row
              label="Pending"
              value={String(
                provider.referrals.filter((r) => r.status === "NEW" || r.status === "CONTACTED").length
              )}
            />
          </CardContent>
        </Card>
      </div>

      {/* Referral History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Referral History ({provider.referrals.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {provider.referrals.length === 0 ? (
            <p className="text-sm text-slate-400">No referrals yet from this provider.</p>
          ) : (
            <div className="divide-y">
              {provider.referrals.map((r) => (
                <Link
                  key={r.id}
                  href={`/referrals/${r.id}`}
                  className="flex items-center justify-between gap-4 py-3 hover:bg-slate-50 -mx-2 px-2 rounded-md transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {r.patientFirstName} {r.patientLastName}
                    </p>
                    {r.patientMrn && (
                      <p className="text-xs text-slate-400">MRN: {r.patientMrn}</p>
                    )}
                  </div>
                  <StatusBadge status={r.status} />
                  <span className="text-xs text-slate-400 shrink-0">
                    {formatDate(r.referralDate)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Notes ({provider.providerNotes.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ProviderNotesSection
            providerId={provider.id}
            initialNotes={provider.providerNotes}
          />
        </CardContent>
      </Card>
    </div>
  )
}
