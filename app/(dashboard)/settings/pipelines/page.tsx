import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import PipelineManager from "@/components/pipeline-manager"

export default async function PipelinesPage() {
  const session = await auth()
  if ((session?.user as { role?: string })?.role !== "ADMIN") redirect("/")

  const pipelines = await prisma.pipeline.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { referrals: true } } },
  })

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Referral Pipelines</h1>
        <p className="text-sm text-slate-500 mt-1">
          Create and manage pipelines to separate referral types (e.g. Clinical, PT, Surgery).
        </p>
      </div>
      <PipelineManager pipelines={pipelines} />
    </div>
  )
}
