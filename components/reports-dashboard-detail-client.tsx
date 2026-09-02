"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import RGL, { WidthProvider, type Layout } from "react-grid-layout"
import "react-grid-layout/css/styles.css"
import "react-resizable/css/styles.css"
import {
  ChevronLeft,
  LayoutDashboard,
  Trash2,
  Plus,
  ExternalLink,
  X,
  BookmarkX,
  Check,
  RefreshCw,
  Loader2,
  GripVertical,
  Download,
  Filter,
  Users,
} from "lucide-react"
import {
  addReportToDashboard,
  removeReportFromDashboard,
  renameDashboard,
  saveDashboardLayout,
  saveDashboardDateRange,
  saveDashboardAccess,
  saveCardFilters,
  type DashboardDetail,
  type DashboardLayout,
  type DashboardDateRange,
} from "@/app/actions/dashboards"
import { ViewAccessSelector, type ViewAccessValue, type ShareUser, type ShareTeam } from "@/components/view-access-selector"
import type { SavedReport } from "@/app/actions/saved-reports"
import { cn } from "@/lib/utils"
import { runReportPreview, getReportRows, getReportFields, getReportObjects } from "@/app/actions/report-builder"
import { ReportView } from "@/components/report-view"
import ExportDialog from "@/components/ui/export-dialog"
import FilterBuilder from "@/components/ui/filter-builder"
import StyledSelect from "@/components/ui/styled-select"
import { emptyFilter, type FilterState, type FilterField } from "@/lib/filters"
import { DATE_PRESET_GROUPS } from "@/lib/reporting/date-presets"
import type { ReportConfig, ReportResult } from "@/lib/reporting/types"

// Dashboard-level date range cascades onto each card's date field.
const CREATED_FIELD: Record<string, string> = { REFERRAL: "createdAt", PROVIDER: "createdAt", PRACTICE: "createdAt", LOCATION: "createdAt", ACTIVITY: "createdAt", TASK: "createdAt", SURGERY: "creationDate" }
const createdFieldFor = (primary: string) => (primary.startsWith("CO:") ? "createdAt" : CREATED_FIELD[primary] ?? "createdAt")

const DASH_DATE_GROUPED = DATE_PRESET_GROUPS.filter((p) => p.value !== "custom").reduce((acc, p) => {
  (acc[p.group] ??= []).push(p); return acc
}, {} as Record<string, typeof DATE_PRESET_GROUPS>)

function mergeFilters(a: any, b: any): FilterState | null {
  const groups = [...(a?.groups ?? []), ...(b?.groups ?? [])]
  if (groups.length === 0) return null
  return { combinator: "AND", groups }
}
function mergeConfig(cfg: ReportConfig, dashDate: DashboardDateRange | null, cardFilters: any): ReportConfig {
  let dateRange = cfg.dateRange
  if (dashDate && dashDate.preset && dashDate.preset !== "all") {
    dateRange = { field: cfg.dateRange?.field ?? createdFieldFor(cfg.primary), preset: dashDate.preset as any, from: dashDate.from, to: dashDate.to }
  }
  return { ...cfg, dateRange, filters: mergeFilters(cfg.filters, cardFilters) }
}

const GridLayout = WidthProvider(RGL)
const GRID_COLS = 12

// v2 configs are tagged `{ v: 2, primary, measures[], ... }`; v1 is the referrals
// grouping shape `{ groupBy, range, ... }`.
function isV2Config(cfg: any): boolean {
  return !!cfg && (cfg.v === 2 || (typeof cfg.primary === "string" && Array.isArray(cfg.measures)))
}

// Sensible default tile size per report shape (in grid units, 12-col).
function defaultSize(cfg: any): { w: number; h: number } {
  if (isV2Config(cfg)) {
    if (cfg.viz === "kpi") return { w: 3, h: 5 }
    if (cfg.viz === "table" || cfg.viz === "pivot") return { w: 8, h: 9 }
    return { w: 6, h: 9 } // charts
  }
  return { w: 4, h: 5 } // v1 link-out cards
}

// Build the RGL layout: saved geometry when present, else flow left→right.
function buildLayout(reports: DashboardDetail["reports"], saved: DashboardLayout | null): Layout[] {
  let cx = 0, cy = 0, rowH = 0
  return reports.map((entry) => {
    const { w, h } = defaultSize(entry.savedReport.config)
    const s = saved?.[entry.savedReportId]
    if (s) return { i: entry.savedReportId, x: s.x, y: s.y, w: s.w, h: s.h, minW: 2, minH: 3 }
    if (cx + w > GRID_COLS) { cx = 0; cy += rowH; rowH = 0 }
    const item = { i: entry.savedReportId, x: cx, y: cy, w, h, minW: 2, minH: 3 }
    cx += w; rowH = Math.max(rowH, h)
    return item
  })
}

const GROUP_LABELS: Record<string, string> = {
  practice: "Practice", pipeline: "Pipeline", status: "Status",
  provider: "Provider", insurance: "Insurance", month: "Time",
}
const RANGE_LABELS: Record<string, string> = {
  last_6m: "Last 6 months", this_month: "This month", last_month: "Last month",
  last_3m: "Last 3 months", last_year: "Last 12 months", all: "All time", custom: "Custom range",
}

function buildBuilderUrl(cfg: any): string {
  const p = new URLSearchParams()
  p.set("groupBy", cfg.groupBy)
  if (cfg.groupBy === "month") p.set("granularity", cfg.granularity)
  if (cfg.from && cfg.to) { p.set("from", cfg.from); p.set("to", cfg.to); p.set("range", "custom") }
  else p.set("range", cfg.range)
  cfg.practiceIds?.forEach((id: string) => p.append("practiceId", id))
  cfg.pipelineIds?.forEach((id: string) => p.append("pipelineId", id))
  cfg.statusIds?.forEach((id: string) => p.append("statusId", id))
  cfg.doctorIds?.forEach((id: string) => p.append("doctorId", id))
  return `/reports/builder/classic?${p.toString()}`
}

// Live v2 card: runs the report engine and renders the chart/table/KPI inline.
function V2ReportCard({
  entry,
  dashboardId,
  dashDate,
}: {
  entry: DashboardDetail["reports"][number]
  dashboardId: string
  dashDate: DashboardDateRange | null
}) {
  const router = useRouter()
  const [removing, startRemove] = useTransition()
  const [result, setResult] = useState<ReportResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)
  const [exportOpen, setExportOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [cardFilters, setCardFilters] = useState<any>(entry.filters ?? null)
  const [filterFields, setFilterFields] = useState<FilterField[] | null>(null)
  const cfg = entry.savedReport.config as unknown as ReportConfig
  const runCfg = useMemo(() => mergeConfig(cfg, dashDate, cardFilters), [cfg, dashDate, cardFilters])
  const cardFilterCount = (cardFilters?.groups ?? []).reduce((n: number, g: any) => n + (g.conditions?.length ?? 0), 0)

  // Friendly subtitle labels (object plural + measure field name), resolved from the catalog.
  const [subtitleMeta, setSubtitleMeta] = useState<{ primaryLabel: string; fieldLabel: Record<string, string> } | null>(null)
  useEffect(() => {
    let alive = true
    Promise.all([getReportObjects().catch(() => []), getReportFields(cfg.primary).catch(() => [])]).then(([objs, fields]) => {
      if (!alive) return
      setSubtitleMeta({
        primaryLabel: objs.find((o) => o.key === cfg.primary)?.label ?? cfg.primary,
        fieldLabel: Object.fromEntries(fields.map((f) => [f.key, f.label])),
      })
    })
    return () => { alive = false }
  }, [cfg.primary])

  useEffect(() => {
    let alive = true
    setLoading(true)
    runReportPreview(runCfg).then((r) => { if (alive) setResult(r) }).catch(() => { if (alive) setResult(null) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.savedReportId, nonce, runCfg])

  async function openFilters() {
    setFilterOpen(true)
    if (!filterFields) {
      const fs = await getReportFields(cfg.primary).catch(() => [])
      setFilterFields(fs.map((f) => ({ key: f.key, label: f.label, type: f.type, column: f.column, jsonBag: f.jsonBag, options: f.options, getValue: () => null })))
    }
  }
  function applyCardFilters(v: FilterState) {
    setCardFilters(v)
    saveCardFilters(dashboardId, entry.savedReportId, v).catch(() => {})
  }

  function handleRemove() {
    startRemove(async () => {
      await removeReportFromDashboard(dashboardId, entry.savedReportId)
      router.refresh()
    })
  }

  return (
    <div className={`h-full bg-white border rounded-xl flex flex-col overflow-hidden ${removing ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-2 p-4 pb-2">
        <div className="flex min-w-0 flex-1 items-start gap-1.5">
          <span className="card-drag mt-0.5 cursor-move text-zinc-300 hover:text-zinc-500"><GripVertical className="h-4 w-4" /></span>
          <div className="min-w-0">
            <Link href={`/reports/view/${entry.savedReportId}`} className="block truncate text-sm font-semibold text-slate-900 hover:text-blue-700">{entry.savedReport.name}</Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-slate-400">
              <span>{reportObjectName(cfg, subtitleMeta ?? undefined)}</span>
              {dashDate?.preset && <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-zinc-500">{DATE_PRESET_GROUPS.find((p) => p.value === dashDate.preset)?.label ?? dashDate.preset}</span>}
              {cardFilterCount > 0 && <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-blue-600">Filters ({cardFilterCount})</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={openFilters} className={cn("relative p-1.5 rounded-lg transition-all", cardFilterCount > 0 ? "text-blue-600 hover:bg-blue-50" : "text-zinc-300 hover:text-zinc-600 hover:bg-zinc-100")} title="Filter this card"><Filter className="h-3.5 w-3.5" />{cardFilterCount > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-600 text-[8px] font-bold text-white">{cardFilterCount}</span>}</button>
          <button onClick={() => setExportOpen(true)} className="p-1.5 rounded-lg text-zinc-300 hover:text-zinc-600 hover:bg-zinc-100 transition-all" title="Export CSV"><Download className="h-3.5 w-3.5" /></button>
          <button onClick={() => setNonce((n) => n + 1)} className="p-1.5 rounded-lg text-zinc-300 hover:text-zinc-600 hover:bg-zinc-100 transition-all" title="Refresh"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></button>
          <button onClick={handleRemove} disabled={removing} className="p-1.5 rounded-lg text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-all" title="Remove from dashboard"><X className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} subject={String(cfg.primary).toLowerCase()} defaultName={entry.savedReport.name} count={result?.total} getData={async () => getReportRows(runCfg)} />
      {filterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={() => setFilterOpen(false)}>
          <div className="w-full max-w-lg space-y-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><p className="text-sm font-semibold text-zinc-900">Filter “{entry.savedReport.name}”</p><button onClick={() => setFilterOpen(false)} className="text-zinc-400 hover:text-zinc-700"><X className="h-4 w-4" /></button></div>
            {filterFields ? <FilterBuilder fields={filterFields} value={cardFilters ?? emptyFilter()} onChange={applyCardFilters} /> : <p className="py-6 text-center text-sm text-zinc-400"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></p>}
            <p className="text-xs text-zinc-400">Applies only to this card, on top of the report’s own filters.</p>
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
        {loading && !result ? <div className="flex h-full items-center justify-center text-sm text-zinc-400"><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Running…</div>
          : result ? <ReportView result={result} style={cfg.style as any} /> : <p className="text-sm text-zinc-400 py-8 text-center">Couldn’t load this report.</p>}
      </div>
    </div>
  )
}

function reportObjectName(cfg: ReportConfig, meta?: { primaryLabel: string; fieldLabel: Record<string, string> }): string {
  const m = cfg.measures?.[0]
  const fieldName = (key: string) => meta?.fieldLabel[key] ?? key
  const agg = m ? (m.key === "*" ? "Count" : `${m.agg} of ${fieldName(m.key)}`) : "—"
  return `${meta?.primaryLabel ?? cfg.primary} · ${agg}`
}

function ReportCard({
  entry,
  dashboardId,
  dashDate,
}: {
  entry: DashboardDetail["reports"][number]
  dashboardId: string
  dashDate: DashboardDateRange | null
}) {
  const router = useRouter()
  const [removing, startRemove] = useTransition()
  const cfg = entry.savedReport.config as any
  if (isV2Config(cfg)) return <V2ReportCard entry={entry} dashboardId={dashboardId} dashDate={dashDate} />
  const href = buildBuilderUrl(cfg)
  const filterCount = (cfg.practiceIds?.length ?? 0) + (cfg.pipelineIds?.length ?? 0) +
    (cfg.statusIds?.length ?? 0) + (cfg.doctorIds?.length ?? 0)

  function handleRemove() {
    startRemove(async () => {
      await removeReportFromDashboard(dashboardId, entry.savedReportId)
      router.refresh()
    })
  }

  return (
    <div className={`h-full bg-white border rounded-xl p-5 flex flex-col gap-3 overflow-auto hover:border-zinc-300 transition-all ${removing ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-1.5">
          <span className="card-drag mt-0.5 cursor-move text-zinc-300 hover:text-zinc-500"><GripVertical className="h-4 w-4" /></span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{entry.savedReport.name}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Added {new Date(entry.addedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </p>
          </div>
        </div>
        <button
          onClick={handleRemove}
          disabled={removing}
          className="p-1.5 rounded-lg text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
          title="Remove from dashboard"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700 text-xs font-medium">
          {GROUP_LABELS[cfg.groupBy] ?? cfg.groupBy}
        </span>
        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-xs">
          {RANGE_LABELS[cfg.range] ?? cfg.range}
        </span>
        {cfg.viz && cfg.viz !== "bar" && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 text-xs capitalize">
            {cfg.viz}
          </span>
        )}
        {filterCount > 0 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-xs">
            {filterCount} filter{filterCount > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <Link
        href={href}
        className="mt-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-700 hover:border-zinc-400 hover:text-zinc-900 transition-all"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Open Report
      </Link>
    </div>
  )
}

function AddReportPicker({
  dashboardId,
  alreadyAdded,
  allReports,
  onClose,
}: {
  dashboardId: string
  alreadyAdded: Set<string>
  allReports: SavedReport[]
  onClose: () => void
}) {
  const router = useRouter()
  const [adding, startAdd] = useTransition()
  const [addingId, setAddingId] = useState<string | null>(null)
  const available = allReports.filter((r) => !alreadyAdded.has(r.id))

  function handleAdd(reportId: string) {
    setAddingId(reportId)
    startAdd(async () => {
      await addReportToDashboard(dashboardId, reportId)
      setAddingId(null)
      router.refresh()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Add Report to Dashboard</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        {available.length === 0 ? (
          <div className="py-8 text-center">
            <Check className="h-8 w-8 text-green-400 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">All your saved reports are already in this dashboard.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 max-h-80 overflow-y-auto rounded-lg border">
            {available.map((r) => {
              const cfg = r.config as any
              return (
                <li key={r.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">{r.name}</p>
                    <p className="text-xs text-slate-400">
                      {isV2Config(cfg) ? reportObjectName(cfg as ReportConfig) : `${GROUP_LABELS[cfg?.groupBy] ?? cfg?.groupBy} · ${RANGE_LABELS[cfg?.range] ?? cfg?.range}`}
                    </p>
                  </div>
                  <button
                    onClick={() => handleAdd(r.id)}
                    disabled={adding && addingId === r.id}
                    className="ml-3 shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-all"
                  >
                    {adding && addingId === r.id ? "Adding…" : "Add"}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-600 border border-zinc-200 rounded-lg hover:border-zinc-400 transition-all">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DashboardDetailClient({
  dashboard,
  allReports,
  shareUsers = [],
  shareTeams = [],
}: {
  dashboard: DashboardDetail
  allReports: SavedReport[]
  shareUsers?: ShareUser[]
  shareTeams?: ShareTeam[]
}) {
  const router = useRouter()
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(dashboard.name)
  const [, startRename] = useTransition()
  const [pickerOpen, setPickerOpen] = useState(false)

  // Dashboard-level quick date filter — cascades onto every v2 card.
  const [dashDate, setDashDate] = useState<DashboardDateRange | null>(dashboard.dateRange ?? null)
  function changeDashDate(preset: string) {
    const next = preset === "all" ? null : { preset }
    setDashDate(next)
    saveDashboardDateRange(dashboard.id, next).catch(() => {})
  }

  // Dashboard sharing (same model as saved Views / reports).
  const [shareOpen, setShareOpen] = useState(false)
  const [access, setAccess] = useState<ViewAccessValue>({
    visibility: (dashboard.visibility as any) ?? "PRIVATE",
    teamId: dashboard.teamId ?? null,
    sharedUserIds: dashboard.sharedUserIds ?? [],
  })
  function changeAccess(v: ViewAccessValue) {
    setAccess(v)
    saveDashboardAccess(dashboard.id, v).catch(() => {})
  }

  const alreadyAdded = new Set(dashboard.reports.map((r) => r.savedReportId))

  // Grid layout (drag/resize) — seeded from saved geometry, persisted on change.
  const [layout, setLayout] = useState<Layout[]>(() => buildLayout(dashboard.reports, dashboard.layout))
  useEffect(() => { setLayout(buildLayout(dashboard.reports, dashboard.layout)) }, [dashboard.reports, dashboard.layout])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didMount = useRef(false)
  function onLayoutChange(next: Layout[]) {
    setLayout(next)
    if (!didMount.current) { didMount.current = true; return } // skip RGL's mount emit
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const map: DashboardLayout = {}
      next.forEach((l) => { map[l.i] = { x: l.x, y: l.y, w: l.w, h: l.h } })
      saveDashboardLayout(dashboard.id, map).catch(() => {})
    }, 600)
  }

  function handleRename() {
    if (!name.trim() || name.trim() === dashboard.name) { setEditingName(false); return }
    startRename(async () => {
      await renameDashboard(dashboard.id, name.trim())
      setEditingName(false)
      router.refresh()
    })
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/reports/dashboard" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors">
            <ChevronLeft className="h-4 w-4" />
            Dashboards
          </Link>
          <span className="text-slate-300">/</span>
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-slate-700" />
            {editingName ? (
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename()
                  if (e.key === "Escape") { setName(dashboard.name); setEditingName(false) }
                }}
                className="text-2xl font-bold text-slate-900 border-b-2 border-zinc-400 focus:outline-none focus:border-blue-600 bg-transparent"
              />
            ) : (
              <button
                onClick={() => setEditingName(true)}
                className="text-2xl font-bold text-slate-900 hover:text-zinc-600 transition-colors"
                title="Click to rename"
              >
                {dashboard.name}
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StyledSelect value={dashDate?.preset ?? "all"} onChange={(e) => changeDashDate(e.target.value)} className="h-9 min-w-[150px] text-sm">
            {Object.entries(DASH_DATE_GROUPED).map(([grp, items]) => (
              <optgroup key={grp} label={grp}>{items.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</optgroup>
            ))}
          </StyledSelect>
          <button
            onClick={() => setShareOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-zinc-200 rounded-lg text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 transition-all"
          >
            <Users className="h-3.5 w-3.5" />
            Share
          </button>
          <Link
            href="/reports/builder"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-zinc-200 rounded-lg text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 transition-all"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Builder
          </Link>
          <button
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Report
          </button>
        </div>
      </div>

      {/* Empty state */}
      {dashboard.reports.length === 0 && (
        <div className="bg-white border rounded-xl p-16 text-center space-y-3">
          <BookmarkX className="h-8 w-8 text-slate-300 mx-auto" />
          <p className="text-slate-500 font-medium">No reports yet</p>
          <p className="text-slate-400 text-sm">Click <strong>Add Report</strong> to add saved reports to this dashboard.</p>
          <button
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 mt-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Report
          </button>
        </div>
      )}

      {/* Report grid — drag by the handle, resize from the bottom-right corner */}
      {dashboard.reports.length > 0 && (
        <GridLayout
          className="layout"
          layout={layout}
          cols={GRID_COLS}
          rowHeight={40}
          margin={[16, 16]}
          draggableHandle=".card-drag"
          onLayoutChange={onLayoutChange}
        >
          {dashboard.reports.map((entry) => (
            <div key={entry.savedReportId} className="overflow-hidden">
              <ReportCard entry={entry} dashboardId={dashboard.id} dashDate={dashDate} />
            </div>
          ))}
        </GridLayout>
      )}

      {/* Add report picker modal */}
      {pickerOpen && (
        <AddReportPicker
          dashboardId={dashboard.id}
          alreadyAdded={alreadyAdded}
          allReports={allReports}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {/* Share dashboard modal */}
      {shareOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={() => setShareOpen(false)}>
          <div className="w-full max-w-md space-y-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><p className="text-sm font-semibold text-zinc-900">Share dashboard</p><button onClick={() => setShareOpen(false)} className="text-zinc-400 hover:text-zinc-700"><X className="h-4 w-4" /></button></div>
            <ViewAccessSelector value={access} onChange={changeAccess} users={shareUsers} teams={shareTeams} />
          </div>
        </div>
      )}
    </div>
  )
}
