"use client"

import StyledSelect from "@/components/ui/styled-select"
import { type RecordFieldDef } from "@/lib/record-field-catalog"

// The create form's Pipeline and Stage fields. Unlike RecordStageControl, these
// only hold a choice — nothing is saved until the record is created.

export interface PickerPipeline { id: string; name: string; stages: { id: string; name: string }[] }

const input = "h-9 w-full px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"

/** Only pipelines with stages can hold a record; the first of them is the default. */
export function placeablePipelines<T extends PickerPipeline>(pipelines: T[]): T[] {
  return pipelines.filter((p) => p.stages.length > 0)
}

/**
 * The position the form will submit. A stage from another pipeline (left over
 * after switching pipeline) falls back to the chosen pipeline's first stage —
 * each field can only set its own value, so the Stage field can't be reset when
 * the Pipeline field changes.
 */
export function effectiveStage(pipelines: PickerPipeline[], pipelineId: unknown, stageId: unknown): { pipelineId: string; stageId: string } | null {
  const usable = placeablePipelines(pipelines)
  const p = usable.find((x) => x.id === pipelineId) ?? usable[0]
  if (!p) return null
  const s = p.stages.find((x) => x.id === stageId) ?? p.stages[0]
  return { pipelineId: p.id, stageId: s.id }
}

/** Catalog entries for the create form, defaulting to the default pipeline's first stage. */
export function pipelineStageFields(pipelines: PickerPipeline[]): RecordFieldDef[] {
  const usable = placeablePipelines(pipelines)
  if (!usable.length) return []
  return [
    {
      key: "__pipeline", label: "Pipeline", type: "select",
      options: usable.map((p) => p.id),
      optionLabels: Object.fromEntries(usable.map((p) => [p.id, p.name])),
      default: usable[0].id,
    },
    { key: "__stage", label: "Stage", type: "select", default: usable[0].stages[0].id },
  ]
}

export function PipelineField({ pipelines, value, onChange }: { pipelines: PickerPipeline[]; value: unknown; onChange: (v: string) => void }) {
  const usable = placeablePipelines(pipelines)
  const current = effectiveStage(pipelines, value, null)
  return (
    <StyledSelect searchable className={input} value={current?.pipelineId ?? ""} onChange={(e) => onChange(e.target.value)}>
      {usable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </StyledSelect>
  )
}

export function StageField({ pipelines, pipelineId, value, onChange }: { pipelines: PickerPipeline[]; pipelineId: unknown; value: unknown; onChange: (v: string) => void }) {
  const current = effectiveStage(pipelines, pipelineId, value)
  const pipeline = placeablePipelines(pipelines).find((p) => p.id === current?.pipelineId)
  return (
    <StyledSelect searchable className={input} value={current?.stageId ?? ""} onChange={(e) => onChange(e.target.value)}>
      {(pipeline?.stages ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </StyledSelect>
  )
}
