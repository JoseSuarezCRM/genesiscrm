import { prisma } from "@/lib/prisma"
import NewReferralPage from "@/components/new-referral-page"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"

export default async function NewReferralServerPage() {
  const [practices, pipelines] = await Promise.all([
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
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <Link
          href="/referrals"
          className="inline-flex items-center text-sm text-slate-500 hover:text-slate-800 mb-4"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Referrals
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">New Referral</h1>
        <p className="text-sm text-slate-500">
          Add a new inbound patient referral.
        </p>
      </div>

      <NewReferralPage practices={practices} pipelines={pipelines} />
    </div>
  )
}
