"use client"

import { useState, useTransition } from "react"
import { createPipeline, updatePipeline, deletePipeline } from "@/app/actions/pipelines"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import { Pencil, Trash2, Plus, Check, X, ChevronRight } from "lucide-react"
import StageEditor, { type Stage } from "@/components/stage-editor"

const COLOR_OPTIONS = [
  "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899",
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#14b8a6", "#64748b",
]

interface Pipeline {
  id: string
  name: string
  color: string
  order: number
  isActive: boolean
  stages?: Stage[]
  recordCount?: number
}

export default function PipelineManager({ pipelines: initial, objectType = "REFERRAL", recordNoun = "referral" }: { pipelines: Pipeline[]; objectType?: string; recordNoun?: string }) {
  const [pipelines, setPipelines] = useState(initial)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editColor, setEditColor] = useState("")
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newColor, setNewColor] = useState(COLOR_OPTIONS[0])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function startEdit(p: Pipeline) {
    setEditId(p.id)
    setEditName(p.name)
    setEditColor(p.color)
    setError(null)
  }

  function cancelEdit() {
    setEditId(null)
    setError(null)
  }

  function handleSaveEdit(id: string) {
    setError(null)
    startTransition(async () => {
      const res = await updatePipeline(id, { name: editName, color: editColor })
      if ("error" in res) { setError(res.error as string); return }
      setPipelines(prev => prev.map(p => p.id === id ? { ...p, name: editName, color: editColor } : p))
      setEditId(null)
    })
  }

  async function handleDelete(id: string, name: string) {
    if (!(await confirmDialog(`Delete pipeline "${name}"?`))) return
    setError(null)
    startTransition(async () => {
      const res = await deletePipeline(id)
      if ("error" in res) { setError(res.error as string); return }
      setPipelines(prev => prev.filter(p => p.id !== id))
    })
  }

  function handleCreate() {
    if (!newName.trim()) return
    setError(null)
    startTransition(async () => {
      const res = await createPipeline({ name: newName, color: newColor, objectType })
      if ("error" in res) { setError(res.error as string); return }
      if (res.pipeline) {
        setPipelines(prev => [...prev, { ...(res.pipeline as any), stages: (res.pipeline as any).stages ?? [], recordCount: 0 }])
      }
      setNewName("")
      setNewColor(COLOR_OPTIONS[0])
      setCreating(false)
    })
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}

      <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
        {pipelines.map(p => (
          <div key={p.id} className="bg-white">
          <div className="flex items-center gap-3 px-4 py-3">
            {editId === p.id ? (
              <>
                <div className="flex gap-1.5">
                  {COLOR_OPTIONS.map(c => (
                    <button key={c} type="button" onClick={() => setEditColor(c)}
                      className="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-transform hover:scale-110"
                      style={{ backgroundColor: c, borderColor: editColor === c ? "#1e293b" : "transparent" }}>
                      {editColor === c && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                    </button>
                  ))}
                </div>
                <input
                  autoFocus
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSaveEdit(p.id); if (e.key === "Escape") cancelEdit() }}
                  className="flex-1 border border-slate-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
                />
                <button onClick={() => handleSaveEdit(p.id)} disabled={isPending} className="p-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button onClick={cancelEdit} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="p-0.5 text-slate-400 hover:text-slate-700">
                  <ChevronRight className={`h-4 w-4 transition-transform ${expanded === p.id ? "rotate-90" : ""}`} />
                </button>
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                <span className="flex-1 text-sm font-medium text-slate-800">{p.name}</span>
                <span className="text-xs text-slate-400">{p.stages?.length ?? 0} stage{(p.stages?.length ?? 0) !== 1 ? "s" : ""}</span>
                <span className="text-xs text-slate-400">· {p.recordCount ?? 0} {recordNoun}{(p.recordCount ?? 0) !== 1 ? "s" : ""}</span>
                <button onClick={() => startEdit(p)} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => handleDelete(p.id, p.name)} disabled={isPending} className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-50">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
          {expanded === p.id && editId !== p.id && (
            <div className="px-4 pb-3"><StageEditor pipelineId={p.id} stages={p.stages ?? []} /></div>
          )}
          </div>
        ))}

        {creating ? (
          <div className="flex items-center gap-3 px-4 py-3 bg-white">
            <div className="flex gap-1.5">
              {COLOR_OPTIONS.map(c => (
                <button key={c} type="button" onClick={() => setNewColor(c)}
                  className="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-transform hover:scale-110"
                  style={{ backgroundColor: c, borderColor: newColor === c ? "#1e293b" : "transparent" }}>
                  {newColor === c && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                </button>
              ))}
            </div>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false) }}
              placeholder="Pipeline name…"
              className="flex-1 border border-slate-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
            />
            <button onClick={handleCreate} disabled={isPending || !newName.trim()} className="p-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              <Check className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setCreating(false)} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add pipeline
          </button>
        )}
      </div>

      <p className="text-xs text-slate-400">
        Pipelines with existing referrals cannot be deleted. Reassign or archive those referrals first.
      </p>
    </div>
  )
}
