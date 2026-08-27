"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createPipeline, updatePipeline, deletePipeline, reorderPipelines, setPipelineColorStyle } from "@/app/actions/pipelines"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import { useCardReorder } from "@/components/use-card-reorder"
import { PipelineChip } from "@/components/pipeline-chip"
import { Plus, Search, Check, X, Copy, MoreHorizontal, GripVertical, Pencil, Trash2 } from "lucide-react"

const COLOR_OPTIONS = ["#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#64748b"]

interface Row { id: string; name: string; color: string; order: number; stageCount: number; recordCount: number }

const STYLES: { key: string; label: string }[] = [
  { key: "text", label: "Text (no color)" },
  { key: "dot", label: "Text with colored dot" },
  { key: "badge", label: "Text in colored badge" },
]

export default function PipelineOverview({ pipelines: initial, objectType, colorStyle: initialStyle, recordNoun, isAdmin }: {
  pipelines: Row[]; objectType: string; colorStyle: string; recordNoun: string; isAdmin: boolean
}) {
  const router = useRouter()
  const [pipelines, setPipelines] = useState(initial)
  const [style, setStyle] = useState(initialStyle)
  const [search, setSearch] = useState("")
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newColor, setNewColor] = useState(COLOR_OPTIONS[0])
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [menuId, setMenuId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const filtered = pipelines.filter((p) => p.name.toLowerCase().includes(search.toLowerCase().trim()))
  const reorder = useCardReorder(filtered, (p) => p.id, (ids) => {
    setPipelines((prev) => ids.map((id) => prev.find((p) => p.id === id)!).filter(Boolean))
    startTransition(() => { reorderPipelines(objectType, ids).catch(() => {}) })
  })

  function pickStyle(s: string) {
    setStyle(s)
    startTransition(() => { setPipelineColorStyle(objectType, s).catch(() => {}) })
  }
  function copyId(id: string) {
    navigator.clipboard?.writeText(id).catch(() => {})
    setCopiedId(id); setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1200)
  }
  function handleCreate() {
    if (!newName.trim()) return
    setError(null)
    startTransition(async () => {
      const res = await createPipeline({ name: newName, color: newColor, objectType })
      if ("error" in res) { setError(res.error as string); return }
      if (res.pipeline) setPipelines((prev) => [...prev, { ...(res.pipeline as any), stageCount: (res.pipeline as any).stages?.length ?? 1, recordCount: 0 }])
      setNewName(""); setNewColor(COLOR_OPTIONS[0]); setCreating(false)
      router.refresh()
    })
  }
  function saveRename(id: string) {
    const name = editName.trim(); if (!name) return
    setPipelines((prev) => prev.map((p) => p.id === id ? { ...p, name } : p))
    setEditId(null); setMenuId(null)
    startTransition(() => { updatePipeline(id, { name }).catch(() => {}) })
  }
  async function handleDelete(p: Row) {
    setMenuId(null)
    if (!(await confirmDialog(`Delete pipeline "${p.name}"?`))) return
    setError(null)
    startTransition(async () => {
      const res = await deletePipeline(p.id)
      if ("error" in res) { setError(res.error as string); return }
      setPipelines((prev) => prev.filter((x) => x.id !== p.id))
    })
  }

  return (
    <div className="space-y-5">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      {/* Display colors */}
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">Set pipeline display colors</p>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
          {STYLES.map((s) => (
            <button key={s.key} onClick={() => isAdmin && pickStyle(s.key)} disabled={!isAdmin}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${style === s.key ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              {s.key === "dot" && <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: style === s.key ? "#fff" : "#3b82f6" }} />}
              {s.key === "badge" ? <span className={`rounded px-1.5 py-0.5 text-xs ${style === s.key ? "bg-white/20" : "bg-teal-500 text-white"}`}>{s.label}</span> : s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search pipelines"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-400" />
        </div>
        <span className="text-sm text-slate-500">{pipelines.length} pipeline{pipelines.length !== 1 ? "s" : ""}</span>
        {isAdmin && !creating && (
          <button onClick={() => setCreating(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Create pipeline
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2.5 font-semibold">Pipeline</th>
              <th className="px-4 py-2.5 text-right font-semibold">Number of stages</th>
              <th className="px-4 py-2.5 text-right font-semibold">Used in</th>
              <th className="px-4 py-2.5 font-semibold">Internal ID</th>
              <th className="w-12 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reorder.order.map((p) => (
              <tr key={p.id} {...reorder.cardProps(p.id)} className={`bg-white transition-colors hover:bg-slate-50 ${reorder.dragging === p.id ? "opacity-50" : ""}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {isAdmin && <span {...reorder.handleProps(p.id)} className="text-slate-300 hover:text-slate-500"><GripVertical className="h-4 w-4" /></span>}
                    {editId === p.id ? (
                      <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveRename(p.id); if (e.key === "Escape") setEditId(null) }}
                        className="rounded border border-slate-300 px-1.5 py-0.5 text-sm outline-none focus:border-blue-500" />
                    ) : (
                      <Link href={`/settings/pipelines/${p.id}`} className="hover:underline">
                        <PipelineChip name={p.name} color={p.color} style={style} />
                      </Link>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-slate-600">{p.stageCount}</td>
                <td className="px-4 py-3 text-right text-slate-600">{p.recordCount} {recordNoun}{p.recordCount !== 1 ? "s" : ""}</td>
                <td className="px-4 py-3">
                  <button onClick={() => copyId(p.id)} className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-500 hover:text-slate-800">
                    {p.id}
                    {copiedId === p.id ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 opacity-60" />}
                  </button>
                </td>
                <td className="relative px-4 py-3 text-right">
                  {isAdmin && (
                    <button onClick={() => setMenuId(menuId === p.id ? null : p.id)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  )}
                  {menuId === p.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />
                      <div className="absolute right-4 top-10 z-20 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                        <Link href={`/settings/pipelines/${p.id}`} className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"><Pencil className="h-3.5 w-3.5 text-slate-400" /> Manage stages</Link>
                        <button onClick={() => { setEditId(p.id); setEditName(p.name); setMenuId(null) }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"><Pencil className="h-3.5 w-3.5 text-slate-400" /> Rename</button>
                        <button onClick={() => handleDelete(p)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                      </div>
                    </>
                  )}
                </td>
              </tr>
            ))}

            {creating && (
              <tr className="bg-white">
                <td className="px-4 py-3" colSpan={5}>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {COLOR_OPTIONS.map((c) => (
                        <button key={c} type="button" onClick={() => setNewColor(c)} className="flex h-5 w-5 items-center justify-center rounded-full border-2 transition-transform hover:scale-110" style={{ backgroundColor: c, borderColor: newColor === c ? "#1e293b" : "transparent" }}>
                          {newColor === c && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                        </button>
                      ))}
                    </div>
                    <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false) }}
                      placeholder="Pipeline name…" className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm outline-none focus:border-blue-500" />
                    <button onClick={handleCreate} disabled={!newName.trim()} className="rounded-md bg-blue-600 p-1.5 text-white hover:bg-blue-700 disabled:opacity-50"><Check className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setCreating(false)} className="p-1.5 text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            )}
            {reorder.order.length === 0 && !creating && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">No pipelines for this object yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">Pipelines with existing {recordNoun}s cannot be deleted. Reassign or archive those records first.</p>
    </div>
  )
}
