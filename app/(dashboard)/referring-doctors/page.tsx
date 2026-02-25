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
        include: { _count: { select: { referrals: true } } },
      },
      doctors: {
        orderBy: { name: "asc" },
        include: {
          _count: { select: { referrals: true } },
          locations: {
            include: { location: { select: { id: true, name: true } } },
          },
        },
      },
    },
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Referring Doctors</h1>
          <p className="text-sm text-slate-500">
            {practices.length} practice{practices.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <PracticeManager practices={practices} isAdmin={isAdmin} />
    </div>
  )
}
