import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { userCan, userCanLevel } from "@/lib/permissions"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, Building2, MapPin } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/status-badge"
import { formatDate } from "@/lib/utils"
import ProviderNotesSection from "@/components/provider-notes-section"
import ProviderInfoEditor from "@/components/provider-info-editor"
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
  const session = await auth()
  const isAdmin = userCanLevel(session?.user as any, "PROVIDERS", "EDIT")

  const [provider, activities, allPractices, customProperties] = await Promise.all([
    prisma.referringDoctor.findUnique({
      where: { id: params.id },
      include: {
        practice: true,
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

  if (!provider) notFound()

  const isPrefixTitle = provider.title?.startsWith("Dr")
  const displayName = provider.title
    ? isPrefixTitle ? `${provider.title} ${provider.name}` : `${provider.name}, ${provider.title}`
    : provider.name

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div>
        <Link href="/referring-doctors" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-800 mb-3">
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Referring Providers
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">{displayName}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ProviderInfoEditor
          provider={provider as any}
          allPractices={allPractices as any}
          isAdmin={isAdmin}
        />

        {/* Referral Summary */}
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
      </div>

      {/* Referral History */}
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

      {/* Custom Properties */}
      {customProperties.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <CustomPropertiesDisplay
              entityType="PROVIDER"
              entityId={provider.id}
              properties={customProperties}
            />
          </CardContent>
        </Card>
      )}

      {/* Activities */}
      <Card>
        <CardHeader><CardTitle className="text-base">Activities ({activities.length})</CardTitle></CardHeader>
        <CardContent>
          {activities.length === 0 ? (
            <p className="text-sm text-slate-400">No activities logged for this provider yet.</p>
          ) : (
            <div className="space-y-3">
              {activities.map((a) => (
                <div key={a.id} className="flex items-start gap-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="shrink-0 w-12 text-center">
                    <p className="text-xs font-semibold text-blue-600 uppercase">{format(a.date, "MMM")}</p>
                    <p className="text-xl font-bold text-slate-800 leading-none">{format(a.date, "d")}</p>
                    <p className="text-xs text-slate-400">{format(a.date, "yyyy")}</p>
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {a.practice && <span className="flex items-center gap-1 text-sm font-medium text-slate-800"><Building2 className="h-3.5 w-3.5 text-slate-400" />{a.practice.name}</span>}
                      {a.location && <span className="flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" />{a.location.name}</span>}
                    </div>
                    {a.notes && <p className="text-sm text-slate-600">{a.notes}</p>}
                    <p className="text-xs text-slate-400">Logged by {a.createdBy.name ?? a.createdBy.email}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader><CardTitle className="text-base">Notes ({provider.providerNotes.length})</CardTitle></CardHeader>
        <CardContent>
          <ProviderNotesSection providerId={provider.id} initialNotes={provider.providerNotes} />
        </CardContent>
      </Card>
    </div>
  )
}
