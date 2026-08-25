"use client"

import { useState, useTransition } from "react"
import { upsertStage, deleteStage } from "@/app/actions/pipelines"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import { Plus, Trash2, Check, X, GripVertical, Pencil } from "lucide-react"

export interface Stage {
  id: string
  name: string
  order: number
  probability: number | null
  isClosed: boolean
  isWon: boolean
  color: string | null
}

// Edit the ordered stages of one pipeline (name, probability, closed/won).
export default function StageEditor({ pipelineId, stages: initial }: { pipelineId: string; stages: Stage[] }) {
  const [stages, setStages] = useState(initial)
  const [editId, setEditId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<Stage>>({})
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState("")
  const [, startTransition] = useTransition()

  function startEdit(s: Stage) { setEditId(s.id); setDraft({ name: s.name, probability: s.probability, isClosed: s.isClosed, isWon: s.isWon }) }
  function saveEdit(id: string) {
    const name = (draft.name ?? "").trim(); if (!name) return
    setStages((ss) => ss.map((x) => x.id === id ? { ...x, name, probability: draft.probability ?? null, isClosed: !!draft.isClosed, isWon: !!draft.isWon } : x))
    setEditId(null)
    startTransition(() => { upsertStage(pipelineId, { id, name, probability: draft.probability ?? null, isClosed: !!draft.isClosed, isWon: !!draft.isWon }).catch(() => {}) })
  }
  function addStage() {
    const name = newName.trim(); if (!name) return
    setAdding(false); setNewName("")
    const temp: Stage = { id: `tmp-${Date.now()}`, name, order: stages.length, probability: null, isClosed: false, isWon: false, color: null }
    setStages((ss) => [...ss, temp])
    startTransition(async () => { await upsertStage(pipelineId, { name }); })
  }
  async function remove(s: Stage) {
    if (!(await confirmDialog(`Delete stage "${s.name}"? Records in it will keep their pipeline but lose the stage.`))) return
    setStages((ss) => ss.filter((x) => x.id !== s.id))
    startTransition(() => { deleteStage(s.id).catch(() => {}) })
  }

  return (
    <div className="space-y-1.5 rounded-lg bg-slate-50/60 p-3">
      <div className="mb-1 grid grid-cols-[16px_1fr_90px_80px_70px_28px] items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        <span /><span>Stage</span><span>Probability</span><span>Closed</span><span>Won</span><span />
      </div>
      {stages.map((s) => (
        <div key={s.id} className="grid grid-cols-[16px_1fr_90px_80px_70px_28px] items-center gap-2 rounded-md bg-white px-1 py-1.5 text-sm">
          <GripVertical className="h-3.5 w-3.5 text-slate-300" />
          {editId === s.id ? (
            <input autoFocus value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") saveEdit(s.id); if (e.key === "Escape") setEditId(null) }}
              className="rounded border border-slate-300 px-1.5 py-0.5 text-sm outline-none focus:border-blue-500" />
          ) : (
            <span className="truncate text-slate-800">{s.name}</span>
          )}
          {editId === s.id ? (
            <input type="number" min={0} max={100} value={draft.probability ?? ""} onChange={(e) => setDraft({ ...draft, probability: e.target.value ? +e.target.value : null })}
              placeholder="—" className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-sm outline-none focus:border-blue-500" />
          ) : (
            <span className="text-slate-500">{s.probability != null ? `${s.probability}%` : "—"}</span>
          )}
          {editId === s.id ? (
            <input type="checkbox" checked={!!draft.isClosed} onChange={(e) => setDraft({ ...draft, isClosed: e.target.checked })} />
          ) : (
            <span className="text-slate-500">{s.isClosed ? "Yes" : "—"}</span>
          )}
          {editId === s.id ? (
            <input type="checkbox" checked={!!draft.isWon} onChange={(e) => setDraft({ ...draft, isWon: e.target.checked })} />
          ) : (
            <span className="text-slate-500">{s.isWon ? "Yes" : "—"}</span>
          )}
          <div className="flex items-center gap-0.5">
            {editId === s.id ? (
              <>
                <button onClick={() => saveEdit(s.id)} className="text-emerald-600"><Check className="h-3.5 w-3.5" /></button>
                <button onClick={() => setEditId(null)} className="text-slate-400"><X className="h-3.5 w-3.5" /></button>
              </>
            ) : (
              <>
                <button onClick={() => startEdit(s)} className="text-slate-400 hover:text-slate-700"><Pencil className="h-3 w-3" /></button>
                <button onClick={() => remove(s)} className="text-slate-400 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
              </>
            )}
          </div>
        </div>
      ))}
      {adding ? (
        <div className="flex items-center gap-2 px-1 py-1">
          <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addStage(); if (e.key === "Escape") setAdding(false) }}
            placeholder="Stage name…" className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm outline-none focus:border-blue-500" />
          <button onClick={addStage} disabled={!newName.trim()} className="rounded-md bg-blue-600 px-2 py-1 text-white disabled:opacity-50"><Check className="h-3.5 w-3.5" /></button>
          <button onClick={() => setAdding(false)} className="text-slate-400"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 px-1 py-1 text-xs font-medium text-blue-600 hover:underline"><Plus className="h-3.5 w-3.5" /> Add stage</button>
      )}
    </div>
  )
}
