import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { requireView } from "@/lib/auth-guard"
import { userCan, userCanLevel } from "@/lib/permissions"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import PracticeDetailClient from "@/components/practice-detail-client"
import { loadCustomPropertiesForDetail } from "@/lib/custom-properties-loader"
import RecordActivityFeed from "@/components/record-activity-feed"
import { listRecordActivities } from "@/app/actions/record-activity"

interface Props { params: { id: string } }

export default async function PracticeDetailPage({ params }: Props) {
  const session = await requireView("PRACTICES")
  const isAdmin = userCanLevel(session?.user as any, "PRACTICES", "EDIT")

  const [practice, referrals, customProperties] = await Promise.all([
    prisma.referringPractice.findUnique({
      where: { id: params.id },
      include: {
        _count: { select: { referrals: true } },
        locations: {
          orderBy: { name: "asc" },
          include: { _count: { select: { referrals: true } } },
        },
        doctors: {
          orderBy: { name: "asc" },
          include: {
            _count: { select: { referrals: true } },
            locations: { include: { location: { select: { id: true, name: true } } } },
          },
        },
      },
    }),
    prisma.referral.findMany({
      where: { referringPracticeId: params.id },
      orderBy: { referralDate: "desc" },
      take: 100,
      select: {
        id: true,
        patientFirstName: true,
        patientLastName: true,
        referralDate: true,
        status: true,
        referringDoctor: { select: { id: true, name: true, title: true } },
      },
    }),
    loadCustomPropertiesForDetail("PRACTICE", params.id),
  ])

  if (!practice) notFound()

  const [activityItems, feedUsers] = await Promise.all([
    listRecordActivities("PRACTICE", practice.id),
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ])

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div>
        <Link href="/referring-doctors" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-800 mb-3">
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Referring Providers
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{practice.name}</h1>
          <span className="text-sm text-slate-400">{practice._count.referrals} referral{practice._count.referrals !== 1 ? "s" : ""}</span>
        </div>
        {practice.phone && <p className="text-sm text-slate-500 mt-0.5">{practice.phone}</p>}
      </div>

      <PracticeDetailClient practice={practice as any} referrals={referrals as any} isAdmin={isAdmin} customProperties={customProperties} />

      {/* Activity feed (notes, tasks, activities) */}
      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">Activity</h2>
        <RecordActivityFeed
          recordType="PRACTICE"
          recordId={practice.id}
          items={activityItems as any}
          users={feedUsers.map((u) => ({ id: u.id, label: u.name ?? u.email }))}
          canEdit={isAdmin}
        />
      </div>
    </div>
  )
}
