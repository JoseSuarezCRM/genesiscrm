import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import PipelineOverview from "@/components/pipeline-overview"
import { getPipelineColorStyle } from "@/app/actions/pipelines"

export default async function PipelinesPage({ searchParams }: { searchParams: { object?: string } }) {
  const session = await auth()
  if ((session?.user as { role?: string })?.role !== "ADMIN") redirect("/")
  const isAdmin = true

  const objectType = searchParams.object ?? "REFERRAL"
  const customObjects = await (prisma as any).customObjectDef.findMany({ orderBy: { order: "asc" }, select: { key: true, singular: true, plural: true } }).catch(() => [])
  const objects = [{ key: "REFERRAL", label: "Referrals", noun: "referral" }, ...customObjects.map((c: any) => ({ key: `CO:${c.key}`, label: c.plural, noun: (c.singular || "record").toLowerCase() }))]
  const current = objects.find((o) => o.key === objectType) ?? objects[0]

  const rawPipelines = await (prisma as any).pipeline.findMany({
    where: { objectType },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { stages: true } } },
  })
  const colorStyle = await getPipelineColorStyle(objectType)
  const pipelines = await Promise.all(rawPipelines.map(async (p: any) => {
    const recordCount = objectType === "REFERRAL"
      ? await prisma.referral.count({ where: { pipelineId: p.id } })
      : await (prisma as any).customObjectRecord.count({ where: { pipelineId: p.id } })
    return { id: p.id, name: p.name, color: p.color, order: p.order, stageCount: p._count.stages, recordCount }
  }))

  return (
    <div className="max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pipelines &amp; Stages</h1>
        <p className="mt-1 text-sm text-slate-500">
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

      <PipelineOverview pipelines={pipelines} objectType={current.key} colorStyle={colorStyle} recordNoun={current.noun} isAdmin={isAdmin} />
    </div>
  )
}
