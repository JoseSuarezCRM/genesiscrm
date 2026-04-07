import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import PracticeManager from "@/components/practice-manager"

export default async function ReferringDoctorsPage() {
  const session = await auth()
  const isAdmin = (session?.user as { role?: string })?.role === "ADMIN"

  const practices = await prisma.referringPractice.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { referrals: true } },
      locations: {
        orderBy: { name: "asc" },
        include: {
          _count: { select: { referrals: true } },
          // Include doctors linked to this location (for cross-org merged providers)
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
  })

  // Merge direct doctors + cross-org doctors (linked via locations), deduplicated
  const enriched = practices.map((p) => {
    const directIds = new Set(p.doctors.map((d) => d.id))
    // Collect doctors appearing via location links who don't primarily belong here
    const viaLocations = p.locations
      .flatMap((l) => l.doctors.map((dl) => dl.doctor))
      .filter((d) => !directIds.has(d.id))
    // Deduplicate within the via-locations set
    const seen = new Set<string>()
    const uniqueVia = viaLocations.filter((d) => { if (seen.has(d.id)) return false; seen.add(d.id); return true })

    const allDoctors = [...p.doctors, ...uniqueVia].sort((a, b) => b._count.referrals - a._count.referrals)

    // Strip the nested doctors from locations before passing down (avoids type mismatch in manager)
    const locationsClean = p.locations.map(({ doctors: _d, ...rest }) => rest)

    return { ...p, locations: locationsClean, doctors: allDoctors }
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Referring Providers</h1>
          <p className="text-sm text-slate-500">
            {practices.length} practice{practices.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <PracticeManager practices={enriched as any} isAdmin={isAdmin} />
    </div>
  )
}
