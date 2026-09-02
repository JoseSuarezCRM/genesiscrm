"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Search, Plus, X, Loader2, Save, BarChart3, LayoutDashboard, Download, Users, GripVertical, Pencil, Check, SlidersHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import StyledSelect from "@/components/ui/styled-select"
import { FilterEditor } from "@/components/ui/filter-builder"
import { getReportSchema, runReportPreview, drillIntoReport, getReportRows } from "@/app/actions/report-builder"
import ExportDialog from "@/components/ui/export-dialog"
import { createSavedReport, updateSavedReport, setSavedReportAccess } from "@/app/actions/saved-reports"
import { ViewAccessSelector, type ViewAccessValue, type ShareUser, type ShareTeam } from "@/components/view-access-selector"
import { getDashboards, addReportToDashboard, createDashboard, type DashboardSummary } from "@/app/actions/dashboards"
import { emptyFilter, type FilterState, type FilterField } from "@/lib/filters"
import type { ReportConfig, ReportField, ReportResult, Aggregation, DateFrequency, VizType } from "@/lib/reporting/types"
import { EMPTY_REPORT } from "@/lib/reporting/types"
import { DATE_PRESET_GROUPS } from "@/lib/reporting/date-presets"
import { ReportView, DataTable, type ReportStyle } from "@/components/report-view"

const VIZ_OPTIONS: { value: VizType; label: string }[] = [
  { value: "table", label: "Table" }, { value: "kpi", label: "KPI" },
  { value: "vbar", label: "Vertical bar" }, { value: "hbar", label: "Horizontal bar" },
  { value: "line", label: "Line" }, { value: "area", label: "Area" },
  { value: "pie", label: "Pie" }, { value: "donut", label: "Donut" },
  { value: "gauge", label: "Gauge" }, { value: "pivot", label: "Pivot table" },
]
const AGGS: Aggregation[] = ["count", "distinct_count", "sum", "avg", "min", "max"]
const FREQS: DateFrequency[] = ["day", "week", "month", "quarter", "year"]
const FORMATS = [{ value: "number", label: "Number (1,234)" }, { value: "currency", label: "Currency ($)" }, { value: "percent", label: "Percent (%)" }, { value: "duration", label: "Duration (days)" }]
const AGG_LABELS: Record<string, string> = { count: "Count", distinct_count: "Distinct count", sum: "Sum", avg: "Average", min: "Min", max: "Max" }
// Group the shared preset catalog for <optgroup> rendering.
const DATE_PRESET_GROUPED = DATE_PRESET_GROUPS.filter((p) => p.value !== "all").reduce((acc, p) => {
  (acc[p.group] ??= []).push(p); return acc
}, {} as Record<string, typeof DATE_PRESET_GROUPS>)

export default function ReportBuilderV2({ objects, initial, shareUsers = [], shareTeams = [] }: { objects: { key: string; label: string }[]; initial?: { id: string; name: string; config: any; visibility?: string; teamId?: string | null; sharedUserIds?: string[] } | null; shareUsers?: ShareUser[]; shareTeams?: ShareTeam[] }) {
  const [config, setConfig] = useState<ReportConfig>(initial ? sanitizeConfig(initial.config) : { ...EMPTY_REPORT, primary: objects[0]?.key ?? "REFERRAL" })
  const [schema, setSchema] = useState<{ fields: ReportField[]; associations: { path: string; target: string; label: string; fields: ReportField[] }[] }>({ fields: [], associations: [] })
  const [result, setResult] = useState<ReportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState("")
  const [tab, setTab] = useState<"configure" | "style" | "filters">("configure")
  const [name, setName] = useState(initial?.name ?? "")
  const [saved, setSaved] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(initial?.id ?? null)
  const [drill, setDrill] = useState<{ title: string; result: ReportResult | null; loading: boolean } | null>(null)
  const [dashOpen, setDashOpen] = useState(false)
  const [dashboards, setDashboards] = useState<DashboardSummary[]>([])
  const [newDash, setNewDash] = useState("")
  const [addedTo, setAddedTo] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [access, setAccess] = useState<ViewAccessValue>({
    visibility: (initial?.visibility as any) ?? "PRIVATE",
    teamId: initial?.teamId ?? null,
    sharedUserIds: initial?.sharedUserIds ?? [],
  })
  // HubSpot-style data section beneath the chart: Unsummarized / Summarized tabs.
  const [dataTab, setDataTab] = useState<"unsummarized" | "summarized">("unsummarized")
  const [dataResult, setDataResult] = useState<ReportResult | null>(null)
  const [dataLoading, setDataLoading] = useState(false)

  // Drill into the records behind a bar / summarized row / pivot cell.
  async function onDrill(dimKey: string, bdKey: string | null, title: string) {
    setDrill({ title, result: null, loading: true })
    try { setDrill({ title, result: await drillIntoReport(config, dimKey, bdKey), loading: false }) }
    catch { setDrill({ title, result: null, loading: false }) }
  }
  const style = (config.style ?? {}) as ReportStyle
  const setStyle = (patch: Record<string, unknown>) => set({ style: { ...(config.style ?? {}), ...patch } })

  const primaryFields = schema.fields
  const activeAssocs = schema.associations.filter((a) => config.sources.some((s) => s.joinPath === a.path))
  const fields = useMemo(() => [...primaryFields, ...activeAssocs.flatMap((a) => a.fields)], [primaryFields, activeAssocs])
  const byKey = useMemo(() => Object.fromEntries(fields.map((f) => [f.key, f])), [fields])

  // Load the schema (fields + joinable sources) when the primary object changes.
  useEffect(() => {
    let alive = true
    getReportSchema(config.primary).then((s) => { if (alive) setSchema(s) }).catch(() => {})
    return () => { alive = false }
  }, [config.primary])

  // Debounced preview.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    setLoading(true)
    timer.current = setTimeout(async () => {
      try { setResult(await runReportPreview(config)) } catch { setResult(null) } finally { setLoading(false) }
    }, 400)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [config])

  // Debounced data section (the active Unsummarized/Summarized table) — always a
  // table, driven by tableMode, independent of the selected visualization.
  const dataTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (dataTimer.current) clearTimeout(dataTimer.current)
    setDataLoading(true)
    dataTimer.current = setTimeout(async () => {
      try { setDataResult(await runReportPreview({ ...config, viz: "table", tableMode: dataTab } as ReportConfig)) }
      catch { setDataResult(null) } finally { setDataLoading(false) }
    }, 400)
    return () => { if (dataTimer.current) clearTimeout(dataTimer.current) }
  }, [config, dataTab])

  const set = (patch: Partial<ReportConfig>) => setConfig((c) => ({ ...c, ...patch }))
  // Filters translate on primary fields + joined single-FK fields (relationPath).
  const filterFields: FilterField[] = useMemo(
    () => fields.map((f) => ({ key: f.key, label: f.label, type: f.type, column: f.column, jsonBag: f.jsonBag, options: f.options, relationPath: f.joinPath, getValue: () => null })),
    [fields],
  )
  const dateFields = useMemo(() => primaryFields.filter((f) => f.type === "date"), [primaryFields])
  const primaryDimIsDate = !!config.dimensions[0] && (byKey[config.dimensions[0].key]?.type === "date" || !!config.dimensions[0].dateFrequency)
  const toggleSource = (a: { path: string; target: string; label: string }) => setConfig((c) => {
    const on = c.sources.some((s) => s.joinPath === a.path)
    return on
      ? { ...c, sources: c.sources.filter((s) => s.joinPath !== a.path) }
      : { ...c, sources: [...c.sources, { objectKey: a.target, joinPath: a.path, label: a.label }] }
  })

  const addColumn = (f: ReportField) => { if (!config.columns.some((c) => c.key === f.key)) set({ columns: [...config.columns, { source: f.source, key: f.key }] }) }
  const addDimension = (f: ReportField) => { if (!config.dimensions.some((d) => d.key === f.key)) set({ dimensions: [...config.dimensions, { source: f.source, key: f.key, dateFrequency: f.type === "date" ? "month" : undefined }] }) }
  const addMeasure = (f: ReportField) => {
    if (config.measures.some((m) => m.key === f.key)) return
    const m: any = f.stageDuration
      ? { source: f.source, key: f.key, agg: "avg", format: "duration" as const, decimals: 1 }
      : { source: f.source, key: f.key, agg: f.type === "number" ? "sum" : "distinct_count" }
    set({ measures: [...config.measures, m] })
  }
  const setBreakdownField = (f: ReportField) => set({ breakdown: { source: f.source, key: f.key } })
  // Resolve a dropped field key (from the field list) and hand it to an add fn.
  const onDropField = (add: (f: ReportField) => void) => (e: React.DragEvent) => {
    e.preventDefault()
    const key = e.dataTransfer.getData("field")
    const f = byKey[key]
    if (f) add(f)
  }

  const filt = (arr: ReportField[]) => query.trim() ? arr.filter((f) => f.label.toLowerCase().includes(query.toLowerCase())) : arr
  const fieldGroups: { label: string; fields: ReportField[] }[] = [
    { label: reportLabel(objects, config.primary) + " (primary)", fields: filt(primaryFields) },
    ...activeAssocs.map((a) => ({ label: a.label, fields: filt(a.fields) })),
  ]

  // Save the report, returning its id. Updates the loaded report in place when one
  // is open; creates a new one otherwise (or when forceNew — "Save as new").
  async function ensureSaved(forceNew = false): Promise<string | null> {
    if (!name.trim()) return null
    if (savedId && !forceNew) {
      await updateSavedReport(savedId, name.trim(), { v: 2, ...config } as any, access)
      return savedId
    }
    const { id } = await createSavedReport(name.trim(), { v: 2, ...config } as any, access)
    setSavedId(id)
    return id
  }
  async function changeAccess(v: ViewAccessValue) {
    setAccess(v)
    if (savedId) await setSavedReportAccess(savedId, v).catch(() => {})
  }
  async function save() {
    const id = await ensureSaved()
    if (!id) return
    setSaved(true); setTimeout(() => setSaved(false), 2500)
  }
  async function saveAsNew() {
    const id = await ensureSaved(true)
    if (!id) return
    setSaved(true); setTimeout(() => setSaved(false), 2500)
  }
  async function openDashboards() {
    setDashOpen(true); setAddedTo(null)
    try { setDashboards(await getDashboards()) } catch { setDashboards([]) }
  }
  async function addToDashboard(dashboardId: string) {
    const id = await ensureSaved()
    if (!id) return
    await addReportToDashboard(dashboardId, id)
    setAddedTo(dashboardId)
  }
  async function addToNewDashboard() {
    if (!newDash.trim()) return
    const id = await ensureSaved()
    if (!id) return
    const { id: dashboardId } = await createDashboard(newDash.trim())
    await addReportToDashboard(dashboardId, id)
    setNewDash(""); setDashboards(await getDashboards()); setAddedTo(dashboardId)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-zinc-200 bg-white px-5 py-3">
        <StyledSelect value={config.primary} onChange={(e) => set({ primary: e.target.value, sources: [], columns: [], dimensions: [], breakdown: null, measures: [{ source: e.target.value, key: "*", agg: "count" }], filters: null })} className="min-w-[180px]">
          {objects.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </StyledSelect>
        <StyledSelect value={config.viz} onChange={(e) => set({ viz: e.target.value as VizType })} className="min-w-[150px]">
          {VIZ_OPTIONS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
        </StyledSelect>
        <div className="ml-auto flex items-center gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Report name…" className="h-9 w-52 rounded-lg border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400" />
          <button onClick={save} disabled={!name.trim()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saved ? "Saved ✓" : <><Save className="h-3.5 w-3.5" /> {savedId ? "Update" : "Save"}</>}
          </button>
          {savedId && (
            <button onClick={saveAsNew} disabled={!name.trim()} title="Save as a new report" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 hover:border-zinc-400 disabled:opacity-50">
              Save as new
            </button>
          )}
          <button onClick={() => setShareOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 hover:border-zinc-400">
            <Users className="h-3.5 w-3.5" /> Share
          </button>
          <button onClick={() => setExportOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 hover:border-zinc-400">
            <Download className="h-3.5 w-3.5" /> Export
          </button>
          <button onClick={openDashboards} disabled={!name.trim()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 hover:border-zinc-400 disabled:opacity-50">
            <LayoutDashboard className="h-3.5 w-3.5" /> Add to dashboard
          </button>
        </div>
      </div>

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        subject={reportLabel(objects, config.primary).toLowerCase()}
        defaultName={name.trim() || "report"}
        count={result?.total}
        getData={async () => getReportRows(config)}
      />

      {shareOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={() => setShareOpen(false)}>
          <div className="w-full max-w-md space-y-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><p className="text-sm font-semibold text-zinc-900">Share report</p><button onClick={() => setShareOpen(false)} className="text-zinc-400 hover:text-zinc-700"><X className="h-4 w-4" /></button></div>
            <ViewAccessSelector value={access} onChange={changeAccess} users={shareUsers} teams={shareTeams} />
            {!savedId && <p className="text-xs text-zinc-400">Applied when you save the report.</p>}
          </div>
        </div>
      )}

      {/* Add-to-dashboard modal */}
      {dashOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={() => setDashOpen(false)}>
          <div className="w-full max-w-md space-y-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-zinc-900">Add “{name || "report"}” to a dashboard</p>
              <button onClick={() => setDashOpen(false)} className="text-zinc-400 hover:text-zinc-700"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-64 divide-y divide-zinc-100 overflow-y-auto rounded-lg border border-zinc-100">
              {dashboards.length === 0 && <p className="px-4 py-6 text-center text-sm text-zinc-400">No dashboards yet — create one below.</p>}
              {dashboards.map((d) => (
                <div key={d.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-zinc-50">
                  <div className="min-w-0"><p className="truncate text-sm text-zinc-800">{d.name}</p><p className="text-xs text-zinc-400">{d.reportCount} report{d.reportCount === 1 ? "" : "s"}</p></div>
                  <button onClick={() => addToDashboard(d.id)} className={cn("shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium", addedTo === d.id ? "bg-green-100 text-green-700" : "bg-blue-600 text-white hover:bg-blue-700")}>{addedTo === d.id ? "Added ✓" : "Add"}</button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input value={newDash} onChange={(e) => setNewDash(e.target.value)} placeholder="New dashboard name…" className="h-9 flex-1 rounded-lg border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400" />
              <button onClick={addToNewDashboard} disabled={!newDash.trim()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"><Plus className="h-3.5 w-3.5" /> Create & add</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Fields */}
        <div className="w-72 shrink-0 overflow-y-auto border-r border-zinc-200 bg-white p-3">
          {/* Data sources: primary + joinable objects */}
          <div className="mb-3 rounded-lg border border-zinc-100 p-2">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Data sources</p>
              <button onClick={() => setSourcesOpen(true)} className="text-[10px] font-medium text-blue-600 hover:underline">Edit</button>
            </div>
            <p className="px-1 text-xs text-zinc-500">{reportLabel(objects, config.primary)} <span className="text-zinc-400">(primary)</span></p>
            {schema.associations.filter((a) => config.sources.some((s) => s.joinPath === a.path)).map((a) => (
              <p key={a.path} className="px-1 text-xs text-zinc-500">{a.label}</p>
            ))}
          </div>
          {sourcesOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={() => setSourcesOpen(false)}>
              <div className="w-full max-w-lg space-y-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between"><p className="text-sm font-semibold text-zinc-900">Edit data sources</p><button onClick={() => setSourcesOpen(false)} className="text-zinc-400 hover:text-zinc-700"><X className="h-4 w-4" /></button></div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">Primary data source</p>
                  <StyledSelect value={config.primary} onChange={(e) => setConfig((c) => ({ ...c, primary: e.target.value, sources: [], columns: [], measures: [{ source: e.target.value, key: "*", agg: "count" }], dimensions: [], breakdown: null }))} className="h-9 w-full text-sm">
                    {objects.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </StyledSelect>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">Secondary data sources</p>
                  <p className="mb-2 text-xs text-zinc-400">Related objects that share a link to the primary. Their fields become available.</p>
                  {schema.associations.length === 0 ? <p className="text-sm text-zinc-400">No related objects.</p> : (
                    <div className="grid grid-cols-2 gap-2">
                      {schema.associations.map((a) => {
                        const on = config.sources.some((s) => s.joinPath === a.path)
                        return (
                          <label key={a.path} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm", on ? "border-blue-400 bg-blue-50 text-blue-700" : "border-zinc-200 hover:border-zinc-300")}>
                            <input type="checkbox" checked={on} onChange={() => toggleSource(a)} /> {a.label}
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div className="flex justify-end"><button onClick={() => setSourcesOpen(false)} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">Done</button></div>
              </div>
            </div>
          )}
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search fields…" className="w-full rounded-lg border border-zinc-200 pl-8 pr-2 py-1.5 text-sm outline-none focus:border-zinc-400" />
          </div>
          {fieldGroups.map((grp) => grp.fields.length > 0 && (
            <div key={grp.label} className="mb-2">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{grp.label}</p>
              <div className="space-y-0.5">
                {grp.fields.map((f) => (
                  <div
                    key={f.key}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData("field", f.key); e.dataTransfer.effectAllowed = "copy" }}
                    className="group flex cursor-grab items-center gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50 active:cursor-grabbing"
                  >
                    <GripVertical className="h-3.5 w-3.5 shrink-0 text-zinc-300 group-hover:text-zinc-400" />
                    <span className="flex-1 truncate text-zinc-700" title={f.label}>{f.label}</span>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                      <button title="Add as column" onClick={() => addColumn(f)} className="rounded px-1 text-[10px] font-semibold text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700">COL</button>
                      <button title="Add as dimension" onClick={() => addDimension(f)} className="rounded px-1 text-[10px] font-semibold text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700">DIM</button>
                      <button title="Add as measure" onClick={() => addMeasure(f)} className="rounded px-1 text-[10px] font-semibold text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700">MSR</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Configure / Filters */}
        <div className="w-80 shrink-0 overflow-y-auto border-r border-zinc-200 bg-white">
          <div className="flex gap-1 border-b border-zinc-100 px-3 pt-3">
            {(["configure", "style", "filters"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={cn("rounded-t-lg border-b-2 px-3 py-1.5 text-sm font-medium capitalize", tab === t ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800")}>{t}</button>
            ))}
          </div>
          {tab === "style" ? (
            <div className="space-y-4 p-4">
              <Section title="Chart">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
                  <input type="checkbox" checked={!!style.dataLabels} onChange={(e) => setStyle({ dataLabels: e.target.checked })} /> Show data labels
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
                  <input type="checkbox" checked={!!style.stacked} onChange={(e) => setStyle({ stacked: e.target.checked })} /> Stack bars (breakdown)
                </label>
                <p className="text-xs text-zinc-400">Data labels apply to bar/line charts. Stacking applies to bar charts with a break-down.</p>
              </Section>
              <Section title="Legend">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
                  <input type="checkbox" checked={style.legend !== false} onChange={(e) => setStyle({ legend: e.target.checked })} /> Show legend
                </label>
                {style.legend !== false && (
                  <StyledSelect value={style.legendPos ?? "top"} onChange={(e) => setStyle({ legendPos: e.target.value as any })} className="h-7 text-xs">
                    <option value="top">Top</option><option value="right">Right</option><option value="bottom">Bottom</option>
                  </StyledSelect>
                )}
              </Section>
              <Section title="Axes">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
                  <input type="checkbox" checked={style.gridlines !== false} onChange={(e) => setStyle({ gridlines: e.target.checked })} /> Show gridlines
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
                  <input type="checkbox" checked={style.axisTitles !== false} onChange={(e) => setStyle({ axisTitles: e.target.checked })} /> Show axis titles
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">Y-axis max</span>
                  <input type="number" min={0} placeholder="Auto" value={style.yMax ?? ""} onChange={(e) => setStyle({ yMax: e.target.value ? +e.target.value : null })} className="h-7 w-24 rounded-lg border border-zinc-200 px-2 text-xs outline-none focus:border-zinc-400" />
                </div>
              </Section>
              <Section title="Colors">
                <StyledSelect value={style.palette ?? "default"} onChange={(e) => setStyle({ palette: e.target.value })} className="h-7 text-xs">
                  <option value="default">Default</option><option value="cool">Cool</option><option value="warm">Warm</option><option value="mono">Mono</option>
                </StyledSelect>
              </Section>
            </div>
          ) : tab === "configure" ? (
            <div className="space-y-4 p-4">
              <Section title="Measures">
                <DropZone onDropField={onDropField(addMeasure)}>
                  {config.measures.map((m, i) => {
                    const mDefault = m.key === "*" ? "(Count)" : `(${AGG_LABELS[m.agg] ?? m.agg}) ${byKey[m.key]?.label ?? m.key}`
                    return (
                      <FieldChip key={i}
                        label={m.label ?? mDefault}
                        defaultName={mDefault}
                        onRename={(v) => set({ measures: config.measures.map((x, j) => j === i ? { ...x, label: v ?? undefined } : x) })}
                        onRemove={() => set({ measures: config.measures.filter((_, j) => j !== i) })}
                        render={() => (
                          <>
                            {m.key !== "*" && (
                              <PopRow label="Aggregation">
                                <StyledSelect value={m.agg} onChange={(e) => set({ measures: config.measures.map((x, j) => j === i ? { ...x, agg: e.target.value as Aggregation } : x) })} className="h-8 w-full text-sm">
                                  {AGGS.map((a) => <option key={a} value={a}>{AGG_LABELS[a] ?? a}</option>)}
                                </StyledSelect>
                              </PopRow>
                            )}
                            <PopRow label="Format">
                              <StyledSelect value={m.format ?? "number"} onChange={(e) => set({ measures: config.measures.map((x, j) => j === i ? { ...x, format: e.target.value === "number" ? undefined : (e.target.value as any) } : x) })} className="h-8 w-full text-sm">
                                {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                              </StyledSelect>
                            </PopRow>
                            {["vbar", "line", "area"].includes(config.viz) && config.measures.length > 1 && (
                              <>
                                <PopRow label="Chart type">
                                  <StyledSelect value={m.chartType ?? (config.viz === "vbar" ? "bar" : "line")} onChange={(e) => set({ measures: config.measures.map((x, j) => j === i ? { ...x, chartType: e.target.value as any } : x) })} className="h-8 w-full text-sm">
                                    <option value="bar">Bar</option><option value="line">Line</option>
                                  </StyledSelect>
                                </PopRow>
                                <PopRow label="Axis">
                                  <StyledSelect value={m.axis ?? "left"} onChange={(e) => set({ measures: config.measures.map((x, j) => j === i ? { ...x, axis: e.target.value as any } : x) })} className="h-8 w-full text-sm">
                                    <option value="left">Left</option><option value="right">Right (secondary)</option>
                                  </StyledSelect>
                                </PopRow>
                              </>
                            )}
                          </>
                        )}
                      />
                    )
                  })}
                  {!config.measures.some((m) => m.key === "*") && <button onClick={() => set({ measures: [...config.measures, { source: config.primary, key: "*", agg: "count" }] })} className="text-xs text-blue-600 hover:underline">+ Count</button>}
                </DropZone>
              </Section>
              <Section title="Dimensions (group / x-axis)">
                <DropZone onDropField={onDropField(addDimension)} empty={<p className="text-xs text-zinc-400">Drag a field here to group / chart.</p>}>
                  {config.dimensions.map((d, i) => {
                    const dDefault = byKey[d.key]?.label ?? d.key
                    return (
                      <FieldChip key={i}
                        label={d.label ?? dDefault}
                        defaultName={dDefault}
                        onRename={(v) => set({ dimensions: config.dimensions.map((x, j) => j === i ? { ...x, label: v ?? undefined } : x) })}
                        onRemove={() => set({ dimensions: config.dimensions.filter((_, j) => j !== i) })}
                        render={byKey[d.key]?.type === "date" ? () => (
                          <PopRow label="Frequency">
                            <StyledSelect value={d.dateFrequency ?? "month"} onChange={(e) => set({ dimensions: config.dimensions.map((x, j) => j === i ? { ...x, dateFrequency: e.target.value as DateFrequency } : x) })} className="h-8 w-full text-sm capitalize">
                              {FREQS.map((fr) => <option key={fr} value={fr}>{fr}</option>)}
                            </StyledSelect>
                          </PopRow>
                        ) : undefined}
                      />
                    )
                  })}
                </DropZone>
              </Section>
              <Section title="Break down by">
                <DropZone onDropField={onDropField(setBreakdownField)} empty={<p className="text-xs text-zinc-400">Optional second dimension — drag a field (stack / compare).</p>}>
                  {config.breakdown ? <Chip label={byKey[config.breakdown.key]?.label ?? config.breakdown.key} onRemove={() => set({ breakdown: null })} /> : null}
                </DropZone>
                {!config.breakdown && config.dimensions.length > 0 && (
                  <StyledSelect value="" onChange={(e) => e.target.value && set({ breakdown: { source: byKey[e.target.value].source, key: e.target.value } })} className="h-7 text-xs">
                    <option value="">+ Add breakdown…</option>
                    {fields.filter((f) => f.type === "select" || f.type === "text").map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </StyledSelect>
                )}
              </Section>
              <Section title="Columns">
                {config.viz === "table" && config.dimensions.length > 0 && (
                  <div className="mb-1.5 inline-flex rounded-lg border border-zinc-200 p-0.5 text-xs">
                    {(["summarized", "unsummarized"] as const).map((mode) => (
                      <button key={mode} onClick={() => set({ tableMode: mode })}
                        className={cn("rounded-md px-2 py-1 capitalize", (config.tableMode ?? "summarized") === mode ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900")}>{mode}</button>
                    ))}
                  </div>
                )}
                {config.viz !== "table" && <p className="mb-1.5 text-[11px] text-zinc-400">Columns for the “Unsummarized data” table.</p>}
                <DropZone onDropField={onDropField(addColumn)} empty={<p className="text-xs text-zinc-400">Drag fields here — otherwise default fields are shown.</p>}>
                  {config.columns.map((c, i) => <Chip key={i} label={byKey[c.key]?.label ?? c.key} onRemove={() => set({ columns: config.columns.filter((_, j) => j !== i) })} />)}
                </DropZone>
              </Section>
              <Section title="Sort & limit">
                <div className="flex items-center gap-2">
                  <StyledSelect value={config.sort?.dir ?? "desc"} onChange={(e) => set({ sort: { by: config.sort?.by ?? "value", dir: e.target.value as any } })} className="h-7 text-xs" disabled={primaryDimIsDate}>
                    <option value="desc">Descending</option><option value="asc">Ascending</option>
                  </StyledSelect>
                  <input type="number" min={1} placeholder="Limit" value={config.limit ?? ""} onChange={(e) => set({ limit: e.target.value ? +e.target.value : null })} className="h-7 w-20 rounded-lg border border-zinc-200 px-2 text-xs outline-none focus:border-zinc-400" />
                </div>
                {primaryDimIsDate && <p className="text-xs text-zinc-400">Date charts are ordered chronologically; a limit keeps the most recent buckets.</p>}
              </Section>
              <Section title="Date range">
                <StyledSelect value={config.dateRange?.field ?? ""} onChange={(e) => set({ dateRange: e.target.value ? { field: e.target.value, preset: config.dateRange?.preset ?? "last_30", from: config.dateRange?.from, to: config.dateRange?.to } : null, compare: e.target.value ? config.compare : false })} className="h-7 text-xs">
                  <option value="">No date range</option>
                  {dateFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </StyledSelect>
                {config.dateRange?.field && (
                  <>
                    <StyledSelect value={config.dateRange.preset} onChange={(e) => set({ dateRange: { ...config.dateRange!, preset: e.target.value as any } })} className="h-7 text-xs">
                      {Object.entries(DATE_PRESET_GROUPED).map(([grp, items]) => (
                        <optgroup key={grp} label={grp}>
                          {items.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </optgroup>
                      ))}
                    </StyledSelect>
                    {config.dateRange.preset === "custom" && (
                      <div className="flex items-center gap-1.5">
                        <input type="date" value={config.dateRange.from ?? ""} onChange={(e) => set({ dateRange: { ...config.dateRange!, from: e.target.value } })} className="h-7 flex-1 rounded-lg border border-zinc-200 px-2 text-xs outline-none focus:border-zinc-400" />
                        <input type="date" value={config.dateRange.to ?? ""} onChange={(e) => set({ dateRange: { ...config.dateRange!, to: e.target.value } })} className="h-7 flex-1 rounded-lg border border-zinc-200 px-2 text-xs outline-none focus:border-zinc-400" />
                      </div>
                    )}
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-700">
                      <input type="checkbox" checked={!!config.compare} onChange={(e) => set({ compare: e.target.checked })} /> Compare vs previous period
                    </label>
                  </>
                )}
              </Section>
            </div>
          ) : (
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Filters</p>
                {(config.filters?.groups?.length ?? 0) > 0 && (
                  <button onClick={() => set({ filters: emptyFilter() })} className="text-xs text-zinc-500 hover:text-zinc-800">Clear all</button>
                )}
              </div>
              <FilterEditor fields={filterFields} value={config.filters ?? emptyFilter()} onChange={(v) => set({ filters: v })} />
            </div>
          )}
        </div>

        {/* Preview: the visualization on top, an Unsummarized/Summarized data table below (HubSpot-style) */}
        <div className="min-w-0 flex-1 space-y-4 overflow-auto bg-zinc-50 p-6">
          {config.viz !== "table" && (
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              {loading && !result ? <div className="flex items-center gap-1.5 text-xs text-zinc-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Running…</div>
                : result ? <ReportView result={result} style={style} onDrill={onDrill} /> : <Empty />}
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="flex gap-1 border-b border-zinc-100 px-3 pt-2">
              {(["unsummarized", "summarized"] as const).map((t) => (
                <button key={t} onClick={() => setDataTab(t)}
                  className={cn("rounded-t-lg border-b-2 px-3 py-1.5 text-sm font-medium", dataTab === t ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800")}>
                  {t === "unsummarized" ? "Unsummarized data" : "Summarized data"}
                </button>
              ))}
            </div>
            <div className="overflow-auto p-4">
              {dataLoading && !dataResult ? <div className="flex items-center gap-1.5 py-6 text-sm text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading data…</div>
                : dataResult ? <DataTable result={dataResult} onDrill={dataTab === "summarized" ? onDrill : undefined} pageSize={25} sortable frozenFirst /> : <p className="py-6 text-sm text-zinc-400">No data.</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Drill-into modal: the underlying records behind a bar / row / cell */}
      {drill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={() => setDrill(null)}>
          <div className="flex max-h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
              <div>
                <p className="text-sm font-semibold text-zinc-900">{drill.title}</p>
                {drill.result && <p className="text-xs text-zinc-500">{drill.result.total.toLocaleString()} record{drill.result.total === 1 ? "" : "s"}</p>}
              </div>
              <button onClick={() => setDrill(null)} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {drill.loading ? <div className="flex items-center gap-1.5 py-6 text-sm text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading records…</div>
                : drill.result ? <DataTable result={drill.result} pageSize={25} sortable frozenFirst /> : <p className="py-6 text-sm text-zinc-500">Couldn’t load records.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Coerce a stored v2 config (Json) back into a clean ReportConfig for the builder.
function sanitizeConfig(cfg: any): ReportConfig {
  return {
    primary: cfg?.primary ?? EMPTY_REPORT.primary,
    sources: Array.isArray(cfg?.sources) ? cfg.sources : [],
    viz: cfg?.viz ?? "table",
    columns: Array.isArray(cfg?.columns) ? cfg.columns : [],
    measures: Array.isArray(cfg?.measures) && cfg.measures.length ? cfg.measures : [{ source: cfg?.primary ?? "REFERRAL", key: "*", agg: "count" }],
    dimensions: Array.isArray(cfg?.dimensions) ? cfg.dimensions : [],
    breakdown: cfg?.breakdown ?? null,
    filters: cfg?.filters ?? null,
    sort: cfg?.sort ?? { by: "value", dir: "desc" },
    limit: cfg?.limit ?? null,
    tableMode: cfg?.tableMode ?? undefined,
    dateRange: cfg?.dateRange ?? null,
    compare: cfg?.compare ?? false,
    style: cfg?.style ?? undefined,
  }
}

function reportLabel(objects: { key: string; label: string }[], key: string): string {
  return objects.find((o) => o.key === key)?.label ?? key
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</p><div className="space-y-1.5">{children}</div></div>
}
// Droppable target that accepts a field dragged from the field list.
function DropZone({ onDropField, empty, children }: { onDropField: (e: React.DragEvent) => void; empty?: React.ReactNode; children?: React.ReactNode }) {
  const [over, setOver] = useState(false)
  const isEmpty = !children || (Array.isArray(children) && children.length === 0)
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { setOver(false); onDropField(e) }}
      className={cn(
        "space-y-1.5 rounded-lg transition-colors",
        over && "ring-2 ring-blue-400 ring-offset-1",
        isEmpty && "border border-dashed border-zinc-200 p-2",
      )}
    >
      {isEmpty ? (empty ?? <p className="text-xs text-zinc-400">Drag fields here.</p>) : children}
    </div>
  )
}
function Chip({ label, onRemove, children }: { label: string; onRemove: () => void; children?: React.ReactNode }) {
  return <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-sm"><span className="flex-1 truncate text-zinc-700">{label}</span>{children}<button onClick={onRemove} className="text-zinc-400 hover:text-red-500"><X className="h-3.5 w-3.5" /></button></div>
}
// A chip with a unified "Edit field" popover (rename + aggregation/format/frequency).
// `render` supplies the popover body; `defaultName` is the reset target for rename.
function FieldChip({ label, defaultName, onRename, onRemove, render }: {
  label: string; defaultName: string; onRename: (v: string | null) => void; onRemove: () => void
  render?: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as Element)?.closest?.("[data-select-menu-open]")) setOpen(false) }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-sm">
        <span className="flex-1 truncate text-zinc-700" title={label}>{label}</span>
        <button onClick={() => setOpen((o) => !o)} className={cn("text-zinc-400 hover:text-zinc-700", open && "text-zinc-800")} title="Edit field"><SlidersHorizontal className="h-3.5 w-3.5" /></button>
        <button onClick={onRemove} className="text-zinc-400 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
      </div>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-64 space-y-2.5 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg">
          <div>
            <div className="mb-1 flex items-center justify-between"><span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Name</span><button onClick={() => onRename(null)} className="text-[11px] text-blue-600 hover:underline">Reset</button></div>
            <input value={label} onChange={(e) => onRename(e.target.value || null)} placeholder={defaultName} className="w-full rounded-lg border border-zinc-200 px-2 py-1 text-sm outline-none focus:border-zinc-400" />
          </div>
          {render?.(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
function PopRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{label}</p>{children}</div>
}
function Empty() {
  return <div className="flex h-full items-center justify-center text-center"><div><BarChart3 className="mx-auto h-10 w-10 text-zinc-300" /><p className="mt-2 text-sm text-zinc-500">Add measures and a dimension to build your report.</p></div></div>
}
