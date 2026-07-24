import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { requireView } from "@/lib/auth-guard"
import PracticeManager from "@/components/practice-manager"
import { getProviderViews } from "@/app/actions/provider-views"
import { getViewShareOptions } from "@/app/actions/view-share-options"
import { userCan, userCanLevel } from "@/lib/permissions"

export default async function PracticesPage({ searchParams }: { searchParams?: { sort?: string } }) {
  const session = await requireView("PRACTICES")
  const canManage = userCanLevel(session?.user as any, "PRACTICES", "EDIT")
  const currentUserId = (session?.user as any)?.id ?? ""

  // "View all" from the reporting page's Top Referring Practices links here with
  // ?sort=referrals so the list opens ranked by referral volume.
  const orderBy =
    searchParams?.sort === "referrals"
      ? ({ referrals: { _count: "desc" } } as const)
      : ({ name: "asc" } as const)

  const [practices, savedViews, shareOptions] = await Promise.all([
    prisma.referringPractice.findMany({
      orderBy,
      include: {
        _count: { select: { referrals: true } },
        locations: {
          orderBy: { referrals: { _count: "desc" } },
          include: {
            _count: { select: { referrals: true } },
            doctors: {
              include: {
                doctor: {
                  include: {
                    _count: { select: { referrals: true } },
                    locations: { include: { location: { select: { id: true, name: true } } } },
                  },
                },
              },
            },
          },
        },
        doctors: {
          orderBy: { referrals: { _count: "desc" } },
          include: {
            _count: { select: { referrals: true } },
            locations: { include: { location: { select: { id: true, name: true } } } },
          },
        },
      },
    }),
    getProviderViews(),
    getViewShareOptions(),
  ])

  // A provider belongs to its own practice (the FK) — we do NOT pull in providers
  // merely linked through a shared location, so the list matches the record page.
  const enriched = practices.map((p) => {
    const allDoctors = [...p.doctors].sort((a, b) => b._count.referrals - a._count.referrals)
    const locationsClean = p.locations.map(({ doctors: _d, ...rest }) => rest)
    return { ...p, locations: locationsClean, doctors: allDoctors }
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Practices</h1>
          <p className="text-sm text-slate-500">
            {practices.length} practice{practices.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <PracticeManager
        practices={enriched as any}
        isAdmin={canManage}
        currentUserId={currentUserId}
        savedViews={savedViews as any}
        shareUsers={shareOptions.users as any}
        shareTeams={shareOptions.teams as any}
        view="practices"
      />
    </div>
  )
}
