import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import PipelineManage from "@/components/pipeline-manage"
import { getPipelineColorStyle } from "@/app/actions/pipelines"

export default async function ManagePipelinePage({ params }: { params: { id: string } }) {
  const session = await auth()
  if ((session?.user as { role?: string })?.role !== "ADMIN") redirect("/")

  const pipeline = await (prisma as any).pipeline.findUnique({
    where: { id: params.id },
    include: { stages: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] } },
  })
  if (!pipeline) notFound()
  const objectType: string = pipeline.objectType

  // Sibling pipelines (same object) for the switcher.
  const siblings = await (prisma as any).pipeline.findMany({
    where: { objectType, isActive: true }, orderBy: [{ order: "asc" }, { createdAt: "asc" }], select: { id: true, name: true },
  })

  // Per-stage record counts.
  const grouped = objectType === "REFERRAL"
    ? await prisma.referral.groupBy({ by: ["stageId"], where: { pipelineId: params.id }, _count: { _all: true } }).catch(() => [])
    : await (prisma as any).customObjectRecord.groupBy({ by: ["stageId"], where: { pipelineId: params.id }, _count: { _all: true } }).catch(() => [])
  const stageCounts: Record<string, number> = {}
  for (const g of grouped as any[]) if (g.stageId) stageCounts[g.stageId] = g._count._all

  const colorStyle = await getPipelineColorStyle(objectType)

  // Friendly object label + record noun.
  let objectLabel = "Referrals", recordNoun = "referral"
  if (objectType.startsWith("CO:")) {
    const def = await (prisma as any).customObjectDef.findUnique({ where: { key: objectType.slice(3) }, select: { plural: true, singular: true } }).catch(() => null)
    objectLabel = def?.plural ?? objectType
    recordNoun = (def?.singular ?? "record").toLowerCase()
  }

  return (
    <div className="max-w-5xl space-y-5 p-6">
      <PipelineManage
        pipeline={{ id: pipeline.id, name: pipeline.name, color: pipeline.color, objectType }}
        stages={pipeline.stages.map((s: any) => ({ id: s.id, name: s.name, order: s.order, probability: s.probability, isClosed: s.isClosed, isWon: s.isWon, color: s.color, recordCount: stageCounts[s.id] ?? 0 }))}
        siblings={siblings}
        colorStyle={colorStyle}
        objectLabel={objectLabel}
        recordNoun={recordNoun}
      />
    </div>
  )
}
