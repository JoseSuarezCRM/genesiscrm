import { prisma } from "@/lib/prisma"
import BroadcastComposer from "@/components/broadcast-composer"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"

export default async function NewBroadcastPage() {
  const [practices, insuranceProviders, emailTemplates] = await Promise.all([
    prisma.referringPractice.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        doctors: { select: { id: true, name: true, title: true } },
      },
    }),
    prisma.referral.findMany({
      where: { insuranceProvider: { not: null } },
      select: { insuranceProvider: true },
      distinct: ["insuranceProvider"],
      orderBy: { insuranceProvider: "asc" },
    }),
    prisma.outreachTemplate.findMany({
      where: { channel: "EMAIL", isActive: true },
      select: { id: true, trigger: true, subject: true, body: true },
      orderBy: { trigger: "asc" },
    }),
  ])

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <Link href="/broadcasts" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-800 mb-4">
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Broadcasts
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">New Broadcast</h1>
        <p className="text-sm text-slate-500 mt-1">Compose and send an email to patients and/or referring providers.</p>
      </div>

      <BroadcastComposer
        practices={practices}
        insuranceOptions={insuranceProviders.map((r) => r.insuranceProvider!)}
        emailTemplates={emailTemplates}
      />
    </div>
  )
}
