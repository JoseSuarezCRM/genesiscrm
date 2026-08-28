import Link from "next/link"
import { requireView } from "@/lib/auth-guard"
import { pipelinesForObject } from "@/lib/stages/core"
import { getReferralBoardData } from "@/app/actions/stages"
import { getPipelineColorStyle } from "@/app/actions/pipelines"
import PipelineSelector from "@/components/pipeline-selector"
import KanbanBoard from "@/components/kanban-board"
import { LayoutList } from "lucide-react"

export default async function ReferralBoardPage({ searchParams }: { searchParams: { pipeline?: string } }) {
  await requireView("REFERRALS")

  const pipelines = await pipelinesForObject("REFERRAL")
  const board = await getReferralBoardData(searchParams.pipeline ?? pipelines[0]?.id)
  const colorStyle = await getPipelineColorStyle("REFERRAL")

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Referrals · Board</h1>
          <p className="text-sm text-slate-500">Drag a card to move it between stages.</p>
        </div>
        <Link href="/referrals" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 hover:border-zinc-400">
          <LayoutList className="h-3.5 w-3.5" /> Table view
        </Link>
      </div>

      {pipelines.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center text-sm text-zinc-500">
          No pipelines yet. <Link href="/settings/pipelines" className="text-blue-600 hover:underline">Create a pipeline &amp; stages</Link> to use the board.
        </div>
      ) : (
        <>
          <PipelineSelector
            pipelines={pipelines.map((p) => ({ id: p.id, name: p.name, color: p.color }))}
            activePipelineId={board.pipeline?.id ?? null}
            managePath="/settings/pipelines"
            colorStyle={colorStyle}
          />
          {board.pipeline && board.stages.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center text-sm text-zinc-500">
              This pipeline has no stages yet. <Link href={`/settings/pipelines/${board.pipeline.id}`} className="text-blue-600 hover:underline">Add stages</Link>.
            </div>
          ) : board.pipeline ? (
            <KanbanBoard recordType="REFERRAL" hrefBase="/referrals" pipelineId={board.pipeline.id} stages={board.stages} cards={board.cards} colorStyle={colorStyle} />
          ) : null}
        </>
      )}
    </div>
  )
}
