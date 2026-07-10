"use client"

import { useState, useTransition, useEffect, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus, Trash2, Loader2, Check, Columns3, ChevronDown, ExternalLink, X } from "lucide-react"
import { createCustomObjectRecord, bulkDeleteCustomObjectRecords } from "@/app/actions/custom-object-records"
import type { CustomObjectProperty } from "@/app/actions/custom-objects"
import StyledSelect from "@/components/ui/styled-select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

interface RecordRow {
  id: string
  recordNumber: number | null
  values: Record<string, any>
  ownerId: string | null
  ownerName: string | null
  createdByName: string | null
  createdAt: string | Date
  updatedAt: string | Date
}

interface Props {
  objectKey: string
  singular: string
  ownerLabel: string
  properties: CustomObjectProperty[]
  records: RecordRow[]
  users: { id: string; label: string }[]
  canEdit: boolean
  canDelete: boolean
}

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" })
}

function displayValue(p: CustomObjectProperty, v: any, userMap: Record<string, string>): string {
  if (v === null || v === undefined || v === "") return "—"
  switch (p.type) {
    case "CHECKBOX": return v ? "Yes" : "No"
    case "DATE": return fmtDate(v)
    case "MULTI_SELECT": return Array.isArray(v) ? v.join(", ") : String(v)
    case "USER": return userMap[v] ?? String(v)
    default: return String(v)
  }
}

export default function CustomObjectList({ objectKey, singular, ownerLabel, properties, records, users, canEdit, canDelete }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const userMap = Object.fromEntries(users.map((u) => [u.id, u.label]))

  const primary = properties.find((p) => p.primary) ?? properties[0]
  const otherProps = properties.filter((p) => p.id !== primary?.id)

  // Columns: property columns + owner + created (recordId + primary always shown).
  const allCols = [...otherProps.map((p) => ({ key: p.id, label: p.name })), { key: "__owner", label: ownerLabel }, { key: "__created", label: "Created" }]
  const [visibleCols, setVisibleCols] = useState<string[]>(allCols.map((c) => c.key))
  const [colMenu, setColMenu] = useState(false)
  const colRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (colRef.current && !colRef.current.contains(e.target as Node)) setColMenu(false) }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])
  const cols = allCols.filter((c) => visibleCols.includes(c.key))

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const allChecked = records.length > 0 && records.every((r) => selected.has(r.id))
  function toggleRow(id: string) { setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function bulkDelete() {
    if (!confirm(`Delete ${selected.size} record${selected.size !== 1 ? "s" : ""}?`)) return
    startTransition(async () => { await bulkDeleteCustomObjectRecords(objectKey, Array.from(selected)); setSelected(new Set()); router.refresh() })
  }

  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative" ref={colRef}>
          <button onClick={() => setColMenu((v) => !v)}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-600 hover:border-zinc-400">
            <Columns3 className="h-3.5 w-3.5" /> Columns <ChevronDown className="h-3 w-3 opacity-50" />
          </button>
          {colMenu && (
            <div className="absolute left-0 top-full mt-1.5 z-50 w-52 bg-white border border-zinc-200 rounded-xl shadow-xl py-1">
              {allCols.map((c) => (
                <button key={c.key} onClick={() => setVisibleCols((prev) => prev.includes(c.key) ? prev.filter((k) => k !== c.key) : [...prev, c.key])}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-zinc-50 text-left">
                  <span className={cn("w-[14px] h-[14px] rounded border flex items-center justify-center", visibleCols.includes(c.key) ? "bg-zinc-900 border-zinc-900" : "border-zinc-300")}>
                    {visibleCols.includes(c.key) && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                  </span>
                  <span className="text-zinc-700 truncate">{c.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {canEdit && (
          <button onClick={() => setAddOpen(true)}
            className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800">
            <Plus className="h-3.5 w-3.5" /> Add {singular}
          </button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-zinc-900 text-white rounded-xl text-sm">
          <span className="font-medium">{selected.size} selected</span>
          {canDelete && (
            <button onClick={bulkDelete} disabled={isPending} className="inline-flex items-center gap-1.5 h-7 px-3 bg-red-500 hover:bg-red-600 rounded-lg font-medium">
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
            </button>
          )}
          <button onClick={() => setSelected(new Set())} className="ml-auto text-white/60 hover:text-white text-xs">Clear</button>
        </div>
      )}

      {records.length === 0 ? (
        <div className="bg-white border rounded-xl py-16 text-center text-slate-400">No {singular.toLowerCase()} records yet.</div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(records.map((r) => r.id)))} className="rounded border-slate-300 cursor-pointer" />
                  </th>
                  <th className="px-4 py-3 font-semibold w-24">Record ID</th>
                  <th className="px-4 py-3 font-semibold">{primary?.name ?? "Name"}</th>
                  {cols.map((c) => <th key={c.key} className="px-4 py-3 font-semibold">{c.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r) => (
                  <tr key={r.id} className={cn("transition-colors", selected.has(r.id) ? "bg-blue-50" : "hover:bg-slate-50")}>
                    <td className="px-4 py-2.5"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleRow(r.id)} className="rounded border-slate-300 cursor-pointer" /></td>
                    <td className="px-4 py-2.5 text-slate-400 font-mono text-xs">{r.recordNumber != null ? `#${r.recordNumber}` : "—"}</td>
                    <td className="px-4 py-2.5">
                      <Link href={`/objects/${objectKey}/${r.id}`} className="font-medium text-blue-600 hover:underline inline-flex items-center gap-1">
                        {(primary && displayValue(primary, r.values[primary.id], userMap)) || "Untitled"}
                        <ExternalLink className="h-3 w-3 text-slate-400 shrink-0" />
                      </Link>
                    </td>
                    {cols.map((c) => (
                      <td key={c.key} className="px-4 py-2.5 text-slate-600">
                        {c.key === "__owner" ? (r.ownerName ?? "—")
                          : c.key === "__created" ? fmtDate(r.createdAt)
                          : displayValue(otherProps.find((p) => p.id === c.key)!, r.values[c.key], userMap)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canEdit && addOpen && (
        <AddRecordDialog objectKey={objectKey} singular={singular} ownerLabel={ownerLabel} properties={properties} users={users}
          onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); router.refresh() }} />
      )}
    </div>
  )
}

function AddRecordDialog({ objectKey, singular, ownerLabel, properties, users, onClose, onSaved }: {
  objectKey: string; singular: string; ownerLabel: string; properties: CustomObjectProperty[]
  users: { id: string; label: string }[]; onClose: () => void; onSaved: () => void
}) {
  const [values, setValues] = useState<Record<string, any>>({})
  const [ownerId, setOwnerId] = useState("")
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState("")

  const inputCls = "h-9 w-full px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
  const set = (id: string, v: any) => setValues((p) => ({ ...p, [id]: v }))

  function save() {
    setErr("")
    startTransition(async () => {
      const res = await createCustomObjectRecord(objectKey, values, ownerId || undefined)
      if ((res as any)?.error) { setErr(typeof (res as any).error === "string" ? (res as any).error : "Could not create"); return }
      onSaved()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add {singular}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {properties.map((p) => (
            <div key={p.id}>
              <label className="text-xs font-medium text-slate-600 block mb-1">{p.name}{p.primary ? " *" : ""}</label>
              {p.type === "LONG_TEXT" ? (
                <textarea rows={3} className={inputCls + " resize-none py-2 h-auto"} value={values[p.id] ?? ""} onChange={(e) => set(p.id, e.target.value)} />
              ) : p.type === "CHECKBOX" ? (
                <input type="checkbox" checked={!!values[p.id]} onChange={(e) => set(p.id, e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              ) : p.type === "DATE" ? (
                <input type="date" className={inputCls} value={values[p.id] ?? ""} onChange={(e) => set(p.id, e.target.value)} />
              ) : p.type === "NUMBER" ? (
                <input type="number" className={inputCls} value={values[p.id] ?? ""} onChange={(e) => set(p.id, e.target.value === "" ? "" : Number(e.target.value))} />
              ) : p.type === "DROPDOWN" ? (
                <StyledSelect className={inputCls} value={values[p.id] ?? ""} onChange={(e) => set(p.id, e.target.value)}>
                  <option value="">— Select —</option>
                  {(p.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                </StyledSelect>
              ) : p.type === "MULTI_SELECT" ? (
                <div className="flex flex-wrap gap-1.5">
                  {(p.options ?? []).map((o) => {
                    const arr: string[] = Array.isArray(values[p.id]) ? values[p.id] : []
                    const on = arr.includes(o)
                    return <button key={o} type="button" onClick={() => set(p.id, on ? arr.filter((x) => x !== o) : [...arr, o])}
                      className={cn("px-2.5 py-1 rounded-lg text-xs font-medium border", on ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-600 border-zinc-200")}>{o}</button>
                  })}
                </div>
              ) : p.type === "USER" ? (
                <StyledSelect className={inputCls} value={values[p.id] ?? ""} onChange={(e) => set(p.id, e.target.value)}>
                  <option value="">— Select —</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                </StyledSelect>
              ) : (
                <input className={inputCls} value={values[p.id] ?? ""} onChange={(e) => set(p.id, e.target.value)} />
              )}
            </div>
          ))}
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">{ownerLabel}</label>
            <StyledSelect className={inputCls} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">You (creator)</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </StyledSelect>
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={isPending} className="h-9 px-4 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 inline-flex items-center gap-1.5">
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Create
            </button>
            <button onClick={onClose} className="h-9 px-3 text-sm text-slate-500 hover:text-slate-800">Cancel</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
