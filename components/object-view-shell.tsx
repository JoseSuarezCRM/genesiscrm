"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import {
  Plus, Search, Download, Columns3, ChevronDown, ChevronUp, Check, Loader2, X,
  Globe, Users, UserCog, Settings, Table2, LayoutGrid, CalendarDays,
} from "lucide-react"
import FilterBuilder from "@/components/ui/filter-builder"
import ExportDialog from "@/components/ui/export-dialog"
import ColumnChooserModal from "@/components/ui/column-chooser"
import CreateRecordModal from "@/components/create-record-modal"
import PipelineSelector from "@/components/pipeline-selector"
import QuickFilterBar from "@/components/quick-filter-bar"
import SortByControl from "@/components/sort-by-control"
import ViewSettingsPanel from "@/components/view-settings-panel"
import CustomObjectList, { type RecordRow } from "@/components/custom-object-list"
import ObjectBoard from "@/components/object-board"
import ObjectCalendar from "@/components/object-calendar"
import { ViewAccessSelector, type ViewAccessValue, type ShareUser, type ShareTeam } from "@/components/view-access-selector"
import { useCardReorder } from "@/components/use-card-reorder"
import { showToast } from "@/components/toast"
import {
  createCustomObjectView, updateCustomObjectView, deleteCustomObjectView,
  renameCustomObjectView, setCustomObjectViewAccess,
} from "@/app/actions/custom-object-views"
import { reorderViews } from "@/app/actions/view-order"
import { createCustomObjectRecord, exportCustomObjectRecords } from "@/app/actions/custom-object-records"
import { getObjectBoardData, type ObjectBoardData } from "@/app/actions/object-board"
import { readAssocValue, type AssociationGroup } from "@/lib/association-columns"
import { activeConditionCount, decodeFilterParam, emptyFilter, matchesFilter, type FilterState } from "@/lib/filters"
import { buildFilterFields, buildObjectColumns, type ObjectProperty } from "@/lib/object-columns"
import { normalizeViewConfig, viewFingerprint, type ObjectViewConfig, type ObjectViewType } from "@/lib/object-views"
import { displayValue, fmtDate } from "@/components/object-display"
import { recordName } from "@/lib/record-name"
import { cpToFieldDef } from "@/lib/cp-field-def"
import type { RecordFieldDef } from "@/lib/record-field-catalog"
import type { CreateFormField } from "@/app/actions/create-form"
import { cn } from "@/lib/utils"

export interface SavedView {
  id: string
  name: string
  config: any
  visibility?: string
  teamId?: string | null
  sharedUserIds?: string[]
  isOwner?: boolean
}

interface Props {
  objectKey: string
  singular: string
  plural: string
  ownerLabel: string
  properties: ObjectProperty[]
  records: RecordRow[]
  totalRecords: number
  users: { id: string; label: string }[]
  canEdit: boolean
  canDelete: boolean
  savedViews: SavedView[]
  shareUsers: ShareUser[]
  shareTeams: ShareTeam[]
  serverMode: boolean
  serverTotal: number
  serverPage: number
  serverPageSize: number
  createFormConfig: CreateFormField[] | null
  isAdmin: boolean
  associations: AssociationGroup[]
  pipelines: { id: string; name: string; color: string }[]
  pipelineColorStyle: string
}

const TYPE_ICON: Record<ObjectViewType, typeof Table2> = { table: Table2, board: LayoutGrid, calendar: CalendarDays }

export default function ObjectViewShell(props: Props) {
  const {
    objectKey, singular, plural, ownerLabel, properties, records, totalRecords, users,
    canEdit, canDelete, savedViews, shareUsers, shareTeams, serverMode,
    serverTotal, serverPage, serverPageSize, createFormConfig, isAdmin, associations,
    pipelines, pipelineColorStyle,
  } = props

  const router = useRouter()
  const pathname = usePathname()
  const urlParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const userMap = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.label])), [users])

  const catalog = useMemo(() => buildObjectColumns(properties, ownerLabel, associations), [properties, ownerLabel, associations])
  const filterFields = useMemo(() => buildFilterFields(properties, ownerLabel, users), [properties, ownerLabel, users])
  const defaultColumns = useMemo(() => catalog.baseCols.map((c) => c.key), [catalog])

  // ── View state ─────────────────────────────────────────────────────────────
  const [appliedViewId, setAppliedViewId] = useState<string | null>(urlParams.get("viewId"))
  const appliedView = savedViews.find((v) => v.id === appliedViewId) ?? null
  const [cfg, setCfg] = useState<ObjectViewConfig>(() => {
    const base = normalizeViewConfig(null, defaultColumns)
    const seedType = urlParams.get("view") as ObjectViewType | null
    const seedFilter = serverMode ? decodeFilterParam(urlParams.get("filter")) : null
    const seedSort = serverMode && urlParams.get("sort")
      ? { key: urlParams.get("sort")!, dir: (urlParams.get("dir") === "asc" ? "asc" : "desc") as "asc" | "desc" }
      : base.sort
    return {
      ...base,
      type: seedType === "board" || seedType === "calendar" ? seedType : base.type,
      pipelineId: urlParams.get("pipeline") ?? base.pipelineId,
      filter: seedFilter ?? base.filter,
      sort: seedSort,
    }
  })
  const [name, setName] = useState(appliedView?.name ?? "")
  const [access, setAccess] = useState<ViewAccessValue>({ visibility: "PRIVATE", teamId: null, sharedUserIds: [] })
  const [search, setSearch] = useState(() => (serverMode ? urlParams.get("search") ?? "" : ""))
  const [savedFingerprint, setSavedFingerprint] = useState<string | null>(null)

  const [panelOpen, setPanelOpen] = useState(false)
  const [toolbarOpen, setToolbarOpen] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [colModalOpen, setColModalOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [newViewName, setNewViewName] = useState("")
  const [newViewAccess, setNewViewAccess] = useState<ViewAccessValue>({ visibility: "PRIVATE", teamId: null, sharedUserIds: [] })
  const [savingView, setSavingView] = useState(false)

  const dirty = savedFingerprint !== null && viewFingerprint(cfg) !== savedFingerprint

  // The unsaved (default) view survives a reload, the way the column prefs used to.
  // Loaded in an effect, not the initializer, so SSR and the first render agree.
  const prefsKey = `co_${objectKey}_view_v1`
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  useEffect(() => {
    if (urlParams.get("viewId")) { setPrefsLoaded(true); return }
    try {
      const raw = localStorage.getItem(prefsKey)
      if (raw) {
        setCfg((c) => ({ ...normalizeViewConfig(JSON.parse(raw), defaultColumns), type: c.type, pipelineId: c.pipelineId }))
      } else {
        // Fall back to the column prefs saved before views carried their own config.
        const legacy = JSON.parse(localStorage.getItem(`co_${objectKey}_cols_v2`) || "null")
        if (legacy?.columns?.length) setCfg((c) => ({ ...c, columns: legacy.columns, frozen: legacy.frozen ?? 0 }))
      }
    } catch {}
    setPrefsLoaded(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsKey])
  useEffect(() => {
    if (!prefsLoaded || appliedViewId) return
    try { localStorage.setItem(prefsKey, JSON.stringify(cfg)) } catch {}
  }, [cfg, appliedViewId, prefsLoaded, prefsKey])

  // Keep the URL in step so "Copy link to view" reproduces what's on screen.
  const pushParams = useCallback((patch: Record<string, string | null>) => {
    const p = new URLSearchParams(urlParams.toString())
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === "") p.delete(k); else p.set(k, v) }
    router.replace(`${pathname}?${p.toString()}`, { scroll: false })
  }, [router, pathname, urlParams])

  useEffect(() => {
    pushParams({
      view: cfg.type === "table" ? null : cfg.type,
      pipeline: cfg.type === "table" ? null : cfg.pipelineId,
      viewId: appliedViewId,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.type, cfg.pipelineId, appliedViewId])

  function applyView(v: SavedView) {
    const next = normalizeViewConfig(v.config, defaultColumns)
    setCfg(next); setAppliedViewId(v.id); setName(v.name); setSearch("")
    setSavedFingerprint(viewFingerprint(next))
    setAccess({
      visibility: (v.visibility as any) ?? "PRIVATE",
      teamId: v.teamId ?? null,
      sharedUserIds: v.sharedUserIds ?? [],
    })
    if (serverMode) pushParams({ filter: null, search: null, page: "1" })
  }
  function applyDefault() {
    setCfg(normalizeViewConfig(null, defaultColumns)); setAppliedViewId(null); setName(""); setSearch("")
    setSavedFingerprint(null)
    if (serverMode) pushParams({ filter: null, search: null, page: "1" })
  }
  function resetView() {
    if (appliedView) applyView(appliedView); else applyDefault()
  }

  const saveChanges = useCallback(() => {
    if (!appliedViewId || !dirty) return
    setSavingView(true)
    startTransition(async () => {
      const res = await updateCustomObjectView(appliedViewId, cfg as any) as any
      setSavingView(false)
      if (res?.error) { showToast(res.error); return }
      setSavedFingerprint(viewFingerprint(cfg))
      showToast("View saved")
      router.refresh()
    })
  }, [appliedViewId, dirty, cfg, router])

  function saveAsNew() {
    if (!newViewName.trim()) return
    setSavingView(true)
    startTransition(async () => {
      const res = await createCustomObjectView(objectKey, newViewName.trim(), cfg as any, newViewAccess) as any
      setSavingView(false); setShowSaveForm(false); setNewViewName("")
      setNewViewAccess({ visibility: "PRIVATE", teamId: null, sharedUserIds: [] })
      if (res?.id) { setAppliedViewId(res.id); setName(newViewName.trim()); setSavedFingerprint(viewFingerprint(cfg)) }
      router.refresh()
    })
  }
  function deleteView(id: string) {
    startTransition(async () => {
      await deleteCustomObjectView(id)
      if (appliedViewId === id) applyDefault()
      router.refresh()
    })
  }
  function commitRename(next: string) {
    setName(next)
    if (!appliedViewId) return
    const trimmed = next.trim()
    if (!trimmed || trimmed === appliedView?.name) return
    startTransition(async () => { await renameCustomObjectView(appliedViewId, trimmed); router.refresh() })
  }
  function commitAccess(next: ViewAccessValue) {
    setAccess(next)
    if (!appliedViewId) return
    startTransition(async () => {
      const res = await setCustomObjectViewAccess(appliedViewId, next as any) as any
      if (res?.error) showToast(res.error); else router.refresh()
    })
  }

  // Drag to reorder the view tabs (per-user order, persisted).
  const viewReorder = useCardReorder(savedViews, (v) => v.id, (ids) => startTransition(() => { reorderViews("CUSTOM_OBJECT", objectKey, ids) }))

  // ── Rows: filter + sort (client mode); server mode gets a ready page ────────
  const filtersActive = activeConditionCount(cfg.filter, filterFields) > 0

  const filtered = useMemo(() => {
    if (serverMode) return records
    const q = search.toLowerCase().trim()
    return records.filter((r) => {
      if (q) {
        const hay = Object.values(r.values).map((v) => (Array.isArray(v) ? v.join(" ") : String(v ?? ""))).join(" ").toLowerCase()
        if (!hay.includes(q)) return false
      }
      return matchesFilter(r, cfg.filter, filterFields)
    })
  }, [records, search, cfg.filter, filterFields, serverMode])

  const sortVal = useCallback((r: RecordRow, key: string): string | number => {
    if (key === "__id" || key === "__recordNumber") return r.recordNumber ?? 0
    if (key === "__name") return (recordName(properties, r.values, "") || (catalog.primary ? displayValue(catalog.primary, r.values[catalog.primary.id], userMap) : "")).toLowerCase()
    if (key === "__owner") return (r.ownerName ?? "").toLowerCase()
    if (key === "__created") return new Date(r.createdAt).getTime()
    const af = catalog.assocByKey[key]
    if (af) { const v = readAssocValue(r as any, af); return af.type === "number" ? (parseFloat(v) || 0) : v.toLowerCase() }
    const p = catalog.otherProps.find((x) => x.id === key)
    return p ? displayValue(p, r.values[key], userMap).toLowerCase() : ""
  }, [properties, catalog, userMap])

  const sorted = useMemo(() => {
    if (serverMode) return filtered
    return [...filtered].sort((a, b) => {
      const va = sortVal(a, cfg.sort.key), vb = sortVal(b, cfg.sort.key)
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))
      return cfg.sort.dir === "asc" ? cmp : -cmp
    })
  }, [filtered, cfg.sort, sortVal, serverMode])

  // Server-mode search: debounce URL updates so typing doesn't spam the server.
  useEffect(() => {
    if (!serverMode) return
    const cur = urlParams.get("search") ?? ""
    if (search === cur) return
    const t = setTimeout(() => pushParams({ search: search || null, page: "1" }), 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, serverMode])

  function onFilterChange(next: FilterState) {
    setCfg((c) => ({ ...c, filter: next }))
    if (serverMode) pushParams({ filter: activeConditionCount(next, filterFields) > 0 ? JSON.stringify(next) : null, page: "1" })
  }
  useEffect(() => {
    if (!serverMode) return
    // Only re-query when the sort actually differs from what the URL already asked
    // for — otherwise mounting would bounce the user back to page 1.
    if (urlParams.get("sort") === cfg.sort.key && (urlParams.get("dir") ?? "desc") === cfg.sort.dir) return
    pushParams({ sort: cfg.sort.key, dir: cfg.sort.dir, page: "1" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.sort.key, cfg.sort.dir])

  // ── Board data ─────────────────────────────────────────────────────────────
  const [board, setBoard] = useState<ObjectBoardData | null>(null)
  const [boardLoading, setBoardLoading] = useState(false)
  useEffect(() => {
    if (cfg.type !== "board") return
    let cancelled = false
    setBoardLoading(true)
    getObjectBoardData(objectKey, {
      pipelineId: cfg.pipelineId,
      withChips: cfg.board.showChips,
      withLastActivity: cfg.board.showLastActivity,
    })
      .then((d) => { if (!cancelled) setBoard(d) })
      .catch(() => { if (!cancelled) setBoard(null) })
      .finally(() => { if (!cancelled) setBoardLoading(false) })
    return () => { cancelled = true }
  }, [objectKey, cfg.type, cfg.pipelineId, cfg.board.showChips, cfg.board.showLastActivity])

  // The board applies the same filters + search as the table, so switching view type
  // never silently changes which records you're looking at.
  const boardCards = useMemo(() => {
    if (!board) return []
    const q = search.toLowerCase().trim()
    return board.cards.filter((c) => {
      if (q && !Object.values(c.values).map((v) => (Array.isArray(v) ? v.join(" ") : String(v ?? ""))).join(" ").toLowerCase().includes(q)) return false
      return matchesFilter(c, cfg.filter, filterFields)
    })
  }, [board, search, cfg.filter, filterFields])

  // ── Export ─────────────────────────────────────────────────────────────────
  const cols = cfg.columns.map((k) => catalog.allCols.find((c) => c.key === k)).filter(Boolean) as { key: string; label: string }[]
  function buildExportRows(list: RecordRow[]) {
    const headers = cols.map((c) => c.label)
    const rows = list.map((r) => cols.map((c) =>
      c.key === "__id" ? (r.recordNumber != null ? `#${r.recordNumber}` : "")
      : c.key === "__name" ? (recordName(properties, r.values, "") || (catalog.primary ? displayValue(catalog.primary, r.values[catalog.primary.id], userMap) : ""))
      : c.key === "__owner" ? (r.ownerName ?? "")
      : c.key === "__created" ? fmtDate(r.createdAt)
      : catalog.assocByKey[c.key] ? readAssocValue(r as any, catalog.assocByKey[c.key])
      : (() => { const p = catalog.otherProps.find((x) => x.id === c.key); return p ? displayValue(p, r.values[c.key], userMap) : "" })(),
    ))
    return { headers, rows }
  }
  const exportData = serverMode
    ? async () => buildExportRows(await exportCustomObjectRecords(objectKey, {
        sort: cfg.sort.key, dir: cfg.sort.dir, search,
        filter: filtersActive ? JSON.stringify(cfg.filter) : undefined,
      }) as RecordRow[])
    : () => buildExportRows(sorted)

  // ── Keyboard shortcuts (Ctrl+S save, Ctrl+Shift+X export, / focus search) ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = (e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable]")
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "x") { e.preventDefault(); setExportOpen(true); return }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "s") { e.preventDefault(); saveChanges(); return }
      if (e.key === "/" && !typing) { e.preventDefault(); document.getElementById("object-search")?.focus() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [saveChanges])

  const sortOptions = catalog.allCols.map((c) => ({ key: c.key, label: c.label }))
  const activeTabId = appliedViewId ?? "__default__"
  const count = serverMode ? serverTotal : sorted.length

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{plural}</h1>
          <p className="text-sm text-slate-500">
            {totalRecords} {totalRecords === 1 ? singular.toLowerCase() : plural.toLowerCase()}
            {(filtersActive || search) && ` · ${count} matching`}
          </p>
        </div>
        {canEdit && (
          <button onClick={() => setAddOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700">
            <Plus className="h-3.5 w-3.5" /> Add {singular.toLowerCase()}
          </button>
        )}
      </div>

      {/* ── View tabs ── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 pb-2">
        <button onClick={applyDefault}
          className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-all",
            activeTabId === "__default__" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400")}>
          <Table2 className="h-3.5 w-3.5" /> All {plural.toLowerCase()}
        </button>
        {viewReorder.order.map((v) => {
          const type = normalizeViewConfig(v.config, defaultColumns).type
          const Icon = TYPE_ICON[type]
          const on = activeTabId === v.id
          return (
            <div key={v.id} {...viewReorder.handleProps(v.id)} {...viewReorder.cardProps(v.id)}
              className={cn("inline-flex h-8 cursor-grab items-center overflow-hidden rounded-lg border text-sm font-medium active:cursor-grabbing",
                viewReorder.dragging === v.id && "opacity-50",
                on ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400")}>
              <button className={cn("flex h-full items-center gap-1.5 pl-3", v.isOwner === false ? "pr-3" : "pr-1.5")} onClick={() => applyView(v)}>
                <Icon className="h-3.5 w-3.5 opacity-70" />
                {v.name}
                {v.isOwner === false && v.visibility && v.visibility !== "PRIVATE" && (
                  <span className="ml-0.5 opacity-60">
                    {v.visibility === "EVERYONE" ? <Globe className="inline h-3 w-3" /> : v.visibility === "TEAM" ? <Users className="inline h-3 w-3" /> : <UserCog className="inline h-3 w-3" />}
                  </span>
                )}
              </button>
              {v.isOwner !== false && (
                <button onClick={() => deleteView(v.id)} title="Delete view"
                  className={cn("h-full pl-0.5 pr-2", on ? "hover:text-zinc-300" : "hover:text-red-500")}><X className="h-3 w-3" /></button>
              )}
            </div>
          )
        })}
        <div className="relative">
          <button onClick={() => setShowSaveForm((v) => !v)}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 px-3 text-sm text-zinc-400 hover:border-zinc-500 hover:text-zinc-600">
            <Plus className="h-3.5 w-3.5" /> {dirty ? "Save as new" : "Save view"}
          </button>
          {showSaveForm && (
            <div className="absolute left-0 top-full z-50 mt-2 w-72 space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
              <p className="text-xs text-slate-500">Saves the current view type, filters, sort and display settings.</p>
              <input autoFocus value={newViewName} onChange={(e) => setNewViewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveAsNew(); if (e.key === "Escape") setShowSaveForm(false) }}
                placeholder="View name…" className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400" />
              <ViewAccessSelector value={newViewAccess} onChange={setNewViewAccess} users={shareUsers} teams={shareTeams} />
              <div className="flex gap-2 pt-1">
                <button onClick={saveAsNew} disabled={savingView || !newViewName.trim()}
                  className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
                  {savingView ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save view
                </button>
                <button onClick={() => { setShowSaveForm(false); setNewViewName("") }} className="h-9 rounded-lg border border-zinc-200 px-3 text-sm text-zinc-500 hover:text-zinc-800">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input id="object-search" type="text" placeholder={`Search ${plural.toLowerCase()}…  ( / )`} value={search} onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-zinc-400" />
        </div>
        <FilterBuilder fields={filterFields} value={cfg.filter} onChange={onFilterChange} open={filtersOpen} onOpenChange={setFiltersOpen} />
        <SortByControl options={sortOptions} value={cfg.sort} onChange={(s) => setCfg((c) => ({ ...c, sort: s }))}
          open={sortOpen} onOpenChange={setSortOpen} />

        <div className="ml-auto flex items-center gap-2">
          {cfg.type !== "table" && pipelines.length > 0 && (
            <PipelineSelector pipelines={pipelines} activePipelineId={cfg.pipelineId ?? board?.pipeline?.id ?? null}
              managePath={`/settings/pipelines?object=CO:${objectKey}`} colorStyle={pipelineColorStyle}
              onSelect={(id) => setCfg((c) => ({ ...c, pipelineId: id }))} />
          )}
          <div className="inline-flex items-center overflow-hidden rounded-lg border border-zinc-200">
            {(["table", "board", "calendar"] as ObjectViewType[]).map((t) => {
              const Icon = TYPE_ICON[t]
              return (
                <button key={t} title={t[0].toUpperCase() + t.slice(1)} onClick={() => setCfg((c) => ({ ...c, type: t }))}
                  className={cn("flex h-8 w-9 items-center justify-center border-r border-zinc-200 last:border-r-0",
                    cfg.type === t ? "bg-zinc-900 text-white" : "bg-white text-zinc-500 hover:bg-zinc-50")}>
                  <Icon className="h-3.5 w-3.5" />
                </button>
              )
            })}
          </div>
          {cfg.type === "table" && (
            <button onClick={() => setColModalOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm font-medium text-zinc-600 hover:border-zinc-400">
              <Columns3 className="h-3.5 w-3.5" /> Columns <ChevronDown className="h-3 w-3 opacity-50" />
            </button>
          )}
          <button onClick={() => setExportOpen(true)} disabled={sorted.length === 0} title="Export this view (Ctrl+Shift+X)"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm font-medium text-zinc-600 hover:border-zinc-400 disabled:opacity-50">
            <Download className="h-3.5 w-3.5" /> Export
          </button>
          {dirty && (
            <button onClick={saveChanges} disabled={savingView || !appliedViewId}
              title={appliedViewId ? `Save changes to "${appliedView?.name}" (Ctrl+S)` : "Save this as a view to keep the changes"}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50">
              {savingView ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save changes
            </button>
          )}
          <button onClick={() => setPanelOpen((o) => !o)} title="View settings"
            className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg border",
              panelOpen ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-400")}>
            <Settings className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setToolbarOpen((o) => !o)} title={toolbarOpen ? "Hide quick filters" : "Show quick filters"}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:border-zinc-400">
            {toolbarOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {toolbarOpen && (
        <QuickFilterBar fields={filterFields} keys={cfg.quickFilters} value={cfg.filter}
          onChange={onFilterChange}
          onKeysChange={(keys) => setCfg((c) => ({ ...c, quickFilters: keys }))}
          onOpenAdvanced={() => setFiltersOpen(true)} />
      )}

      {/* ── Body + settings panel ── */}
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          {cfg.type === "table" && (
            <CustomObjectList
              objectKey={objectKey} singular={singular} ownerLabel={ownerLabel}
              properties={properties} catalog={catalog} rows={sorted} totalRecords={totalRecords}
              users={users} userMap={userMap} canEdit={canEdit} canDelete={canDelete}
              columns={cfg.columns} frozenCount={cfg.frozen}
              onColumnsChange={(c) => setCfg((s) => ({ ...s, columns: c }))}
              sort={cfg.sort} onSortChange={(s) => setCfg((c) => ({ ...c, sort: s }))}
              serverMode={serverMode} serverTotal={serverTotal} serverPage={serverPage} serverPageSize={serverPageSize}
              onServerPage={(p) => pushParams({ page: String(p) })} />
          )}

          {cfg.type === "board" && (
            pipelines.length === 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center text-sm text-zinc-500">
                No pipelines yet. <a href={`/settings/pipelines?object=CO:${objectKey}`} className="text-blue-600 hover:underline">Create a pipeline &amp; stages</a> to use the board.
              </div>
            ) : boardLoading && !board ? (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white p-12 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading board…
              </div>
            ) : board?.pipeline && board.stages.length === 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center text-sm text-zinc-500">
                This pipeline has no stages yet. <a href={`/settings/pipelines?object=CO:${objectKey}`} className="text-blue-600 hover:underline">Add stages</a>.
              </div>
            ) : board?.pipeline ? (
              <ObjectBoard objectType={`CO:${objectKey}`} hrefBase={`/objects/${objectKey}`}
                pipelineId={board.pipeline.id} stages={board.stages} cards={boardCards}
                properties={properties} userMap={userMap} users={users}
                config={cfg.board} colorStyle={pipelineColorStyle} canEdit={canEdit}
                truncated={board.truncated}
                onConfigChange={(b) => setCfg((c) => ({ ...c, board: b }))} />
            ) : null
          )}

          {cfg.type === "calendar" && (
            <ObjectCalendar objectKey={objectKey} hrefBase={`/objects/${objectKey}`}
              config={cfg.calendar} properties={properties} pipelineId={cfg.pipelineId}
              onConfigChange={(cal) => setCfg((c) => ({ ...c, calendar: cal }))} />
          )}
        </div>

        <ViewSettingsPanel
          open={panelOpen} onClose={() => setPanelOpen(false)}
          config={cfg} onConfigChange={setCfg}
          name={name} onRename={commitRename} canRename={!!appliedViewId && appliedView?.isOwner !== false}
          properties={properties} pipelines={pipelines}
          viewId={appliedViewId}
          access={access} onAccessChange={commitAccess}
          shareUsers={shareUsers} shareTeams={shareTeams} canShare={!!appliedViewId && appliedView?.isOwner !== false}
          dirty={dirty} saving={savingView}
          onSave={saveChanges} onReset={resetView} onExport={() => setExportOpen(true)}
          onOpenFilters={() => setFiltersOpen(true)} onOpenSort={() => setSortOpen(true)}
          onOpenColumns={() => setColModalOpen(true)} />
      </div>

      <p className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
        {count.toLocaleString()} {count === 1 ? singular.toLowerCase() : plural.toLowerCase()}
      </p>

      {canEdit && addOpen && (() => {
        // Catalog = every property (as a RecordFieldDef) + the owner field.
        const createCatalog: RecordFieldDef[] = [
          ...properties.map((p) => ({ ...cpToFieldDef(p as any, p.id), required: !!(p as any).required || !!p.primary })),
          { key: "__owner", label: ownerLabel, type: "user" as const },
        ]
        return (
          <CreateRecordModal
            objectType={`CO:${objectKey}`}
            title={`Add ${singular}`}
            catalog={createCatalog}
            config={createFormConfig}
            users={users}
            canEditForm={isAdmin}
            onClose={() => setAddOpen(false)}
            onSaved={() => { setAddOpen(false); router.refresh() }}
            onConfigChanged={() => router.refresh()}
            onSubmit={async (values) => {
              const { __owner, ...propValues } = values
              return await createCustomObjectRecord(objectKey, propValues, (__owner as string) || undefined) as any
            }}
          />
        )
      })()}

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} subject={plural} defaultName={objectKey}
        getData={exportData} count={serverMode ? serverTotal : undefined} />

      <ColumnChooserModal
        open={colModalOpen}
        onClose={() => setColModalOpen(false)}
        columns={catalog.allCols}
        selected={cfg.columns}
        frozen={cfg.frozen}
        onApply={(sel, fr) => setCfg((c) => ({ ...c, columns: sel, frozen: fr }))}
        createHref="/settings/objects"
      />
    </div>
  )
}
