"use client"

import { useState, useTransition, useEffect, useRef, type ReactNode } from "react"
import { OptionValue } from "@/components/option-value"
import Link from "next/link"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Plus, Trash2, Loader2, Check, Columns3, ChevronDown } from "lucide-react"
import BulkActionBar, { bulkDanger } from "@/components/ui/bulk-action-bar"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import { useColumnResize, ColResizer } from "@/components/ui/use-column-resize"
import { ChevronUp } from "lucide-react"
import { createCustomObjectRecord, bulkDeleteCustomObjectRecords, exportCustomObjectRecords } from "@/app/actions/custom-object-records"
import type { CustomObjectProperty } from "@/app/actions/custom-objects"
import StyledSelect from "@/components/ui/styled-select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import FilterBuilder from "@/components/ui/filter-builder"
import ExportDialog from "@/components/ui/export-dialog"
import { ViewAccessSelector, type ViewAccessValue, type ShareUser, type ShareTeam } from "@/components/view-access-selector"
import { createCustomObjectView, deleteCustomObjectView } from "@/app/actions/custom-object-views"
import { reorderViews } from "@/app/actions/view-order"
import { useCardReorder } from "@/components/use-card-reorder"
import ColumnChooserModal from "@/components/ui/column-chooser"
import { useColumnPrefs } from "@/components/ui/use-column-prefs"
import { frozenMap, frozenHeadStyle, frozenCellStyle, frozenClass } from "@/lib/frozen-columns"
import { type FilterField, type FilterState, emptyFilter, matchesFilter, activeConditionCount, customPropertyFilterFields, decodeFilterParam } from "@/lib/filters"
import { Search, Download, Globe, Users, UserCog, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { recordName, isPersonObject, personPartIds } from "@/lib/record-name"
import { formatNumber } from "@/lib/number-format"

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
  // Server-side mode (large objects): `records` is one already-sorted/filtered page.
  serverMode?: boolean
  serverTotal?: number
  serverPage?: number
  serverPageSize?: number
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

function displayValue(p: CustomObjectProperty | undefined, v: any, userMap: Record<string, string>): string {
  if (!p) return "—"
  if (v === null || v === undefined || v === "") return "—"
  switch (p.type) {
    case "CHECKBOX": return v ? "Yes" : "No"
    case "NUMBER": return formatNumber(v, (p as any).numberFormat)
    case "DATE": return fmtDate(v)
    case "DATE_TIME": return v ? new Date(v).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—"
    case "DROPDOWN": { const l = (p as any).optionLabels as Record<string, string> | undefined; return l?.[String(v)] ?? String(v) }
    case "MULTI_SELECT": { const l = (p as any).optionLabels as Record<string, string> | undefined; return Array.isArray(v) ? v.map((x) => l?.[String(x)] ?? String(x)).join(", ") : String(v) }
    case "USER": return userMap[v] ?? String(v)
    default: return String(v)
  }
}

// Styled cell (dot/badge for dropdowns); falls back to displayValue's text.
function displayCell(p: CustomObjectProperty | undefined, v: any, userMap: Record<string, string>): ReactNode {
  if (!p) return "—"
  if ((p.type === "DROPDOWN" || p.type === "MULTI_SELECT") && v != null && v !== "" && !(Array.isArray(v) && v.length === 0)) {
    return <OptionValue value={v} optionLabels={(p as any).optionLabels} optionColors={(p as any).optionColors} optionStyle={(p as any).optionStyle} />
  }
  return displayValue(p, v, userMap)
}

export default function CustomObjectList({ objectKey, singular, plural, ownerLabel, properties, records, users, canEdit, canDelete, savedViews = [], shareUsers = [], shareTeams = [], serverMode = false, serverTotal = 0, serverPage = 1, serverPageSize = 50 }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const urlParams = useSearchParams()
  const isServer = serverMode
  // Push list state into the URL (server mode drives the query from it).
  function pushParams(patch: Record<string, string | null>) {
    const params = new URLSearchParams(urlParams.toString())
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === "") params.delete(k); else params.set(k, v) }
    router.push(`${pathname}?${params.toString()}`)
  }
  const [isPending, startTransition] = useTransition()
  const userMap = Object.fromEntries(users.map((u) => [u.id, u.label]))

  const primary = properties.find((p) => p.primary) ?? properties[0]
  const isPerson = isPersonObject(properties)
  const nameHeader = isPerson ? "Name" : (primary?.name ?? "Name")
  // The Name column already shows first+last for person objects — don't repeat them.
  const nameParts = personPartIds(properties)
  const otherProps = properties.filter((p) => p.id !== primary?.id && !nameParts.includes(p.id))

  // Columns: Record ID + Name (both toggleable) + property columns + owner + created.
  const dataCols = [...otherProps.map((p) => ({ key: p.id, label: p.name })), { key: "__owner", label: ownerLabel }, { key: "__created", label: "Created" }]
  const allCols = [{ key: "__id", label: "Record ID" }, { key: "__name", label: nameHeader }, ...dataCols]
  const { columns: visibleCols, frozen: frozenCount, apply: applyCols, setColumns: setVisibleCols } = useColumnPrefs(`co_${objectKey}_cols_v2`, allCols.map((c) => c.key))
  const [colModalOpen, setColModalOpen] = useState(false)
  // Columns render in the user's chosen order (not catalog order).
  const cols = (visibleCols.map((k) => allCols.find((c) => c.key === k)).filter(Boolean) as { key: string; label: string }[])

  // Filter + search + export.
  const filterFields: FilterField[] = [
    { key: "__recordNumber", label: "Record ID", type: "number", getValue: (r) => r.recordNumber },
    { key: "__owner", label: ownerLabel, type: "select", options: users.map((u) => ({ value: u.id, label: u.label })), getValue: (r) => r.ownerId },
    { key: "__created", label: "Created", type: "date", getValue: (r) => r.createdAt },
    ...customPropertyFilterFields(properties.map((p) => ({ id: p.id, name: p.name, type: p.type, options: p.options })), "values"),
  ]
  // Filter/search seed from the URL in server mode so the UI reflects the query.
  const [filter, setFilter] = useState<FilterState>(() => (isServer ? decodeFilterParam(urlParams.get("filter")) ?? emptyFilter() : emptyFilter()))
  const [search, setSearch] = useState(() => (isServer ? urlParams.get("search") ?? "" : ""))
  const [exportOpen, setExportOpen] = useState(false)

  // Server mode: `records` is already the filtered+sorted page — render as-is.
  const filtered = isServer ? records : records.filter((r) => {
    const q = search.toLowerCase().trim()
    if (q) {
      const hay = Object.values(r.values).map((v) => (Array.isArray(v) ? v.join(" ") : String(v ?? ""))).join(" ").toLowerCase()
      if (!hay.includes(q)) return false
    }
    return matchesFilter(r, filter, filterFields)
  })
  const filtersActive = activeConditionCount(filter, filterFields) > 0

  const { colWidth, startResize } = useColumnResize(`co_${objectKey}_colWidths`)
  // Drag column headers to reorder; the order (and frozen count) persist per user.
  const colReorder = useCardReorder(cols, (c) => c.key, (ids) => setVisibleCols(ids))
  // Frozen (sticky) columns: leading fixed __id/__name + the first data columns,
  // offset past the 40px row-select checkbox. widthOf mirrors the <colgroup>.
  const widthOf = (k: string) => k === "__id" ? (colWidth("__id") ?? 96) : k === "__name" ? (colWidth("__name") ?? 240) : (colWidth(k) ?? 180)
  const fmap = frozenMap(colReorder.order.map((c) => c.key), frozenCount, widthOf, 40)
  const cbFrozen = frozenCount > 0 // freeze the checkbox column whenever anything is frozen
  const [sortKeyC, setSortKeyC] = useState<string>("__id")
  const [sortDirC, setSortDirC] = useState<"asc" | "desc">("desc") // newest record first
  const sortKey = isServer ? (urlParams.get("sort") ?? "__id") : sortKeyC
  const sortDir: "asc" | "desc" = isServer ? (urlParams.get("dir") === "asc" ? "asc" : "desc") : sortDirC
  // Text columns start A→Z; id/date columns start newest/highest first.
  const toggleSort = (k: string) => {
    const firstDir = k === "__id" || k === "__created" ? "desc" : "asc"
    const nextDir = sortKey === k ? (sortDir === "asc" ? "desc" : "asc") : firstDir
    if (isServer) { pushParams({ sort: k, dir: nextDir, page: "1" }); return }
    if (sortKeyC === k) setSortDirC((d) => (d === "asc" ? "desc" : "asc")); else { setSortKeyC(k); setSortDirC(firstDir) }
  }
  const sortVal = (r: RecordRow, key: string): string | number => {
    if (key === "__id") return r.recordNumber ?? 0
    if (key === "__name") return (recordName(properties, r.values, "") || (primary ? displayValue(primary, r.values[primary.id], userMap) : "")).toLowerCase()
    if (key === "__owner") return (r.ownerName ?? "").toLowerCase()
    if (key === "__created") return new Date(r.createdAt).getTime()
    const p = otherProps.find((x) => x.id === key)
    return p ? displayValue(p, r.values[key], userMap).toLowerCase() : ""
  }
  const sorted = isServer ? filtered : [...filtered].sort((a, b) => {
    const va = sortVal(a, sortKey), vb = sortVal(b, sortKey)
    const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))
    return sortDir === "asc" ? cmp : -cmp
  })
  const SortIcon = ({ k }: { k: string }) => sortKey === k ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null

  // Client-side pagination (25 / 50 / 100 per page). Server mode paginates via URL.
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const clientPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const pageC = Math.min(page, clientPages)
  const paged = isServer ? sorted : sorted.slice((pageC - 1) * pageSize, (pageC - 1) * pageSize + pageSize)
  useEffect(() => { setPage(1) }, [search, filter, sortKey, sortDir, pageSize]) // reset on result/size change

  // Server-mode search: debounce URL updates so typing doesn't spam the server.
  useEffect(() => {
    if (!isServer) return
    const cur = urlParams.get("search") ?? ""
    if (search === cur) return
    const t = setTimeout(() => pushParams({ search: search || null, page: "1" }), 400)
    return () => clearTimeout(t)
  }, [search, isServer]) // eslint-disable-line react-hooks/exhaustive-deps

  // Server-mode filter: push the encoded filter to the URL when it changes.
  function onFilterChange(next: FilterState) {
    setFilter(next)
    if (isServer) pushParams({ filter: activeConditionCount(next, filterFields) > 0 ? JSON.stringify(next) : null, page: "1" })
  }
  const totalPages = isServer ? Math.max(1, Math.ceil(serverTotal / serverPageSize)) : 1

  // Saved views (applied in-memory).
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [newViewName, setNewViewName] = useState("")
  const [newViewAccess, setNewViewAccess] = useState<ViewAccessValue>({ visibility: "PRIVATE", teamId: null, sharedUserIds: [] })
  const [savingView, setSavingView] = useState(false)
  const currentKey = JSON.stringify({ filter, columns: visibleCols })
  const activeViewId = savedViews.find((v) => JSON.stringify({ filter: v.config.filter, columns: v.config.columns }) === currentKey)?.id
    ?? (!filtersActive && !search ? "__default__" : null)
  function applyView(v: SavedView) { setFilter(v.config.filter ?? emptyFilter()); applyCols(v.config.columns ?? allCols.map((c) => c.key), (v.config as any).frozen ?? 0); setSearch("") }
  function applyDefault() { setFilter(emptyFilter()); applyCols(allCols.map((c) => c.key), 0); setSearch("") }
  // Drag to reorder the view tabs (per-user order, persisted).
  const viewReorder = useCardReorder(savedViews, (v) => v.id, (ids) => startTransition(() => { reorderViews("CUSTOM_OBJECT", objectKey, ids) }))
  function saveView() {
    if (!newViewName.trim()) return
    setSavingView(true)
    startTransition(async () => {
      await createCustomObjectView(objectKey, newViewName.trim(), { filter, columns: visibleCols, frozen: frozenCount } as any, newViewAccess)
      setSavingView(false); setShowSaveForm(false); setNewViewName(""); setNewViewAccess({ visibility: "PRIVATE", teamId: null, sharedUserIds: [] })
      router.refresh()
    })
  }
  function deleteView(id: string) { startTransition(async () => { await deleteCustomObjectView(id); router.refresh() }) }

  function buildExportRows(list: RecordRow[]) {
    const headers = ["Record ID", primary?.name ?? "Name", ...cols.map((c) => c.label)]
    const rows = list.map((r) => [
      r.recordNumber != null ? `#${r.recordNumber}` : "",
      primary ? displayValue(primary, r.values[primary.id], userMap) : "",
      ...cols.map((c) => c.key === "__owner" ? (r.ownerName ?? "") : c.key === "__created" ? fmtDate(r.createdAt) : displayValue(otherProps.find((p) => p.id === c.key)!, r.values[c.key], userMap)),
    ])
    return { headers, rows }
  }
  // Client mode: export the filtered rows. Server mode: fetch ALL matching rows.
  const exportData = isServer
    ? async () => buildExportRows(await exportCustomObjectRecords(objectKey, {
        sort: sortKey, dir: sortDir, search,
        filter: activeConditionCount(filter, filterFields) > 0 ? JSON.stringify(filter) : undefined,
      }) as RecordRow[])
    : () => buildExportRows(filtered)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const allChecked = filtered.length > 0 && filtered.every((r) => selected.has(r.id))
  function toggleRow(id: string) { setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  async function bulkDelete() {
    if (!(await confirmDialog(`Delete ${selected.size} record${selected.size !== 1 ? "s" : ""}?`))) return
    startTransition(async () => { await bulkDeleteCustomObjectRecords(objectKey, Array.from(selected)); setSelected(new Set()); router.refresh() })
  }

  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterBuilder fields={filterFields} value={filter} onChange={onFilterChange} />
        <button onClick={() => setColModalOpen(true)}
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-600 hover:border-zinc-400">
          <Columns3 className="h-3.5 w-3.5" /> Columns <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
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
      {isServer
        ? (filtersActive || search) && <p className="text-xs text-slate-400 -mt-1">{serverTotal} {serverTotal === 1 ? singular.toLowerCase() : plural.toLowerCase()} match</p>
        : (filtersActive || search) && <p className="text-xs text-slate-400 -mt-1">{filtered.length} of {records.length}</p>}

      {/* Saved views */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={applyDefault}
          className={cn("inline-flex items-center h-8 px-3 rounded-lg border text-sm font-medium transition-all", activeViewId === "__default__" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400")}>
          Default
        </button>
        {viewReorder.order.map((v) => (
          <div key={v.id}
            {...viewReorder.handleProps(v.id)}
            {...viewReorder.cardProps(v.id)}
            className={cn("inline-flex items-center h-8 rounded-lg border text-sm font-medium overflow-hidden cursor-grab active:cursor-grabbing", viewReorder.dragging === v.id && "opacity-50", activeViewId === v.id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400")}>
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
          <div className="overflow-x-auto rounded-xl">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col style={{ width: 40 }} />
                {colReorder.order.map((c) => <col key={c.key} style={{ width: widthOf(c.key) }} />)}
              </colgroup>
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <th style={cbFrozen ? { position: "sticky", left: 0, zIndex: 30 } : undefined} className={cn("px-3 py-2 w-10", cbFrozen && "bg-slate-50")}>
                    <input type="checkbox" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(filtered.map((r) => r.id)))} className="rounded border-slate-300 cursor-pointer" />
                  </th>
                  {colReorder.order.map((c) => (
                    <th key={c.key}
                      {...colReorder.handleProps(c.key)}
                      {...colReorder.cardProps(c.key)}
                      style={frozenHeadStyle(fmap.get(c.key))}
                      className={cn("px-3 py-2 font-semibold relative overflow-hidden cursor-grab active:cursor-grabbing transition-colors", colReorder.dragging === c.key ? "bg-slate-200/70" : cn("hover:bg-slate-100", frozenClass(fmap.get(c.key), "bg-slate-50")))}>
                      <button onClick={() => toggleSort(c.key)} className="flex items-center gap-1 w-full min-w-0 hover:text-slate-800"><span className="flex-1 min-w-0 truncate text-left">{c.label}</span><SortIcon k={c.key} /></button>
                      <ColResizer onMouseDown={(e) => startResize(c.key, e)} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((r) => (
                  <tr key={r.id} className={cn("transition-colors", selected.has(r.id) ? "bg-blue-50" : "hover:bg-slate-50")}>
                    <td style={cbFrozen ? { position: "sticky", left: 0, zIndex: 10 } : undefined} className={cn("px-3 py-2.5", cbFrozen && "bg-white")}><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleRow(r.id)} className="rounded border-slate-300 cursor-pointer" /></td>
                    {colReorder.order.map((c) => (
                      <td key={c.key} style={{ maxWidth: widthOf(c.key), ...frozenCellStyle(fmap.get(c.key)) }}
                        className={cn("px-3 py-2.5 truncate", c.key === "__id" ? "text-slate-400 font-mono text-xs" : "text-slate-600", frozenClass(fmap.get(c.key)))}>
                        {c.key === "__id" ? (r.recordNumber != null ? `#${r.recordNumber}` : "—")
                          : c.key === "__name" ? (
                            <Link href={`/objects/${objectKey}/${r.id}`} className="font-medium text-slate-900 hover:text-blue-600">
                              {recordName(properties, r.values, "") || (primary && displayValue(primary, r.values[primary.id], userMap)) || "Untitled"}
                            </Link>
                          )
                          : c.key === "__owner" ? (r.ownerName ?? "—")
                          : c.key === "__created" ? fmtDate(r.createdAt)
                          : displayCell(otherProps.find((p) => p.id === c.key)!, r.values[c.key], userMap)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Client-side pagination (25 / 50 / 100 per page) */}
      {!isServer && sorted.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
          <span>Showing {(pageC - 1) * pageSize + 1}–{Math.min(sorted.length, (pageC - 1) * pageSize + pageSize)} of {sorted.length}</span>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-400">Per page
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="h-8 px-2 border border-slate-200 rounded-lg bg-white text-sm text-slate-700 focus:outline-none">
                <option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
              </select>
            </label>
            <div className="flex items-center gap-1">
              <button disabled={pageC <= 1} onClick={() => setPage(pageC - 1)}
                className="h-8 px-2.5 inline-flex items-center rounded-lg border border-slate-200 bg-white hover:border-slate-400 disabled:opacity-40">Prev</button>
              <span className="px-2 tabular-nums">Page {pageC} of {clientPages}</span>
              <button disabled={pageC >= clientPages} onClick={() => setPage(pageC + 1)}
                className="h-8 px-2.5 inline-flex items-center rounded-lg border border-slate-200 bg-white hover:border-slate-400 disabled:opacity-40">Next</button>
            </div>
          </div>
        </div>
      )}

      {/* Server-side pagination */}
      {isServer && serverTotal > serverPageSize && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>Showing {(serverPage - 1) * serverPageSize + 1}–{Math.min(serverTotal, serverPage * serverPageSize)} of {serverTotal}</span>
          <div className="flex items-center gap-1">
            <button disabled={serverPage <= 1} onClick={() => pushParams({ page: String(serverPage - 1) })}
              className="h-8 px-2.5 inline-flex items-center rounded-lg border border-slate-200 bg-white hover:border-slate-400 disabled:opacity-40">Prev</button>
            <span className="px-2 tabular-nums">Page {serverPage} of {totalPages}</span>
            <button disabled={serverPage >= totalPages} onClick={() => pushParams({ page: String(serverPage + 1) })}
              className="h-8 px-2.5 inline-flex items-center rounded-lg border border-slate-200 bg-white hover:border-slate-400 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}

      {canEdit && addOpen && (
        <AddRecordDialog objectKey={objectKey} singular={singular} ownerLabel={ownerLabel} properties={properties} users={users}
          onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); router.refresh() }} />
      )}

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} subject={plural} defaultName={objectKey} getData={exportData} count={isServer ? serverTotal : undefined} />

      <ColumnChooserModal
        open={colModalOpen}
        onClose={() => setColModalOpen(false)}
        columns={allCols}
        selected={visibleCols}
        frozen={frozenCount}
        onApply={(sel, fr) => applyCols(sel, fr)}
        createHref="/settings/objects"
      />
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
                  {optsFor(p).map((o) => <option key={o} value={o}>{(p as any).optionLabels?.[o] ?? o}</option>)}
                </StyledSelect>
              ) : p.type === "MULTI_SELECT" ? (
                <div className="flex flex-wrap gap-1.5">
                  {optsFor(p).map((o) => {
                    const arr: string[] = Array.isArray(values[p.id]) ? values[p.id] : []
                    const on = arr.includes(o)
                    return <button key={o} type="button" onClick={() => set(p.id, on ? arr.filter((x) => x !== o) : [...arr, o])}
                      className={cn("px-2.5 py-1 rounded-lg text-xs font-medium border", on ? "bg-blue-600 text-white border-blue-600" : "bg-white text-zinc-600 border-zinc-200")}>{(p as any).optionLabels?.[o] ?? o}</button>
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
