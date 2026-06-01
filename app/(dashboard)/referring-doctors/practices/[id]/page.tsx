import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import PracticeDetailClient from "@/components/practice-detail-client"

interface Props { params: { id: string } }

export default async function PracticeDetailPage({ params }: Props) {
  const session = await auth()
  const isAdmin = (session?.user as { role?: string })?.role === "ADMIN"

  const practice = await prisma.referringPractice.findUnique({
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
  })

  if (!practice) notFound()

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
      </div>

      <PracticeDetailClient practice={practice as any} isAdmin={isAdmin} />
    </div>
  )
}
