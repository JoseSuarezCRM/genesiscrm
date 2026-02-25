import { prisma } from "@/lib/prisma"
import ReferralForm from "@/components/referral-form"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"

export default async function NewReferralPage() {
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

      <div className="bg-white border rounded-lg p-6">
        <ReferralForm practices={practices} />
      </div>
    </div>
  )
}
