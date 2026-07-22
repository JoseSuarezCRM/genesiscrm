"use client"

import { useState, useTransition, useEffect, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Plus, Pencil, Trash2, Loader2, MapPin, Building2, Search, X, Check,
  LayoutList, Table2, Download, Columns3, ChevronDown, ChevronUp,
} from "lucide-react"
import { createLocation, updateLocation, deleteLocation, bulkDeleteLocations } from "@/app/actions/referring-doctors"
import StyledSelect from "@/components/ui/styled-select"
import ExportDialog from "@/components/ui/export-dialog"
import FilterBuilder from "@/components/ui/filter-builder"
import { PhoneInput } from "@/components/ui/phone-input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { type FilterField, type FilterState, type CustomPropDef, emptyFilter, matchesFilter, activeConditionCount, customPropertyFilterFields } from "@/lib/filters"
import { cn } from "@/lib/utils"

export interface LocationRow {
  id: string
  name: string
  phone: string | null
  fax: string | null
  address: string | null
  practiceId: string
  practiceName: string
  ownerName?: string | null
  createdAt: string | Date
  customProperties?: Record<string, any>
  referralCount: number
  providerCount: number
  activityCount: number
}

interface PracticeOption { id: string; name: string }

interface Props {
  locations: LocationRow[]
  practices: PracticeOption[]
  customPropertyDefs?: CustomPropDef[]
  canEdit: boolean
  canDelete: boolean
}

const LOCATION_COLUMNS: { key: string; label: string; sortable?: boolean; align?: "right" }[] = [
  { key: "practice", label: "Practice", sortable: true },
  { key: "address", label: "Address" },
  { key: "phone", label: "Phone" },
  { key: "fax", label: "Fax" },
  { key: "providers", label: "Providers", sortable: true, align: "right" },
  { key: "referrals", label: "Referrals", sortable: true, align: "right" },
  { key: "activities", label: "Activities", sortable: true, align: "right" },
  { key: "owner", label: "Location Owner", sortable: true },
  { key: "created", label: "Created", sortable: true },
]
const DEFAULT_LOCATION_COLS = ["practice", "address", "phone", "providers", "referrals"]

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" })
}

type SortKey = "name" | "practice" | "providers" | "referrals" | "activities" | "owner" | "created"

export default function LocationManager({ locations, practices, customPropertyDefs = [], canEdit, canDelete }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<FilterState>(emptyFilter())
  const [viewMode, setViewMode] = useState<"cards" | "table">("table")
  const [visibleCols, setVisibleCols] = useState<string[]>(DEFAULT_LOCATION_COLS)
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>("referrals")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [addOpen, setAddOpen] = useState(false)
  const [editRow, setEditRow] = useState<LocationRow | null>(null)

  const colMenuRef = useRef<HTMLDivElement>(null)
  const headerCheckRef = useRef<HTMLInputElement>(null)

  // Persist view prefs
  useEffect(() => {
    try {
      const v = localStorage.getItem("locationViewMode")
      if (v === "cards" || v === "table") setViewMode(v)
      const c = localStorage.getItem("locationCols")
      if (c) { const arr = JSON.parse(c); if (Array.isArray(arr) && arr.length) setVisibleCols(arr) }
    } catch {}
  }, [])
  useEffect(() => { try { localStorage.setItem("locationViewMode", viewMode) } catch {} }, [viewMode])
  useEffect(() => { try { localStorage.setItem("locationCols", JSON.stringify(visibleCols)) } catch {} }, [visibleCols])

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setColMenuOpen(false) }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  // ── Filtering ──────────────────────────────────────────────────────────────
  const practiceNames = Array.from(new Set(locations.map((l) => l.practiceName).filter(Boolean))).sort()
  const ownerNames = Array.from(new Set(locations.map((l) => l.ownerName).filter(Boolean) as string[])).sort()
  const filterFields: FilterField[] = [
    { key: "name", label: "Name", type: "text", getValue: (l) => l.name },
    { key: "practice", label: "Practice", type: "select", options: practiceNames.map((p) => ({ label: p, value: p })), getValue: (l) => l.practiceName },
    { key: "address", label: "Address", type: "text", getValue: (l) => l.address },
    { key: "phone", label: "Phone", type: "text", getValue: (l) => l.phone },
    { key: "fax", label: "Fax", type: "text", getValue: (l) => l.fax },
    { key: "providers", label: "Providers", type: "number", getValue: (l) => l.providerCount },
    { key: "referrals", label: "Referrals", type: "number", getValue: (l) => l.referralCount },
    { key: "activities", label: "Activities", type: "number", getValue: (l) => l.activityCount },
    { key: "owner", label: "Location Owner", type: "select", options: ownerNames.map((o) => ({ label: o, value: o })), getValue: (l) => l.ownerName ?? "" },
    ...customPropertyFilterFields(customPropertyDefs),
  ]

  const filtered = locations.filter((l) => {
    const q = search.toLowerCase().trim()
    if (q && !(l.name.toLowerCase().includes(q) || l.practiceName.toLowerCase().includes(q) || (l.address ?? "").toLowerCase().includes(q))) return false
    return matchesFilter(l, filter, filterFields)
  })
  const filtersActive = activeConditionCount(filter, filterFields) > 0

  const sorted = [...filtered].sort((a, b) => {
    let av: string | number = 0, bv: string | number = 0
    switch (sortKey) {
      case "name": av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break
      case "practice": av = a.practiceName.toLowerCase(); bv = b.practiceName.toLowerCase(); break
      case "providers": av = a.providerCount; bv = b.providerCount; break
      case "referrals": av = a.referralCount; bv = b.referralCount; break
      case "activities": av = a.activityCount; bv = b.activityCount; break
      case "owner": av = (a.ownerName ?? "").toLowerCase(); bv = (b.ownerName ?? "").toLowerCase(); break
      case "created": av = new Date(a.createdAt).getTime(); bv = new Date(b.createdAt).getTime(); break
    }
    const cmp = av < bv ? -1 : av > bv ? 1 : 0
    return sortDir === "asc" ? cmp : -cmp
  })

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(key); setSortDir(key === "practice" || key === "name" ? "asc" : "desc") }
  }

  const cols = LOCATION_COLUMNS.filter((c) => visibleCols.includes(c.key))
  const toggleCol = (key: string) => setVisibleCols((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))

  // ── Selection ────────────────────────────────────────────────────────────────
  const allChecked = sorted.length > 0 && sorted.every((l) => selected.has(l.id))
  const someChecked = selected.size > 0 && !allChecked
  useEffect(() => { if (headerCheckRef.current) headerCheckRef.current.indeterminate = someChecked }, [someChecked])
  function toggleAll() { allChecked ? setSelected(new Set()) : setSelected(new Set(sorted.map((l) => l.id))) }
  function toggleRow(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function bulkDelete() {
    if (!confirm(`Delete ${selected.size} location${selected.size !== 1 ? "s" : ""}? Locations linked to referrals or providers are skipped.`)) return
    startTransition(async () => {
      const res = await bulkDeleteLocations(Array.from(selected))
      setSelected(new Set())
      if (res?.blocked) alert(`Deleted ${res.deleted}. Skipped ${res.blocked} still linked to referrals or providers.`)
      router.refresh()
    })
  }

  // ── Export ───────────────────────────────────────────────────────────────────
  function buildExport() {
    const headers = ["Name", "Practice", "Address", "Phone", "Fax", "Providers", "Referrals", "Activities", "Location Owner", "Created"]
    const rows = sorted.map((l) => [
      l.name, l.practiceName, l.address ?? "", l.phone ?? "", l.fax ?? "",
      l.providerCount, l.referralCount, l.activityCount, l.ownerName ?? "", fmtDate(l.createdAt),
    ])
    return { headers, rows }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-lg border border-zinc-200 bg-white p-0.5">
          <button onClick={() => setViewMode("table")} title="Table view"
            className={cn("inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors", viewMode === "table" ? "bg-blue-600 text-white" : "text-zinc-500 hover:text-zinc-800")}>
            <Table2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setViewMode("cards")} title="Card view"
            className={cn("inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors", viewMode === "cards" ? "bg-blue-600 text-white" : "text-zinc-500 hover:text-zinc-800")}>
            <LayoutList className="h-3.5 w-3.5" />
          </button>
        </div>

        <FilterBuilder fields={filterFields} value={filter} onChange={setFilter} />

        {viewMode === "table" && (
          <div className="relative" ref={colMenuRef}>
            <button onClick={() => setColMenuOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-600 hover:border-zinc-400 transition-colors">
              <Columns3 className="h-3.5 w-3.5" /> Columns <ChevronDown className="h-3 w-3 opacity-50" />
            </button>
            {colMenuOpen && (
              <div className="absolute left-0 top-full mt-1.5 z-50 w-52 bg-white border border-zinc-200 rounded-xl shadow-xl overflow-hidden py-1">
                {LOCATION_COLUMNS.map((col) => (
                  <button key={col.key} onClick={() => toggleCol(col.key)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-zinc-50 transition-colors text-left">
                    <span className={cn("shrink-0 w-[14px] h-[14px] rounded border flex items-center justify-center", visibleCols.includes(col.key) ? "bg-blue-600 border-blue-600" : "border-zinc-300")}>
                      {visibleCols.includes(col.key) && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                    </span>
                    <span className="text-zinc-700">{col.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button onClick={() => setExportOpen(true)} disabled={sorted.length === 0} title="Export current view to CSV"
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-600 hover:border-zinc-400 disabled:opacity-50 transition-colors">
          <Download className="h-3.5 w-3.5" /> Export
        </button>

        {canEdit && (
          <button onClick={() => setAddOpen(true)}
            className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
            <Plus className="h-3.5 w-3.5" /> Add Location
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        <input type="text" placeholder="Search by location, practice, or address…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-8 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        )}
      </div>

      {(filtersActive || search) && (
        <p className="text-xs text-slate-400 -mt-1">{sorted.length} of {locations.length} locations</p>
      )}

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm animate-bar-in">
          <span className="font-medium">{selected.size} selected</span>
          {canDelete && (
            <button onClick={bulkDelete} disabled={isPending}
              className="inline-flex items-center gap-1.5 h-7 px-3 bg-red-500 hover:bg-red-600 rounded-lg text-sm font-medium transition-colors">
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
            </button>
          )}
          <button onClick={() => setSelected(new Set())} className="ml-auto text-white/60 hover:text-white text-xs">Clear</button>
        </div>
      )}

      {/* List */}
      {sorted.length === 0 ? (
        <div className="bg-white border rounded-xl py-16 text-center text-slate-400">
          {locations.length === 0 ? "No locations yet." : "No locations match your search or filters."}
        </div>
      ) : viewMode === "table" ? (
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-3 w-10">
                    <input ref={headerCheckRef} type="checkbox" checked={allChecked} onChange={toggleAll} className="rounded border-slate-300 cursor-pointer" />
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <button onClick={() => toggleSort("name")} className="inline-flex items-center gap-1 hover:text-slate-800">
                      Name {sortKey === "name" && (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    </button>
                  </th>
                  {cols.map((col) => (
                    <th key={col.key} className={cn("px-4 py-3 font-semibold", col.align === "right" && "text-right")}>
                      {col.sortable ? (
                        <button onClick={() => toggleSort(col.key as SortKey)} className="inline-flex items-center gap-1 hover:text-slate-800">
                          {col.label} {sortKey === col.key && (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                        </button>
                      ) : col.label}
                    </th>
                  ))}
                  {canEdit && <th className="px-4 py-3 w-20" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((l) => (
                  <tr key={l.id} className={cn("transition-colors", selected.has(l.id) ? "bg-blue-50" : "hover:bg-slate-50")}>
                    <td className="px-4 py-2.5">
                      <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleRow(l.id)} className="rounded border-slate-300 cursor-pointer" />
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/locations/${l.id}`} className="font-medium text-slate-900 hover:text-blue-600">
                        {l.name}
                      </Link>
                    </td>
                    {cols.map((col) => (
                      <td key={col.key} className={cn("px-4 py-2.5 text-slate-600", col.align === "right" && "text-right")}>
                        {col.key === "practice" && <Link href={`/practices/${l.practiceId}`} className="text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md hover:bg-slate-200">{l.practiceName}</Link>}
                        {col.key === "address" && <span className="text-slate-500">{l.address || "—"}</span>}
                        {col.key === "phone" && <span className="text-slate-500">{l.phone || "—"}</span>}
                        {col.key === "fax" && <span className="text-slate-500">{l.fax || "—"}</span>}
                        {col.key === "providers" && l.providerCount}
                        {col.key === "referrals" && l.referralCount}
                        {col.key === "activities" && l.activityCount}
                        {col.key === "owner" && <span className="text-slate-500">{l.ownerName || "—"}</span>}
                        {col.key === "created" && <span className="text-slate-500">{fmtDate(l.createdAt)}</span>}
                      </td>
                    ))}
                    {canEdit && (
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex gap-1">
                          <button onClick={() => setEditRow(l)} className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-3.5 w-3.5" /></button>
                          {canDelete && (
                            <button disabled={isPending} onClick={() => { if (confirm(`Delete "${l.name}"?`)) startTransition(async () => { const r = await deleteLocation(l.id); if ((r as any)?.error) alert((r as any).error); else router.refresh() }) }}
                              className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sorted.map((l) => (
            <div key={l.id} className={cn("bg-white border rounded-xl p-4 space-y-2 transition-colors", selected.has(l.id) ? "border-blue-300 bg-blue-50/40" : "border-slate-200 hover:border-slate-300")}>
              <div className="flex items-start gap-2.5">
                <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleRow(l.id)} className="mt-1 rounded border-slate-300 cursor-pointer" />
                <div className="flex-1 min-w-0">
                  <Link href={`/locations/${l.id}`} className="font-semibold text-slate-900 hover:text-blue-600 block truncate">{l.name}</Link>
                  <Link href={`/practices/${l.practiceId}`} className="text-xs text-slate-500 hover:underline inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{l.practiceName}</Link>
                </div>
              </div>
              {l.address && <p className="text-sm text-slate-600 flex items-start gap-1.5"><MapPin className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />{l.address}</p>}
              <div className="flex items-center gap-3 text-xs text-slate-500 pt-1">
                <span>{l.providerCount} providers</span>
                <span>{l.referralCount} referrals</span>
                {l.phone && <span className="ml-auto text-slate-400">{l.phone}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} subject="locations" defaultName="locations" getData={buildExport} />

      {canEdit && (
        <>
          <Dialog open={addOpen} onOpenChange={(o) => !o && setAddOpen(false)}>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Location</DialogTitle></DialogHeader>
              <LocationForm practices={practices} isPending={isPending}
                onSubmit={async (d) => { startTransition(async () => { const r = await createLocation(d); if ((r as any)?.error) alert(typeof (r as any).error === "string" ? (r as any).error : "Could not create location"); else { setAddOpen(false); router.refresh() } }) }}
                onClose={() => setAddOpen(false)} />
            </DialogContent>
          </Dialog>

          <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
            <DialogContent>
              <DialogHeader><DialogTitle>Edit Location</DialogTitle></DialogHeader>
              {editRow && (
                <LocationForm practices={practices} isPending={isPending} defaultValues={editRow}
                  onSubmit={async (d) => { startTransition(async () => { const r = await updateLocation(editRow.id, d); if ((r as any)?.error) alert(typeof (r as any).error === "string" ? (r as any).error : "Could not update location"); else { setEditRow(null); router.refresh() } }) }}
                  onClose={() => setEditRow(null)} />
              )}
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
}

// ── Add / edit form ────────────────────────────────────────────────────────────
function LocationForm({ practices, defaultValues, onSubmit, isPending, onClose }: {
  practices: PracticeOption[]
  defaultValues?: LocationRow
  onSubmit: (d: { name: string; practiceId: string; address: string; phone: string; fax: string }) => Promise<void> | void
  isPending: boolean
  onClose: () => void
}) {
  const [name, setName] = useState(defaultValues?.name ?? "")
  const [practiceId, setPracticeId] = useState(defaultValues?.practiceId ?? (practices[0]?.id ?? ""))
  const [address, setAddress] = useState(defaultValues?.address ?? "")
  const [phone, setPhone] = useState(defaultValues?.phone ?? "")
  const [fax, setFax] = useState(defaultValues?.fax ?? "")
  const [err, setErr] = useState("")

  const inputCls = "h-9 w-full px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
  const labelCls = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1"

  return (
    <form onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) { setErr("Name is required"); return } if (!practiceId) { setErr("Practice is required"); return } await onSubmit({ name, practiceId, address, phone, fax }) }} className="space-y-4">
      {err && <p className="text-xs text-red-600 bg-red-50 px-2 py-1.5 rounded-lg border border-red-100">{err}</p>}
      <div>
        <label className={labelCls}>Location Name *</label>
        <input value={name} onChange={(e) => { setName(e.target.value); setErr("") }} className={inputCls} placeholder="Main Office" />
      </div>
      <div>
        <label className={labelCls}>Practice *</label>
        <StyledSelect value={practiceId} onChange={(e) => setPracticeId(e.target.value)} className={inputCls}>
          <option value="">— Select practice —</option>
          {practices.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </StyledSelect>
      </div>
      <div>
        <label className={labelCls}>Address</label>
        <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} placeholder="123 Main St, City, ST 60000" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Phone</label>
          <PhoneInput value={phone} onChange={setPhone} />
        </div>
        <div>
          <label className={labelCls}>Fax</label>
          <PhoneInput value={fax} onChange={setFax} />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={isPending}
          className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1.5">
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
        </button>
        <button type="button" onClick={onClose} className="h-9 px-3 text-sm text-slate-500 hover:text-slate-800">Cancel</button>
      </div>
    </form>
  )
}
