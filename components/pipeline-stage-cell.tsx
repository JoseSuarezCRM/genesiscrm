"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Loader2, X } from "lucide-react"
import StyledSelect from "@/components/ui/styled-select"
import { PipelineChip } from "@/components/pipeline-chip"
import { moveRecordStage } from "@/app/actions/stages"
import { showToast } from "@/components/toast"

// Inline "Edit pipeline and stage" for a list row.
//
// Pipeline and stage are edited TOGETHER on purpose: a stage belongs to exactly one
// pipeline, so changing the pipeline invalidates the current stage. Two independent
// cell editors would let you save a record into a stage that isn't in its pipeline.

export interface PipelineOption {
  id: string
  name: string
  color: string
  stages: { id: string; name: string; color: string | null }[]
}

export default function PipelineStageCell({
  objectType, recordId, pipelines, pipelineId, stageId, canEdit, show, colorStyle = "dot", onSaved,
}: {
  objectType: string          // "CO:<key>"
  recordId: string
  pipelines: PipelineOption[]
  pipelineId: string | null
  stageId: string | null
  canEdit: boolean
  /** Which half this cell renders — the popover edits both either way. */
  show: "pipeline" | "stage"
  colorStyle?: string
  onSaved: (next: { pipelineId: string; stageId: string }) => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [draftPipeline, setDraftPipeline] = useState(pipelineId ?? pipelines[0]?.id ?? "")
  const [draftStage, setDraftStage] = useState(stageId ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? null
  const stage = pipeline?.stages.find((s) => s.id === stageId) ?? null
  const draftStages = pipelines.find((p) => p.id === draftPipeline)?.stages ?? []

  useEffect(() => {
    if (!open) return
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect(); if (!r) return
      // Keep the panel on screen when the cell is near the right edge or the fold.
      const w = 300, h = 260
      setPos({
        left: Math.min(r.left, window.innerWidth - w - 12),
        top: r.bottom + h > window.innerHeight ? Math.max(8, r.top - h) : r.bottom + 4,
      })
    }
    place()
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return
      if ((t as Element)?.closest?.("[data-select-menu-open]")) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    window.addEventListener("scroll", place, true)
    window.addEventListener("resize", place)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("scroll", place, true)
      window.removeEventListener("resize", place)
    }
  }, [open])

  function startEdit() {
    if (!canEdit || pipelines.length === 0) return
    setDraftPipeline(pipelineId ?? pipelines[0]?.id ?? "")
    setDraftStage(stageId ?? "")
    setError(null)
    setOpen(true)
  }

  function save() {
    if (!draftPipeline || !draftStage) { setError("Pick a pipeline and a stage."); return }
    setSaving(true); setError(null)
    // moveRecordStage enforces the pipeline's transition rules and required-to-enter
    // fields, and logs the StageTransition the durations engine reads.
    moveRecordStage(objectType, recordId, draftPipeline, draftStage)
      .then((res: any) => {
        setSaving(false)
        if (res?.error) { setError(res.error); return }
        setOpen(false)
        onSaved({ pipelineId: draftPipeline, stageId: draftStage })
        showToast("Pipeline updated")
      })
      .catch(() => { setSaving(false); setError("Couldn't save that change.") })
  }

  const label = show === "pipeline"
    ? (pipeline ? <PipelineChip name={pipeline.name} color={pipeline.color} style={colorStyle} /> : <span className="text-slate-300">—</span>)
    : (stage ? <PipelineChip name={stage.name} color={stage.color ?? "#94a3b8"} style={colorStyle} /> : <span className="text-slate-300">—</span>)

  return (
    <>
      <button ref={btnRef} onClick={startEdit} disabled={!canEdit || pipelines.length === 0}
        className="flex h-full w-full items-center px-3 py-2.5 text-left hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-transparent">
        <span className="min-w-0 truncate">{label}</span>
      </button>

      {open && pos && typeof document !== "undefined" && createPortal(
        <div ref={panelRef} className="fixed z-[100] w-[300px] rounded-xl border border-slate-200 bg-white p-4 shadow-2xl"
          style={{ left: pos.left, top: pos.top }}>
          <div className="mb-3 flex items-start justify-between">
            <p className="text-sm font-semibold text-slate-900">Edit pipeline and stage</p>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">Pipeline</label>
              <StyledSelect value={draftPipeline}
                onChange={(e) => {
                  const next = e.target.value
                  setDraftPipeline(next)
                  // The old stage belongs to the old pipeline — keep it only if it's
                  // still valid, otherwise fall back to that pipeline's first stage.
                  const stages = pipelines.find((p) => p.id === next)?.stages ?? []
                  setDraftStage(stages.some((s) => s.id === draftStage) ? draftStage : stages[0]?.id ?? "")
                }}
                className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm">
                {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </StyledSelect>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">Stage</label>
              <StyledSelect value={draftStage} onChange={(e) => setDraftStage(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm">
                <option value="">— Pick a stage —</option>
                {draftStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </StyledSelect>
              {draftStages.length === 0 && <p className="text-[11px] text-amber-600">That pipeline has no stages yet.</p>}
            </div>

            {error && <p className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">{error}</p>}

            <div className="flex items-center gap-2 pt-1">
              <button onClick={save} disabled={saving || !draftStage}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
              </button>
              <button onClick={() => setOpen(false)} className="h-8 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:border-slate-400">Cancel</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
