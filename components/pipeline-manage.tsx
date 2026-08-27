"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { upsertStage, deleteStage, reorderStages, updatePipeline, deletePipeline } from "@/app/actions/pipelines"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import { useCardReorder } from "@/components/use-card-reorder"
import { ChevronLeft, ChevronDown, Plus, Check, X, Copy, GripVertical, Trash2 } from "lucide-react"

interface Stage { id: string; name: string; order: number; probability: number | null; isClosed: boolean; isWon: boolean; color: string | null; recordCount: number }
interface Sibling { id: string; name: string }

const TABS = ["Configure", "Pipeline Rules", "Automate", "Tags"] as const
const PCT = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

// The probability cell's current selection encodes Won/Lost terminal stages.
function probValue(s: Stage): string {
  if (s.isWon) return "won"
  if (s.isClosed && !s.isWon) return "lost"
  return s.probability != null ? String(s.probability) : ""
}
function probPatch(v: string): Partial<Stage> {
  if (v === "won") return { probability: 100, isClosed: true, isWon: true }
  if (v === "lost") return { probability: 0, isClosed: true, isWon: false }
  return { probability: v === "" ? null : Number(v), isClosed: false, isWon: false }
}

export default function PipelineManage({ pipeline, stages: initial, siblings, colorStyle, objectLabel, recordNoun }: {
  pipeline: { id: string; name: string; color: string; objectType: string }
  stages: Stage[]; siblings: Sibling[]; colorStyle: string; objectLabel: string; recordNoun: string
}) {
  const router = useRouter()
  const [tab, setTab] = useState<(typeof TABS)[number]>("Configure")
  const [stages, setStages] = useState(initial)
  const [editId, setEditId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState("")
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState("")
  const [copied, setCopied] = useState<string | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [, startTransition] = useTransition()

  const reorder = useCardReorder(stages, (s) => s.id, (ids) => {
    setStages((prev) => ids.map((id) => prev.find((s) => s.id === id)!).filter(Boolean))
    startTransition(() => { reorderStages(pipeline.id, ids).catch(() => {}) })
  })

  function saveStage(id: string, patch: Partial<Stage>) {
    setStages((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s))
    const s = { ...stages.find((x) => x.id === id)!, ...patch }
    startTransition(() => { upsertStage(pipeline.id, { id, name: s.name, probability: s.probability, isClosed: s.isClosed, isWon: s.isWon }).catch(() => {}) })
  }
  function commitName(id: string) {
    const name = draftName.trim(); if (!name) { setEditId(null); return }
    saveStage(id, { name }); setEditId(null)
  }
  function addStage() {
    const name = newName.trim(); if (!name) return
    setAdding(false); setNewName("")
    startTransition(async () => { await upsertStage(pipeline.id, { name }); router.refresh() })
  }
  async function removeStage(s: Stage) {
    if (!(await confirmDialog(`Delete stage "${s.name}"? Records in it keep their pipeline but lose the stage.`))) return
    setStages((prev) => prev.filter((x) => x.id !== s.id))
    startTransition(() => { deleteStage(s.id).catch(() => {}) })
  }
  function copyId(id: string) { navigator.clipboard?.writeText(id).catch(() => {}); setCopied(id); setTimeout(() => setCopied((c) => c === id ? null : c), 1200) }
  async function renamePipeline() {
    setActionsOpen(false)
    const name = window.prompt("Rename pipeline", pipeline.name)?.trim()
    if (!name) return
    startTransition(async () => { await updatePipeline(pipeline.id, { name }); router.refresh() })
  }
  async function removePipeline() {
    setActionsOpen(false)
    if (!(await confirmDialog(`Delete pipeline "${pipeline.name}"?`))) return
    startTransition(async () => { const r = await deletePipeline(pipeline.id); if ((r as any)?.error) { alert((r as any).error); return } router.push("/settings/pipelines" + (pipeline.objectType === "REFERRAL" ? "" : `?object=${encodeURIComponent(pipeline.objectType)}`)) })
  }

  const sel = "h-8 rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-slate-400"

  return (
    <div className="space-y-5">
      <Link href={`/settings/pipelines${pipeline.objectType === "REFERRAL" ? "" : `?object=${encodeURIComponent(pipeline.objectType)}`}`}
        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"><ChevronLeft className="h-4 w-4" /> Back to Pipelines</Link>

      <div className="flex items-start justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Manage {pipeline.name}</h1>
        <div className="relative">
          <button onClick={() => setActionsOpen((o) => !o)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:border-slate-400">
            Actions <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </button>
          {actionsOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setActionsOpen(false)} />
              <div className="absolute right-0 top-10 z-20 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                <button onClick={renamePipeline} className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50">Rename pipeline</button>
                <button onClick={removePipeline} className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50">Delete pipeline</button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Pipeline switcher */}
      <div className="flex items-center gap-3">
        <select value={pipeline.id} onChange={(e) => router.push(`/settings/pipelines/${e.target.value}`)} className={`${sel} h-9 min-w-[220px] font-medium`}>
          {siblings.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span className="text-xs text-slate-400">{objectLabel}</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-1 pb-2.5 text-sm font-medium transition-colors ${tab === t ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Configure" ? (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5 font-semibold">Stage name</th>
                <th className="px-3 py-2.5 font-semibold">Probability</th>
                <th className="px-3 py-2.5 text-right font-semibold">Used in</th>
                <th className="px-3 py-2.5 font-semibold">Stage ID</th>
                <th className="w-10 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reorder.order.map((s) => (
                <tr key={s.id} {...reorder.cardProps(s.id)} className={`bg-white transition-colors hover:bg-slate-50 ${reorder.dragging === s.id ? "opacity-50" : ""}`}>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span {...reorder.handleProps(s.id)} className="text-slate-300 hover:text-slate-500"><GripVertical className="h-4 w-4" /></span>
                      {editId === s.id ? (
                        <input autoFocus value={draftName} onChange={(e) => setDraftName(e.target.value)}
                          onBlur={() => commitName(s.id)} onKeyDown={(e) => { if (e.key === "Enter") commitName(s.id); if (e.key === "Escape") setEditId(null) }}
                          className="w-full max-w-[220px] rounded border border-slate-300 px-2 py-1 text-sm outline-none focus:border-blue-500" />
                      ) : (
                        <button onClick={() => { setEditId(s.id); setDraftName(s.name) }} className="rounded px-1 py-0.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-100">{s.name}</button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <select value={probValue(s)} onChange={(e) => saveStage(s.id, probPatch(e.target.value))}
                      className={`${sel} ${s.isWon ? "text-emerald-600" : s.isClosed ? "text-red-600" : "text-slate-700"}`}>
                      <option value="">—</option>
                      {PCT.map((p) => <option key={p} value={p}>{p}%</option>)}
                      <option value="won">Won (100%)</option>
                      <option value="lost">Lost (0%)</option>
                    </select>
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{s.recordCount} {recordNoun}{s.recordCount !== 1 ? "s" : ""}</td>
                  <td className="px-3 py-2.5">
                    <button onClick={() => copyId(s.id)} className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-500 hover:text-slate-800">
                      {s.id}{copied === s.id ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 opacity-60" />}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button onClick={() => removeStage(s)} className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              ))}
              <tr className="bg-white">
                <td className="px-3 py-2.5" colSpan={5}>
                  {adding ? (
                    <div className="flex items-center gap-2">
                      <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") addStage(); if (e.key === "Escape") setAdding(false) }}
                        placeholder="Stage name…" className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm outline-none focus:border-blue-500" />
                      <button onClick={addStage} disabled={!newName.trim()} className="rounded-md bg-blue-600 p-1.5 text-white hover:bg-blue-700 disabled:opacity-50"><Check className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setAdding(false)} className="p-1.5 text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ) : (
                    <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"><Plus className="h-4 w-4" /> Add stage</button>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-12 text-center text-sm text-slate-400">
          {tab} — coming soon.
        </div>
      )}
    </div>
  )
}
