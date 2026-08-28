"use client"

import { useState, useTransition } from "react"
import { moveRecordStage } from "@/app/actions/stages"
import StyledSelect from "@/components/ui/styled-select"
import { GitBranch, Clock } from "lucide-react"

interface Stage { id: string; name: string }
interface Pipeline { id: string; name: string; color: string; stages: Stage[] }

function timeInStage(enteredAt: string | null): string {
  if (!enteredAt) return ""
  const ms = Date.now() - new Date(enteredAt).getTime()
  const days = Math.floor(ms / 864e5)
  if (days >= 1) return `${days}d in stage`
  const hrs = Math.floor(ms / 36e5)
  return hrs >= 1 ? `${hrs}h in stage` : `${Math.max(1, Math.floor(ms / 6e4))}m in stage`
}

// Compact stage control on a record detail: shows/moves the record's stage and
// its time-in-stage. Moving logs a StageTransition (feeds the duration fields).
export default function RecordStageControl({ recordType, recordId, pipelines, pipelineId: initialPipeline, stageId: initialStage, enteredAt: initialEntered }: {
  recordType: string; recordId: string; pipelines: Pipeline[]
  pipelineId: string | null; stageId: string | null; enteredAt: string | null
}) {
  const [pipelineId, setPipelineId] = useState(initialPipeline)
  const [stageId, setStageId] = useState(initialStage)
  const [enteredAt, setEnteredAt] = useState(initialEntered)
  const [, startTransition] = useTransition()

  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? null

  function move(pid: string, sid: string) {
    const prev = { pipelineId, stageId, enteredAt }
    setPipelineId(pid); setStageId(sid); setEnteredAt(new Date().toISOString())
    startTransition(async () => {
      const res = await moveRecordStage(recordType, recordId, pid, sid).catch(() => ({ error: "Could not move stage." }))
      if ((res as any)?.error) { setPipelineId(prev.pipelineId); setStageId(prev.stageId); setEnteredAt(prev.enteredAt); alert((res as any).error) }
    })
  }

  if (pipelines.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <GitBranch className="h-3.5 w-3.5 text-zinc-400" />
      {/* Pipeline picker (only when more than one, or none set yet) */}
      {(pipelines.length > 1 || !pipelineId) && (
        <StyledSelect value={pipelineId ?? ""} onChange={(e) => { const p = pipelines.find((x) => x.id === e.target.value); if (p) move(p.id, p.stages[0]?.id ?? "") }} className="h-8 min-w-[140px] text-sm">
          {!pipelineId && <option value="">Add to pipeline…</option>}
          {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </StyledSelect>
      )}
      {pipeline && (
        <StyledSelect value={stageId ?? ""} onChange={(e) => move(pipeline.id, e.target.value)} className="h-8 min-w-[150px] text-sm">
          {!stageId && <option value="">Select stage…</option>}
          {pipeline.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </StyledSelect>
      )}
      {stageId && enteredAt && (
        <span className="inline-flex items-center gap-1 text-xs text-zinc-400"><Clock className="h-3 w-3" /> {timeInStage(enteredAt)}</span>
      )}
    </div>
  )
}
