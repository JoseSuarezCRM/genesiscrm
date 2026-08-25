import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import PipelineManager from "@/components/pipeline-manager"

export default async function PipelinesPage({ searchParams }: { searchParams: { object?: string } }) {
  const session = await auth()
  if ((session?.user as { role?: string })?.role !== "ADMIN") redirect("/")

  const objectType = searchParams.object ?? "REFERRAL"
  const customObjects = await (prisma as any).customObjectDef.findMany({ orderBy: { order: "asc" }, select: { key: true, singular: true, plural: true } }).catch(() => [])
  const objects = [{ key: "REFERRAL", label: "Referrals", noun: "referral" }, ...customObjects.map((c: any) => ({ key: `CO:${c.key}`, label: c.plural, noun: (c.singular || "record").toLowerCase() }))]
  const current = objects.find((o) => o.key === objectType) ?? objects[0]

  const rawPipelines = await (prisma as any).pipeline.findMany({
    where: { objectType },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { stages: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] } },
  })
  // Record counts per pipeline (referrals or custom-object records).
  const pipelines = await Promise.all(rawPipelines.map(async (p: any) => {
    const recordCount = objectType === "REFERRAL"
      ? await prisma.referral.count({ where: { pipelineId: p.id } })
      : await (prisma as any).customObjectRecord.count({ where: { pipelineId: p.id } })
    return { ...p, recordCount }
  }))

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pipelines & Stages</h1>
        <p className="text-sm text-slate-500 mt-1">
          Create pipelines and their stages for an object. Records move through stages and the time spent
          in each stage is tracked automatically.
        </p>
      </div>

      {/* Object selector */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">Object:</span>
        {objects.map((o) => (
          <Link key={o.key} href={`/settings/pipelines?object=${encodeURIComponent(o.key)}`}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${o.key === current.key ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}>
            {o.label}
          </Link>
        ))}
      </div>

      <PipelineManager pipelines={pipelines} objectType={current.key} recordNoun={current.noun} />
    </div>
  )
}
