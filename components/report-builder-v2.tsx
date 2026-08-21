"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Search, Plus, X, Loader2, Save, BarChart3, LayoutDashboard } from "lucide-react"
import { cn } from "@/lib/utils"
import StyledSelect from "@/components/ui/styled-select"
import FilterBuilder from "@/components/ui/filter-builder"
import { getReportSchema, runReportPreview, drillIntoReport } from "@/app/actions/report-builder"
import { createSavedReport } from "@/app/actions/saved-reports"
import { getDashboards, addReportToDashboard, createDashboard, type DashboardSummary } from "@/app/actions/dashboards"
import { emptyFilter, type FilterState, type FilterField } from "@/lib/filters"
import type { ReportConfig, ReportField, ReportResult, Aggregation, DateFrequency, VizType } from "@/lib/reporting/types"
import { EMPTY_REPORT } from "@/lib/reporting/types"
import { ReportView, DataTable } from "@/components/report-view"

const VIZ_OPTIONS: { value: VizType; label: string }[] = [
  { value: "table", label: "Table" }, { value: "kpi", label: "KPI" },
  { value: "vbar", label: "Vertical bar" }, { value: "hbar", label: "Horizontal bar" },
  { value: "line", label: "Line" }, { value: "area", label: "Area" },
  { value: "pie", label: "Pie" }, { value: "donut", label: "Donut" },
  { value: "pivot", label: "Pivot table" },
]
const AGGS: Aggregation[] = ["count", "distinct_count", "sum", "avg", "min", "max"]
const FREQS: DateFrequency[] = ["day", "week", "month", "quarter", "year"]

export default function ReportBuilderV2({ objects, initial }: { objects: { key: string; label: string }[]; initial?: { id: string; name: string; config: any } | null }) {
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

  // Drill into the records behind a bar / summarized row / pivot cell.
  async function onDrill(dimKey: string, bdKey: string | null, title: string) {
    setDrill({ title, result: null, loading: true })
    try { setDrill({ title, result: await drillIntoReport(config, dimKey, bdKey), loading: false }) }
    catch { setDrill({ title, result: null, loading: false }) }
  }
  const style = (config.style ?? {}) as { dataLabels?: boolean; stacked?: boolean }
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

  const set = (patch: Partial<ReportConfig>) => setConfig((c) => ({ ...c, ...patch }))
  // Filters translate on primary fields only (joins aren't traversable server-side).
  const filterFields: FilterField[] = useMemo(
    () => primaryFields.map((f) => ({ key: f.key, label: f.label, type: f.type, column: f.column, jsonBag: f.jsonBag, options: f.options, getValue: () => null })),
    [primaryFields],
  )
  const toggleSource = (a: { path: string; target: string; label: string }) => setConfig((c) => {
    const on = c.sources.some((s) => s.joinPath === a.path)
    return on
      ? { ...c, sources: c.sources.filter((s) => s.joinPath !== a.path) }
      : { ...c, sources: [...c.sources, { objectKey: a.target, joinPath: a.path, label: a.label }] }
  })

  const addColumn = (f: ReportField) => { if (!config.columns.some((c) => c.key === f.key)) set({ columns: [...config.columns, { source: f.source, key: f.key }] }) }
  const addDimension = (f: ReportField) => { if (!config.dimensions.some((d) => d.key === f.key)) set({ dimensions: [...config.dimensions, { source: f.source, key: f.key, dateFrequency: f.type === "date" ? "month" : undefined }] }) }
  const addMeasure = (f: ReportField) => { if (!config.measures.some((m) => m.key === f.key)) set({ measures: [...config.measures, { source: f.source, key: f.key, agg: f.type === "number" ? "sum" : "distinct_count" }] }) }

  const filt = (arr: ReportField[]) => query.trim() ? arr.filter((f) => f.label.toLowerCase().includes(query.toLowerCase())) : arr
  const fieldGroups: { label: string; fields: ReportField[] }[] = [
    { label: reportLabel(objects, config.primary) + " (primary)", fields: filt(primaryFields) },
    ...activeAssocs.map((a) => ({ label: a.label, fields: filt(a.fields) })),
  ]

  // Save (once) and return the SavedReport id so it can be added to a dashboard.
  async function ensureSaved(): Promise<string | null> {
    if (!name.trim()) return null
    if (savedId) return savedId
    const { id } = await createSavedReport(name.trim(), { v: 2, ...config } as any)
    setSavedId(id)
    return id
  }
  async function save() {
    const id = await ensureSaved()
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
  // Editing the config after a save should create a new report on next save
  // (skip the first run so an opened report keeps its id until actually edited).
  const configDirty = useRef(false)
  useEffect(() => { if (configDirty.current) setSavedId(null); else configDirty.current = true }, [config])

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
            {saved ? "Saved ✓" : <><Save className="h-3.5 w-3.5" /> Save</>}
          </button>
          <button onClick={openDashboards} disabled={!name.trim()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 hover:border-zinc-400 disabled:opacity-50">
            <LayoutDashboard className="h-3.5 w-3.5" /> Add to dashboard
          </button>
        </div>
      </div>

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
          {schema.associations.length > 0 && (
            <div className="mb-3 rounded-lg border border-zinc-100 p-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Data sources</p>
              {schema.associations.map((a) => {
                const on = config.sources.some((s) => s.joinPath === a.path)
                return (
                  <label key={a.path} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-zinc-50">
                    <input type="checkbox" checked={on} onChange={() => toggleSource(a)} />
                    <span className="text-zinc-700">{a.label}</span>
                  </label>
                )
              })}
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
                  <div key={f.key} className="group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50">
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
            </div>
          ) : tab === "configure" ? (
            <div className="space-y-4 p-4">
              <Section title="Measures">
                {(config.measures.length ? config.measures : []).map((m, i) => (
                  <Chip key={i} label={m.key === "*" ? "Count" : byKey[m.key]?.label ?? m.key} onRemove={() => set({ measures: config.measures.filter((_, j) => j !== i) })}>
                    {m.key !== "*" && (
                      <StyledSelect value={m.agg} onChange={(e) => set({ measures: config.measures.map((x, j) => j === i ? { ...x, agg: e.target.value as Aggregation } : x) })} className="h-6 text-xs">
                        {AGGS.map((a) => <option key={a} value={a}>{a}</option>)}
                      </StyledSelect>
                    )}
                  </Chip>
                ))}
                {!config.measures.some((m) => m.key === "*") && <button onClick={() => set({ measures: [...config.measures, { source: config.primary, key: "*", agg: "count" }] })} className="text-xs text-blue-600 hover:underline">+ Count</button>}
              </Section>
              <Section title="Dimensions (group / x-axis)">
                {config.dimensions.map((d, i) => (
                  <Chip key={i} label={byKey[d.key]?.label ?? d.key} onRemove={() => set({ dimensions: config.dimensions.filter((_, j) => j !== i) })}>
                    {byKey[d.key]?.type === "date" && (
                      <StyledSelect value={d.dateFrequency ?? "month"} onChange={(e) => set({ dimensions: config.dimensions.map((x, j) => j === i ? { ...x, dateFrequency: e.target.value as DateFrequency } : x) })} className="h-6 text-xs">
                        {FREQS.map((fr) => <option key={fr} value={fr}>{fr}</option>)}
                      </StyledSelect>
                    )}
                  </Chip>
                ))}
                {config.dimensions.length === 0 && <p className="text-xs text-zinc-400">Add a field as a dimension to group/chart.</p>}
              </Section>
              <Section title="Break down by">
                {config.breakdown ? <Chip label={byKey[config.breakdown.key]?.label ?? config.breakdown.key} onRemove={() => set({ breakdown: null })} /> : <p className="text-xs text-zinc-400">Optional second dimension (stack/compare).</p>}
                {!config.breakdown && config.dimensions.length > 0 && (
                  <StyledSelect value="" onChange={(e) => e.target.value && set({ breakdown: { source: byKey[e.target.value].source, key: e.target.value } })} className="h-7 text-xs">
                    <option value="">+ Add breakdown…</option>
                    {fields.filter((f) => f.type === "select" || f.type === "text").map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </StyledSelect>
                )}
              </Section>
              {config.viz === "table" && (
                <Section title="Columns">
                  {config.columns.map((c, i) => <Chip key={i} label={byKey[c.key]?.label ?? c.key} onRemove={() => set({ columns: config.columns.filter((_, j) => j !== i) })} />)}
                  {config.columns.length === 0 && <p className="text-xs text-zinc-400">No columns — showing default fields.</p>}
                </Section>
              )}
              <Section title="Sort & limit">
                <div className="flex items-center gap-2">
                  <StyledSelect value={config.sort?.dir ?? "desc"} onChange={(e) => set({ sort: { by: config.sort?.by ?? "value", dir: e.target.value as any } })} className="h-7 text-xs">
                    <option value="desc">Descending</option><option value="asc">Ascending</option>
                  </StyledSelect>
                  <input type="number" min={1} placeholder="Limit" value={config.limit ?? ""} onChange={(e) => set({ limit: e.target.value ? +e.target.value : null })} className="h-7 w-20 rounded-lg border border-zinc-200 px-2 text-xs outline-none focus:border-zinc-400" />
                </div>
              </Section>
            </div>
          ) : (
            <div className="p-4"><FilterBuilder fields={filterFields} value={config.filters ?? emptyFilter()} onChange={(v) => set({ filters: v })} /></div>
          )}
        </div>

        {/* Preview */}
        <div className="min-w-0 flex-1 overflow-auto bg-zinc-50 p-6">
          {loading && <div className="mb-3 flex items-center gap-1.5 text-xs text-zinc-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Running…</div>}
          {!result ? <Empty /> : <div className="rounded-xl border border-zinc-200 bg-white p-5"><ReportView result={result} style={style} onDrill={onDrill} /></div>}
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
                : drill.result ? <DataTable result={drill.result} /> : <p className="py-6 text-sm text-zinc-500">Couldn’t load records.</p>}
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
    style: cfg?.style ?? undefined,
  }
}

function reportLabel(objects: { key: string; label: string }[], key: string): string {
  return objects.find((o) => o.key === key)?.label ?? key
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</p><div className="space-y-1.5">{children}</div></div>
}
function Chip({ label, onRemove, children }: { label: string; onRemove: () => void; children?: React.ReactNode }) {
  return <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-sm"><span className="flex-1 truncate text-zinc-700">{label}</span>{children}<button onClick={onRemove} className="text-zinc-400 hover:text-red-500"><X className="h-3.5 w-3.5" /></button></div>
}
function Empty() {
  return <div className="flex h-full items-center justify-center text-center"><div><BarChart3 className="mx-auto h-10 w-10 text-zinc-300" /><p className="mt-2 text-sm text-zinc-500">Add measures and a dimension to build your report.</p></div></div>
}
