import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { requireView } from "@/lib/auth-guard"
import { getCustomObject } from "@/app/actions/custom-objects"
import { pipelinesForObject } from "@/lib/stages/core"
import { getBoardData } from "@/app/actions/stages"
import { getPipelineColorStyle } from "@/app/actions/pipelines"
import PipelineSelector from "@/components/pipeline-selector"
import KanbanBoard from "@/components/kanban-board"
import { LayoutList } from "lucide-react"

export default async function ObjectBoardPage({ params, searchParams }: { params: { key: string }; searchParams: { pipeline?: string } }) {
  const def = await getCustomObject(params.key)
  if (!def) notFound()
  await requireView(`CO:${params.key}`)

  const pipelines = await pipelinesForObject(`CO:${params.key}`)
  const board = await getBoardData(params.key, searchParams.pipeline ?? pipelines[0]?.id)
  const colorStyle = await getPipelineColorStyle(`CO:${params.key}`)

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{def.plural} · Board</h1>
          <p className="text-sm text-slate-500">Drag a card to move it between stages.</p>
        </div>
        <Link href={`/objects/${params.key}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 hover:border-zinc-400">
          <LayoutList className="h-3.5 w-3.5" /> Table view
        </Link>
      </div>

      {pipelines.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center text-sm text-zinc-500">
          No pipelines yet. <Link href={`/settings/pipelines?object=CO:${params.key}`} className="text-blue-600 hover:underline">Create a pipeline & stages</Link> to use the board.
        </div>
      ) : (
        <>
          <PipelineSelector
            pipelines={pipelines.map((p) => ({ id: p.id, name: p.name, color: p.color }))}
            activePipelineId={board.pipeline?.id ?? null}
            managePath={`/settings/pipelines?object=CO:${params.key}`}
            colorStyle={colorStyle}
          />
          {board.pipeline && board.stages.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center text-sm text-zinc-500">
              This pipeline has no stages yet. <Link href={`/settings/pipelines?object=CO:${params.key}`} className="text-blue-600 hover:underline">Add stages</Link>.
            </div>
          ) : board.pipeline ? (
            <KanbanBoard recordType={`CO:${params.key}`} hrefBase={`/objects/${params.key}`} pipelineId={board.pipeline.id} stages={board.stages} cards={board.cards} colorStyle={colorStyle} />
          ) : null}
        </>
      )}
    </div>
  )
}
