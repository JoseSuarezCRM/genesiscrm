"use client"

import { useState, useEffect, useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, List, Copy, GitMerge, Trash2, Loader2, X, Search } from "lucide-react"
import { deleteRecord, cloneRecord, mergeRecord, MERGEABLE } from "@/app/actions/record-crud"
import { searchAssociableRecords } from "@/app/actions/associations"
import { listUrlFor } from "@/lib/record-urls"
import type { RecordFieldDef } from "@/lib/record-field-catalog"
import { cn } from "@/lib/utils"

interface Props {
  entityType: string
  recordId: string
  title: string
  catalog: RecordFieldDef[]
  values: Record<string, any>
  userMap?: Record<string, string>
  canEdit: boolean
  canDelete: boolean
}

function fmt(f: RecordFieldDef, v: any, userMap: Record<string, string>): string {
  if (v === null || v === undefined || v === "") return "—"
  if (f.type === "user") return userMap[v] ?? String(v)
  if (f.type === "datetime") return new Date(v).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
  if (f.type === "date") return new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  if (Array.isArray(v)) return v.join(", ")
  return String(v)
}

export default function RecordActionsMenu({ entityType, recordId, title, catalog, values, userMap = {}, canEdit, canDelete }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState(false)
  const [merging, setMerging] = useState(false)
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)
  const mergeable = MERGEABLE.includes(entityType)

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  function clone() {
    setOpen(false)
    startTransition(async () => {
      const res = await cloneRecord(entityType, recordId)
      if (res.error) alert(res.error)
      else if (res.url) router.push(res.url)
    })
  }

  function remove() {
    setOpen(false)
    if (!confirm(`Delete "${title}"? This can't be undone.`)) return
    startTransition(async () => {
      const res = await deleteRecord(entityType, recordId)
      if (res.error) alert(res.error)
      else router.push(listUrlFor(entityType))
    })
  }

  const item = "w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-slate-50 transition-colors"

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 h-7 px-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900">
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Actions"}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-52 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden py-1">
          <button className={item} onClick={() => { setOpen(false); setPanel(true) }}>
            <List className="h-4 w-4 text-slate-400" /> View all properties
          </button>
          {canEdit && (
            <button className={item} onClick={clone}>
              <Copy className="h-4 w-4 text-slate-400" /> Clone
            </button>
          )}
          {canEdit && mergeable && (
            <button className={item} onClick={() => { setOpen(false); setMerging(true) }}>
              <GitMerge className="h-4 w-4 text-slate-400" /> Merge
            </button>
          )}
          {canDelete && (
            <>
              <div className="my-1 border-t border-slate-100" />
              <button className={cn(item, "text-red-600")} onClick={remove}>
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </>
          )}
        </div>
      )}

      {panel && <AllPropertiesPanel title={title} catalog={catalog} values={values} userMap={userMap} onClose={() => setPanel(false)} />}
      {merging && <MergeDialog entityType={entityType} recordId={recordId} title={title} onClose={() => setMerging(false)} />}
    </div>
  )
}

// Merge THIS record into another of the same type; the other record survives.
function MergeDialog({ entityType, recordId, title, onClose }: {
  entityType: string; recordId: string; title: string; onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [q, setQ] = useState("")
  const [results, setResults] = useState<{ id: string; name: string }[]>([])
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  function search(value: string) {
    setQ(value); setPicked(null)
    if (value.trim().length < 2) { setResults([]); return }
    startTransition(async () => {
      const rows = await searchAssociableRecords(entityType, value)
      setResults(rows.filter((r) => r.id !== recordId))
    })
  }

  function doMerge() {
    if (!picked) return
    setError(null)
    startTransition(async () => {
      const res = await mergeRecord(entityType, recordId, picked.id)
      if (res.error) setError(res.error)
      else if (res.url) { onClose(); router.push(res.url) }
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Merge record</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-sm text-slate-500">
          Merge <span className="font-medium text-slate-800">{title}</span> into another record. The other record is kept and this one's
          links move to it. This can't be undone.
        </p>

        {picked ? (
          <div className="flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-3 py-2">
            <span className="text-sm text-slate-800">Merge into <span className="font-medium">{picked.name}</span></span>
            <button onClick={() => setPicked(null)} className="text-xs text-slate-500 hover:text-slate-800">Change</button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input value={q} onChange={(e) => search(e.target.value)} placeholder="Search a record to merge into…" autoFocus
                className="w-full h-9 pl-8 pr-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-zinc-400" />
            </div>
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
            <div className="max-h-52 overflow-y-auto">
              {results.map((r) => (
                <button key={r.id} onClick={() => { setPicked(r); setResults([]) }}
                  className="w-full text-left text-sm px-2 py-1.5 rounded-md hover:bg-slate-50 text-slate-700">{r.name}</button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="h-9 px-3 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
          <button onClick={doMerge} disabled={!picked || isPending}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50">
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitMerge className="h-3.5 w-3.5" />} Merge
          </button>
        </div>
      </div>
    </div>
  )
}

function AllPropertiesPanel({ title, catalog, values, userMap, onClose }: {
  title: string; catalog: RecordFieldDef[]; values: Record<string, any>; userMap: Record<string, string>; onClose: () => void
}) {
  const [q, setQ] = useState("")
  const [hideBlank, setHideBlank] = useState(false)

  const rows = catalog
    .filter((f) => f.label.toLowerCase().includes(q.trim().toLowerCase()))
    .filter((f) => !hideBlank || !(values[f.key] === null || values[f.key] === undefined || values[f.key] === "" || values[f.key] === "—"))

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900 truncate">{title} — All Properties</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </div>

        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search property"
              className="w-full h-8 pl-8 pr-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-zinc-400" />
          </div>
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 shrink-0">
            <input type="checkbox" checked={hideBlank} onChange={(e) => setHideBlank(e.target.checked)} className="rounded border-slate-300" />
            Hide blank
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{rows.length} properties</p>
          <div className="space-y-3">
            {rows.map((f) => (
              <div key={f.key}>
                <span className="block text-xs text-slate-500">{f.label}</span>
                <span className="block text-sm text-slate-900 break-words">{fmt(f, values[f.key], userMap)}</span>
              </div>
            ))}
            {rows.length === 0 && <p className="text-sm text-slate-400">No matching properties.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
