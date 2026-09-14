import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import PipelineOverview from "@/components/pipeline-overview"
import PipelineObjectSelect from "@/components/pipeline-object-select"
import { getPipelineColorStyle } from "@/app/actions/pipelines"

// Never serve this from a cache: it's keyed on ?object=, and a stale entry would show
// one object's pipelines while the picker names another.
export const dynamic = "force-dynamic"

export default async function PipelinesPage({ searchParams }: { searchParams: { object?: string } }) {
  const session = await auth()
  if ((session?.user as { role?: string })?.role !== "ADMIN") redirect("/")
  const isAdmin = true

  const requested = searchParams.object ?? "REFERRAL"
  const customObjects = await (prisma as any).customObjectDef.findMany({ orderBy: { order: "asc" }, select: { id: true, key: true, singular: true, plural: true } }).catch(() => [])
  const objects = [
    { key: "REFERRAL", label: "Referrals", noun: "referral", defId: null as string | null },
    ...customObjects.map((c: any) => ({ key: `CO:${c.key}`, label: c.plural, noun: (c.singular || "record").toLowerCase(), defId: c.id as string })),
  ]
  // Resolve the picker and the query from the SAME value, so the page can never label
  // itself with one object while listing another's pipelines.
  const current = objects.find((o) => o.key === requested) ?? objects[0]
  const objectType = current.key

  const rawPipelines = await (prisma as any).pipeline.findMany({
    where: { objectType },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { stages: true } } },
  })
  const colorStyle = await getPipelineColorStyle(objectType)
  const pipelines = await Promise.all(rawPipelines.map(async (p: any) => {
    // Scope the count to the selected object too — a count is meaningless if it can
    // include records of a different object that happen to reference the pipeline.
    const recordCount = objectType === "REFERRAL"
      ? await prisma.referral.count({ where: { pipelineId: p.id } })
      : await (prisma as any).customObjectRecord.count({ where: { pipelineId: p.id, objectDefId: current.defId ?? "__none__" } })
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

      <PipelineObjectSelect objects={objects.map((o) => ({ key: o.key, label: o.label }))} value={current.key} />

      <PipelineOverview pipelines={pipelines} objectType={current.key} colorStyle={colorStyle} recordNoun={current.noun} isAdmin={isAdmin} />
    </div>
  )
}
