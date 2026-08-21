"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Search, Plus, X, Loader2, Save, BarChart3, Table2, Hash } from "lucide-react"
import { cn } from "@/lib/utils"
import StyledSelect from "@/components/ui/styled-select"
import FilterBuilder from "@/components/ui/filter-builder"
import { getReportSchema, runReportPreview, drillIntoReport } from "@/app/actions/report-builder"
import { createSavedReport } from "@/app/actions/saved-reports"
import { emptyFilter, type FilterState, type FilterField } from "@/lib/filters"
import type { ReportConfig, ReportField, ReportResult, Aggregation, DateFrequency, VizType } from "@/lib/reporting/types"
import { EMPTY_REPORT } from "@/lib/reporting/types"

const VIZ_OPTIONS: { value: VizType; label: string }[] = [
  { value: "table", label: "Table" }, { value: "kpi", label: "KPI" },
  { value: "vbar", label: "Vertical bar" }, { value: "hbar", label: "Horizontal bar" },
  { value: "line", label: "Line" }, { value: "area", label: "Area" },
  { value: "pie", label: "Pie" }, { value: "donut", label: "Donut" },
  { value: "pivot", label: "Pivot table" },
]
const AGGS: Aggregation[] = ["count", "distinct_count", "sum", "avg", "min", "max"]
const FREQS: DateFrequency[] = ["day", "week", "month", "quarter", "year"]
const PALETTE = ["#6366f1", "#14b8a6", "#f97316", "#ec4899", "#8b5cf6", "#0ea5e9", "#84cc16", "#f59e0b"]

export default function ReportBuilderV2({ objects }: { objects: { key: string; label: string }[] }) {
  const [config, setConfig] = useState<ReportConfig>({ ...EMPTY_REPORT, primary: objects[0]?.key ?? "REFERRAL" })
  const [schema, setSchema] = useState<{ fields: ReportField[]; associations: { path: string; target: string; label: string; fields: ReportField[] }[] }>({ fields: [], associations: [] })
  const [result, setResult] = useState<ReportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState("")
  const [tab, setTab] = useState<"configure" | "style" | "filters">("configure")
  const [name, setName] = useState("")
  const [saved, setSaved] = useState(false)
  const [drill, setDrill] = useState<{ title: string; result: ReportResult | null; loading: boolean } | null>(null)

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

  async function save() {
    if (!name.trim()) return
    await createSavedReport(name.trim(), { v: 2, ...config } as any)
    setSaved(true); setTimeout(() => setSaved(false), 2500)
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
            {saved ? "Saved ✓" : <><Save className="h-3.5 w-3.5" /> Save</>}
          </button>
        </div>
      </div>

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
          {!result ? <Empty /> : <Preview result={result} style={style} onDrill={onDrill} />}
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

type DrillFn = (dimKey: string, bdKey: string | null, title: string) => void
type Style = { dataLabels?: boolean; stacked?: boolean }

function Preview({ result, style, onDrill }: { result: ReportResult; style: Style; onDrill: DrillFn }) {
  if (result.viz === "kpi") return <div className="flex h-full flex-col items-center justify-center"><Hash className="h-6 w-6 text-zinc-300" /><div className="mt-2 text-5xl font-bold text-zinc-900">{(result.kpi ?? 0).toLocaleString()}</div><p className="mt-1 text-sm text-zinc-500">{result.total.toLocaleString()} records</p></div>

  if (result.viz === "pivot" && result.pivot) return <div className="rounded-xl border border-zinc-200 bg-white p-5"><PivotTable pivot={result.pivot} onDrill={onDrill} /></div>

  const series = result.series ?? []
  if (["vbar", "hbar", "line", "area", "pie", "donut"].includes(result.viz) && series.length) {
    return <div className="rounded-xl border border-zinc-200 bg-white p-5"><Chart result={result} style={style} onDrill={onDrill} /><DataTable result={result} onDrill={onDrill} /></div>
  }
  return <div className="rounded-xl border border-zinc-200 bg-white p-5"><DataTable result={result} onDrill={onDrill} /></div>
}

function DataTable({ result, onDrill }: { result: ReportResult; onDrill?: DrillFn }) {
  // Summarized tables (one row per dimension group) carry rowKeys → rows drill in.
  const drillable = !!(onDrill && result.rowKeys && result.rowKeys.length === result.rows.length)
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">{result.columns.map((c) => <th key={c.key} className="px-3 py-2 font-semibold">{c.label}</th>)}</tr></thead>
        <tbody>{result.rows.map((r, i) => (
          <tr key={i} onClick={drillable ? () => onDrill!(result.rowKeys![i], null, String(r[0] ?? "Records")) : undefined}
            className={cn("border-b border-zinc-100", drillable ? "cursor-pointer hover:bg-blue-50" : "hover:bg-zinc-50")}>
            {r.map((v, j) => <td key={j} className="px-3 py-2 text-zinc-700">{v == null ? <span className="text-zinc-300">—</span> : typeof v === "number" ? v.toLocaleString() : v}</td>)}
          </tr>
        ))}</tbody>
      </table>
      {result.capped && <p className="mt-2 text-xs text-amber-600">Showing the first {result.total.toLocaleString()} records.</p>}
    </div>
  )
}

function PivotTable({ pivot, onDrill }: { pivot: NonNullable<ReportResult["pivot"]>; onDrill?: DrillFn }) {
  const nCols = pivot.colLabels.length
  const rowTotals = pivot.cells.map((row) => row.reduce((a: number, v) => a + (v ?? 0), 0))
  const colTotals = pivot.colLabels.map((_, j) => pivot.cells.reduce((a: number, row) => a + (row[j] ?? 0), 0))
  const grand = colTotals.reduce((a: number, v) => a + v, 0)
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
            <th className="px-3 py-2 font-semibold" />
            {pivot.colLabels.map((c, j) => <th key={j} className="px-3 py-2 text-right font-semibold">{c}</th>)}
            {nCols > 1 && <th className="px-3 py-2 text-right font-semibold">Total</th>}
          </tr>
        </thead>
        <tbody>
          {pivot.rowLabels.map((rl, i) => (
            <tr key={i} className="border-b border-zinc-100 hover:bg-zinc-50">
              <td className="px-3 py-2 font-medium text-zinc-700">{rl}</td>
              {pivot.cells[i].map((v, j) => (
                <td key={j} onClick={onDrill && (v ?? 0) > 0 ? () => onDrill(pivot.rowKeys[i], pivot.colKeys[j], `${rl} · ${pivot.colLabels[j]}`) : undefined}
                  className={cn("px-3 py-2 text-right text-zinc-700", onDrill && (v ?? 0) > 0 && "cursor-pointer hover:bg-blue-50")}>{(v ?? 0).toLocaleString()}</td>
              ))}
              {nCols > 1 && <td className="px-3 py-2 text-right font-semibold text-zinc-900">{rowTotals[i].toLocaleString()}</td>}
            </tr>
          ))}
          <tr className="border-t-2 border-zinc-200 font-semibold text-zinc-900">
            <td className="px-3 py-2">Total</td>
            {colTotals.map((v, j) => <td key={j} className="px-3 py-2 text-right">{v.toLocaleString()}</td>)}
            {nCols > 1 && <td className="px-3 py-2 text-right">{grand.toLocaleString()}</td>}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// Simple SVG chart for bar/line/area/pie off the engine's series.
function Chart({ result, style, onDrill }: { result: ReportResult; style: Style; onDrill?: DrillFn }) {
  const series = result.series ?? []
  const labels = series[0]?.points.map((p) => p.label) ?? []
  const keys = series[0]?.points.map((p) => p.key) ?? []
  const stacked = result.stacked || !!style.stacked
  const labelClick = (i: number) => onDrill && keys[i] != null ? () => onDrill(keys[i], null, labels[i]) : undefined
  const max = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.value)))
  const stackMax = Math.max(1, ...labels.map((_, i) => series.reduce((a, s) => a + (s.points[i]?.value ?? 0), 0)))
  const W = 640, H = 260, padL = 40, padB = 60, padT = 10, cW = W - padL - 10, cH = H - padT - padB

  if (result.viz === "pie" || result.viz === "donut") {
    const pts = (series[0]?.points ?? [])
    const totalV = Math.max(1, pts.reduce((a, p) => a + p.value, 0))
    let a0 = -Math.PI / 2
    const cx = 130, cy = 130, r = 110, ri = result.viz === "donut" ? 55 : 0
    return (
      <div className="flex flex-wrap items-center gap-6">
        <svg viewBox="0 0 260 260" className="h-56 w-56">
          {pts.map((p, i) => {
            const a1 = a0 + (p.value / totalV) * Math.PI * 2
            const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
            const large = a1 - a0 > Math.PI ? 1 : 0
            const d = ri > 0
              ? `M ${cx + ri * Math.cos(a0)} ${cy + ri * Math.sin(a0)} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${cx + ri * Math.cos(a1)} ${cy + ri * Math.sin(a1)} A ${ri} ${ri} 0 ${large} 0 ${cx + ri * Math.cos(a0)} ${cy + ri * Math.sin(a0)} Z`
              : `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`
            a0 = a1
            return <path key={i} d={d} fill={PALETTE[i % PALETTE.length]} onClick={onDrill ? () => onDrill(p.key, null, p.label) : undefined} className={onDrill ? "cursor-pointer" : undefined} />
          })}
        </svg>
        <div className="space-y-1 text-sm">{pts.map((p, i) => <div key={i} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />{p.label}<span className="text-zinc-400">{p.value.toLocaleString()}</span></div>)}</div>
      </div>
    )
  }

  const n = labels.length || 1

  // Horizontal bar — category rows top-to-bottom, bars growing left→right.
  if (result.viz === "hbar") {
    const rowH = 26, gap = 8, chartW = 560, labelW = 130
    return (
      <div>
        {series.length > 1 && <div className="mb-2 flex flex-wrap gap-3 text-xs">{series.map((s, i) => <span key={i} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />{s.name}</span>)}</div>}
        <svg viewBox={`0 0 ${labelW + chartW + 50} ${(rowH + gap) * n + 10}`} className="w-full">
          {labels.map((l, i) => {
            const y = i * (rowH + gap) + 5
            const sh = rowH / series.length
            return (
              <g key={i} onClick={labelClick(i)} className={onDrill ? "cursor-pointer" : undefined}>
                <rect x={0} y={y} width={labelW + chartW + 50} height={rowH} fill="transparent" />
                <text x={labelW - 8} y={y + rowH / 2} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="#555">{l.length > 18 ? l.slice(0, 17) + "…" : l}</text>
                {series.map((s, si) => {
                  const v = s.points[i]?.value ?? 0
                  const w = (v / max) * chartW
                  return <g key={si}><rect x={labelW} y={y + sh * si} width={Math.max(0, w)} height={Math.max(1, sh - 2)} fill={PALETTE[si % PALETTE.length]} rx={2} /><text x={labelW + w + 4} y={y + sh * si + sh / 2} dominantBaseline="middle" fontSize={10} fill="#888">{v.toLocaleString()}</text></g>
                })}
              </g>
            )
          })}
        </svg>
      </div>
    )
  }

  const bw = cW / n
  return (
    <div>
      {series.length > 1 && <div className="mb-2 flex flex-wrap gap-3 text-xs">{series.map((s, i) => <span key={i} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />{s.name}</span>)}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {[0, 0.5, 1].map((t) => <line key={t} x1={padL} x2={W - 10} y1={padT + cH - t * cH} y2={padT + cH - t * cH} stroke="#eee" />)}
        {result.viz === "line" || result.viz === "area" ? (
          series.map((s, si) => {
            const pts = s.points.map((p, i) => `${padL + bw * i + bw / 2},${padT + cH - (p.value / max) * cH}`).join(" ")
            return <g key={si}>{result.viz === "area" && <polygon points={`${padL + bw / 2},${padT + cH} ${pts} ${padL + bw * (n - 1) + bw / 2},${padT + cH}`} fill={PALETTE[si % PALETTE.length] + "33"} />}<polyline points={pts} fill="none" stroke={PALETTE[si % PALETTE.length]} strokeWidth={2} /></g>
          })
        ) : stacked ? (
          // Stacked bars (breakdown composition): max is the tallest stack.
          labels.map((_, i) => {
            let running = 0
            const total = series.reduce((a, s) => a + (s.points[i]?.value ?? 0), 0)
            return (
              <g key={i} onClick={labelClick(i)} className={onDrill ? "cursor-pointer" : undefined}>
                {series.map((s, si) => {
                  const v = s.points[i]?.value ?? 0
                  const h = (v / stackMax) * cH
                  const y = padT + cH - running - h
                  running += h
                  return <rect key={si} x={padL + bw * i + bw * 0.15} y={y} width={bw * 0.7} height={Math.max(0, h)} fill={PALETTE[si % PALETTE.length]} />
                })}
                {style.dataLabels && total > 0 && <text x={padL + bw * i + bw / 2} y={padT + cH - (total / stackMax) * cH - 3} textAnchor="middle" fontSize={9} fill="#666">{total.toLocaleString()}</text>}
              </g>
            )
          })
        ) : (
          labels.map((_, i) => (
            <g key={i} onClick={labelClick(i)} className={onDrill ? "cursor-pointer" : undefined}>
              {series.map((s, si) => {
                const v = s.points[i]?.value ?? 0
                const groupW = bw / series.length
                const bh = (v / max) * cH
                return (
                  <g key={si}>
                    <rect x={padL + bw * i + groupW * si + 2} y={padT + cH - bh} width={Math.max(1, groupW - 4)} height={bh} fill={PALETTE[si % PALETTE.length]} rx={2} />
                    {style.dataLabels && v > 0 && <text x={padL + bw * i + groupW * si + groupW / 2} y={padT + cH - bh - 3} textAnchor="middle" fontSize={9} fill="#666">{v.toLocaleString()}</text>}
                  </g>
                )
              })}
            </g>
          ))
        )}
        {labels.map((l, i) => <text key={i} x={padL + bw * i + bw / 2} y={H - padB + 16} textAnchor="middle" fontSize={10} fill="#888">{l.length > 10 ? l.slice(0, 9) + "…" : l}</text>)}
      </svg>
    </div>
  )
}
