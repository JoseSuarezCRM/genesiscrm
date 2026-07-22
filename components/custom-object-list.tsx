"use client"

import { useState, useTransition, useEffect, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus, Trash2, Loader2, Check, Columns3, ChevronDown } from "lucide-react"
import BulkActionBar, { bulkDanger } from "@/components/ui/bulk-action-bar"
import { useColumnResize, ColResizer } from "@/components/ui/use-column-resize"
import { ChevronUp } from "lucide-react"
import { createCustomObjectRecord, bulkDeleteCustomObjectRecords } from "@/app/actions/custom-object-records"
import type { CustomObjectProperty } from "@/app/actions/custom-objects"
import StyledSelect from "@/components/ui/styled-select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import FilterBuilder from "@/components/ui/filter-builder"
import ExportDialog from "@/components/ui/export-dialog"
import { ViewAccessSelector, type ViewAccessValue, type ShareUser, type ShareTeam } from "@/components/view-access-selector"
import { createCustomObjectView, deleteCustomObjectView } from "@/app/actions/custom-object-views"
import { type FilterField, type FilterState, emptyFilter, matchesFilter, activeConditionCount, customPropertyFilterFields } from "@/lib/filters"
import { Search, Download, Globe, Users, UserCog, X } from "lucide-react"
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
  plural: string
  ownerLabel: string
  properties: CustomObjectProperty[]
  records: RecordRow[]
  users: { id: string; label: string }[]
  canEdit: boolean
  canDelete: boolean
  savedViews?: SavedView[]
  shareUsers?: ShareUser[]
  shareTeams?: ShareTeam[]
}

interface SavedView {
  id: string
  name: string
  config: { filter: FilterState; columns: string[] }
  visibility?: string
  isOwner?: boolean
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
    case "DATE_TIME": return v ? new Date(v).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—"
    case "MULTI_SELECT": return Array.isArray(v) ? v.join(", ") : String(v)
    case "USER": return userMap[v] ?? String(v)
    default: return String(v)
  }
}

export default function CustomObjectList({ objectKey, singular, plural, ownerLabel, properties, records, users, canEdit, canDelete, savedViews = [], shareUsers = [], shareTeams = [] }: Props) {
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

  // Filter + search + export.
  const filterFields: FilterField[] = [
    { key: "__recordNumber", label: "Record ID", type: "number", getValue: (r) => r.recordNumber },
    { key: "__owner", label: ownerLabel, type: "select", options: users.map((u) => ({ value: u.id, label: u.label })), getValue: (r) => r.ownerId },
    { key: "__created", label: "Created", type: "date", getValue: (r) => r.createdAt },
    ...customPropertyFilterFields(properties.map((p) => ({ id: p.id, name: p.name, type: p.type, options: p.options })), "values"),
  ]
  const [filter, setFilter] = useState<FilterState>(emptyFilter())
  const [search, setSearch] = useState("")
  const [exportOpen, setExportOpen] = useState(false)
  const filtered = records.filter((r) => {
    const q = search.toLowerCase().trim()
    if (q) {
      const hay = Object.values(r.values).map((v) => (Array.isArray(v) ? v.join(" ") : String(v ?? ""))).join(" ").toLowerCase()
      if (!hay.includes(q)) return false
    }
    return matchesFilter(r, filter, filterFields)
  })
  const filtersActive = activeConditionCount(filter, filterFields) > 0

  // Column resize + client-side sort (all records are loaded here).
  const { colWidth, startResize } = useColumnResize(`co_${objectKey}_colWidths`)
  const [sortKey, setSortKey] = useState<string>("__id")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const toggleSort = (k: string) => { if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc")); else { setSortKey(k); setSortDir("asc") } }
  const sortVal = (r: RecordRow, key: string): string | number => {
    if (key === "__id") return r.recordNumber ?? 0
    if (key === "__name") return (primary ? displayValue(primary, r.values[primary.id], userMap) : "").toLowerCase()
    if (key === "__owner") return (r.ownerName ?? "").toLowerCase()
    if (key === "__created") return new Date(r.createdAt).getTime()
    const p = otherProps.find((x) => x.id === key)
    return p ? displayValue(p, r.values[key], userMap).toLowerCase() : ""
  }
  const sorted = [...filtered].sort((a, b) => {
    const va = sortVal(a, sortKey), vb = sortVal(b, sortKey)
    const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))
    return sortDir === "asc" ? cmp : -cmp
  })
  const SortIcon = ({ k }: { k: string }) => sortKey === k ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null

  // Saved views (applied in-memory).
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [newViewName, setNewViewName] = useState("")
  const [newViewAccess, setNewViewAccess] = useState<ViewAccessValue>({ visibility: "PRIVATE", teamId: null, sharedUserIds: [] })
  const [savingView, setSavingView] = useState(false)
  const currentKey = JSON.stringify({ filter, columns: visibleCols })
  const activeViewId = savedViews.find((v) => JSON.stringify({ filter: v.config.filter, columns: v.config.columns }) === currentKey)?.id
    ?? (!filtersActive && !search ? "__default__" : null)
  function applyView(v: SavedView) { setFilter(v.config.filter ?? emptyFilter()); setVisibleCols(v.config.columns ?? allCols.map((c) => c.key)); setSearch("") }
  function applyDefault() { setFilter(emptyFilter()); setVisibleCols(allCols.map((c) => c.key)); setSearch("") }
  function saveView() {
    if (!newViewName.trim()) return
    setSavingView(true)
    startTransition(async () => {
      await createCustomObjectView(objectKey, newViewName.trim(), { filter, columns: visibleCols }, newViewAccess)
      setSavingView(false); setShowSaveForm(false); setNewViewName(""); setNewViewAccess({ visibility: "PRIVATE", teamId: null, sharedUserIds: [] })
      router.refresh()
    })
  }
  function deleteView(id: string) { startTransition(async () => { await deleteCustomObjectView(id); router.refresh() }) }

  function buildExport() {
    const headers = ["Record ID", primary?.name ?? "Name", ...cols.map((c) => c.label)]
    const rows = filtered.map((r) => [
      r.recordNumber != null ? `#${r.recordNumber}` : "",
      primary ? displayValue(primary, r.values[primary.id], userMap) : "",
      ...cols.map((c) => c.key === "__owner" ? (r.ownerName ?? "") : c.key === "__created" ? fmtDate(r.createdAt) : displayValue(otherProps.find((p) => p.id === c.key)!, r.values[c.key], userMap)),
    ])
    return { headers, rows }
  }

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const allChecked = filtered.length > 0 && filtered.every((r) => selected.has(r.id))
  function toggleRow(id: string) { setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function bulkDelete() {
    if (!confirm(`Delete ${selected.size} record${selected.size !== 1 ? "s" : ""}?`)) return
    startTransition(async () => { await bulkDeleteCustomObjectRecords(objectKey, Array.from(selected)); setSelected(new Set()); router.refresh() })
  }

  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterBuilder fields={filterFields} value={filter} onChange={setFilter} />
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
                  <span className={cn("w-[14px] h-[14px] rounded border flex items-center justify-center", visibleCols.includes(c.key) ? "bg-blue-600 border-blue-600" : "border-zinc-300")}>
                    {visibleCols.includes(c.key) && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                  </span>
                  <span className="text-zinc-700 truncate">{c.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => setExportOpen(true)} disabled={filtered.length === 0} title="Export current view to CSV"
          className="ml-auto inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-600 hover:border-zinc-400 disabled:opacity-50">
          <Download className="h-3.5 w-3.5" /> Export
        </button>
        {canEdit && (
          <button onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
            <Plus className="h-3.5 w-3.5" /> Add {singular}
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        <input type="text" placeholder={`Search ${plural.toLowerCase()}…`} value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      {(filtersActive || search) && <p className="text-xs text-slate-400 -mt-1">{filtered.length} of {records.length}</p>}

      {/* Saved views */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={applyDefault}
          className={cn("inline-flex items-center h-8 px-3 rounded-lg border text-sm font-medium transition-all", activeViewId === "__default__" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400")}>
          Default
        </button>
        {savedViews.map((v) => (
          <div key={v.id} className={cn("inline-flex items-center h-8 rounded-lg border text-sm font-medium overflow-hidden", activeViewId === v.id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400")}>
            <button className={cn("pl-3 h-full", v.isOwner === false ? "pr-3" : "pr-1.5")} onClick={() => applyView(v)}>
              {v.name}
              {v.isOwner === false && v.visibility && v.visibility !== "PRIVATE" && (
                <span className="ml-1.5 opacity-60">
                  {v.visibility === "EVERYONE" ? <Globe className="inline h-3 w-3" /> : v.visibility === "TEAM" ? <Users className="inline h-3 w-3" /> : <UserCog className="inline h-3 w-3" />}
                </span>
              )}
            </button>
            {v.isOwner !== false && (
              <button onClick={() => deleteView(v.id)} title="Delete view" className={cn("pr-2 pl-0.5 h-full", activeViewId === v.id ? "hover:text-zinc-300" : "hover:text-red-500")}><X className="h-3 w-3" /></button>
            )}
          </div>
        ))}
        <div className="relative">
          <button onClick={() => setShowSaveForm((v) => !v)}
            className="h-8 px-3 rounded-lg text-sm border border-dashed border-zinc-300 text-zinc-400 hover:border-zinc-500 hover:text-zinc-600 flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Save view
          </button>
          {showSaveForm && (
            <div className="absolute left-0 top-full mt-2 z-50 w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-3 space-y-3">
              <p className="text-xs text-slate-500">Saves the current filters and columns.</p>
              <input autoFocus value={newViewName} onChange={(e) => setNewViewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveView(); if (e.key === "Escape") setShowSaveForm(false) }}
                placeholder="View name…" className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg outline-none focus:border-slate-400" />
              <ViewAccessSelector value={newViewAccess} onChange={setNewViewAccess} users={shareUsers} teams={shareTeams} />
              <div className="flex gap-2 pt-1">
                <button onClick={saveView} disabled={savingView || !newViewName.trim()}
                  className="flex-1 h-9 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
                  {savingView ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save view
                </button>
                <button onClick={() => { setShowSaveForm(false); setNewViewName("") }} className="h-9 px-3 text-sm text-zinc-500 hover:text-zinc-800 border border-zinc-200 rounded-lg">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
        {canDelete && (
          <button onClick={bulkDelete} disabled={isPending} className={bulkDanger}>
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
          </button>
        )}
      </BulkActionBar>

      {filtered.length === 0 ? (
        <div className="bg-white border rounded-xl py-16 text-center text-slate-400">
          {records.length === 0 ? `No ${singular.toLowerCase()} records yet.` : "No records match your search or filters."}
        </div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <colgroup>
                <col style={{ width: 40 }} />
                <col style={{ width: colWidth("__id") ?? 96 }} />
                <col style={{ width: colWidth("__name") }} />
                {cols.map((c) => <col key={c.key} style={{ width: colWidth(c.key) }} />)}
              </colgroup>
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(filtered.map((r) => r.id)))} className="rounded border-slate-300 cursor-pointer" />
                  </th>
                  <th className="px-4 py-3 font-semibold relative">
                    <button onClick={() => toggleSort("__id")} className="inline-flex items-center gap-1 hover:text-slate-800">Record ID <SortIcon k="__id" /></button>
                    <ColResizer onMouseDown={(e) => startResize("__id", e)} />
                  </th>
                  <th className="px-4 py-3 font-semibold relative">
                    <button onClick={() => toggleSort("__name")} className="inline-flex items-center gap-1 hover:text-slate-800">{primary?.name ?? "Name"} <SortIcon k="__name" /></button>
                    <ColResizer onMouseDown={(e) => startResize("__name", e)} />
                  </th>
                  {cols.map((c) => (
                    <th key={c.key} className="px-4 py-3 font-semibold relative">
                      <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-slate-800">{c.label} <SortIcon k={c.key} /></button>
                      <ColResizer onMouseDown={(e) => startResize(c.key, e)} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((r) => (
                  <tr key={r.id} className={cn("transition-colors", selected.has(r.id) ? "bg-blue-50" : "hover:bg-slate-50")}>
                    <td className="px-4 py-2.5"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleRow(r.id)} className="rounded border-slate-300 cursor-pointer" /></td>
                    <td className="px-4 py-2.5 text-slate-400 font-mono text-xs">{r.recordNumber != null ? `#${r.recordNumber}` : "—"}</td>
                    <td className="px-4 py-2.5 truncate" style={{ maxWidth: colWidth("__name") }}>
                      <Link href={`/objects/${objectKey}/${r.id}`} className="font-medium text-slate-900 hover:text-blue-600">
                        {(primary && displayValue(primary, r.values[primary.id], userMap)) || "Untitled"}
                      </Link>
                    </td>
                    {cols.map((c) => (
                      <td key={c.key} className="px-4 py-2.5 text-slate-600 truncate" style={{ maxWidth: colWidth(c.key) }}>
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

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} subject={plural} defaultName={objectKey} getData={buildExport} />
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

  // Dependent options: narrow a dropdown's options by the controlling field's value.
  const optsFor = (p: any): string[] => {
    const c = p?.conditional
    if (!c) return p.options ?? []
    const cv = String(values[c.controllingPropertyId] ?? "")
    const allowed = c.rules?.[cv]
    return allowed ? (p.options ?? []).filter((o: string) => allowed.includes(o)) : (p.options ?? [])
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
              ) : p.type === "DATE_TIME" ? (
                <input type="datetime-local" className={inputCls} value={values[p.id] ?? ""} onChange={(e) => set(p.id, e.target.value)} />
              ) : p.type === "NUMBER" ? (
                <input type="number" className={inputCls} value={values[p.id] ?? ""} onChange={(e) => set(p.id, e.target.value === "" ? "" : Number(e.target.value))} />
              ) : p.type === "DROPDOWN" ? (
                <StyledSelect className={inputCls} value={values[p.id] ?? ""} onChange={(e) => set(p.id, e.target.value)}>
                  <option value="">— Select —</option>
                  {optsFor(p).map((o) => <option key={o} value={o}>{o}</option>)}
                </StyledSelect>
              ) : p.type === "MULTI_SELECT" ? (
                <div className="flex flex-wrap gap-1.5">
                  {optsFor(p).map((o) => {
                    const arr: string[] = Array.isArray(values[p.id]) ? values[p.id] : []
                    const on = arr.includes(o)
                    return <button key={o} type="button" onClick={() => set(p.id, on ? arr.filter((x) => x !== o) : [...arr, o])}
                      className={cn("px-2.5 py-1 rounded-lg text-xs font-medium border", on ? "bg-blue-600 text-white border-blue-600" : "bg-white text-zinc-600 border-zinc-200")}>{o}</button>
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
            <button onClick={save} disabled={isPending} className="h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1.5">
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Create
            </button>
            <button onClick={onClose} className="h-9 px-3 text-sm text-slate-500 hover:text-slate-800">Cancel</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
