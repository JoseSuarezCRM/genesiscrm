"use client"

import { useState, useRef, useMemo } from "react"
import Link from "next/link"
import { Hash, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/number-format"
import type { ReportResult } from "@/lib/reporting/types"

export const PALETTE = ["#6366f1", "#14b8a6", "#f97316", "#ec4899", "#8b5cf6", "#0ea5e9", "#84cc16", "#f59e0b"]
export const PALETTES: Record<string, string[]> = {
  default: PALETTE,
  cool: ["#6366f1", "#0ea5e9", "#14b8a6", "#8b5cf6", "#3b82f6", "#06b6d4", "#22d3ee", "#a78bfa"],
  warm: ["#f97316", "#ef4444", "#ec4899", "#f59e0b", "#e11d48", "#fb7185", "#f472b6", "#fbbf24"],
  mono: ["#334155", "#475569", "#64748b", "#94a3b8", "#1e293b", "#0f172a", "#cbd5e1", "#7c8798"],
}

export type DrillFn = (dimKey: string, bdKey: string | null, title: string) => void
export type ReportStyle = {
  dataLabels?: boolean
  stacked?: boolean
  legend?: boolean
  legendPos?: "top" | "right" | "bottom"
  gridlines?: boolean
  axisTitles?: boolean
  palette?: string
  yMax?: number | null
}
type ValueFormat = { format: "number" | "currency" | "percent" | "duration"; decimals?: number }

// Render a measure value per its format (currency/percent/duration/decimals).
export function fmtNum(v: number, vf?: ValueFormat): string {
  if (!vf) return v.toLocaleString()
  if (vf.format === "duration") { const d = vf.decimals ?? 1; return `${v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })} days` }
  const d = vf.decimals ?? (vf.format === "currency" ? 2 : 0)
  const n = v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })
  if (vf.format === "currency") return "$" + n
  if (vf.format === "percent") return n + "%"
  return n
}

// Renders a ReportResult (KPI / pivot / chart+table / table). Shared by the builder
// preview and dashboard cards. Pass onDrill to make bars/rows/cells click into records.
export function ReportView({ result, style, onDrill }: { result: ReportResult; style?: ReportStyle; onDrill?: DrillFn }) {
  const st = style ?? {}
  if (result.viz === "kpi") {
    const kpis = result.kpis && result.kpis.length ? result.kpis : [{ label: "", value: result.kpi ?? 0, format: result.valueFormat }]
    if (kpis.length === 1) return (
      <div className="flex h-full flex-col items-center justify-center">
        <Hash className="h-6 w-6 text-zinc-300" />
        <div className="mt-2 text-5xl font-bold text-zinc-900">{fmtNum(kpis[0].value, kpis[0].format)}</div>
        {kpis[0].label && <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{kpis[0].label}</p>}
        <p className="mt-1 text-sm text-zinc-500">{result.total.toLocaleString()} records</p>
        {result.comparison && <DeltaBadge c={result.comparison} vf={result.valueFormat} />}
      </div>
    )
    // Multi-metric summary card: a row of big numbers.
    return (
      <div className="flex flex-wrap items-start justify-around gap-6 py-4">
        {kpis.map((k, i) => (
          <div key={i} className="min-w-[120px] text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{k.label}</p>
            <div className="mt-1 text-4xl font-bold text-zinc-900">{fmtNum(k.value, k.format)}</div>
          </div>
        ))}
      </div>
    )
  }

  if (result.viz === "gauge") {
    const v = result.kpi ?? 0
    const gMax = (st.yMax && st.yMax > 0) ? st.yMax : Math.max(1, v)
    const frac = Math.max(0, Math.min(1, v / gMax))
    const R = 90, cx = 110, cy = 110
    const ang = Math.PI * (1 - frac) // 180°→0°
    const arc = (a: number) => `${cx + R * Math.cos(a)},${cy - R * Math.sin(a)}`
    const palette = PALETTES[st.palette ?? "default"] ?? PALETTE
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <svg viewBox="0 0 220 130" className="w-64">
          <path d={`M ${arc(Math.PI)} A ${R} ${R} 0 0 1 ${arc(0)}`} fill="none" stroke="#e5e7eb" strokeWidth={16} strokeLinecap="round" />
          <path d={`M ${arc(Math.PI)} A ${R} ${R} 0 0 1 ${arc(ang)}`} fill="none" stroke={palette[0]} strokeWidth={16} strokeLinecap="round" />
          <text x={cx} y={cy - 8} textAnchor="middle" fontSize={26} fontWeight={700} fill="#18181b">{fmtNum(v, result.valueFormat)}</text>
          <text x={cx} y={cy + 12} textAnchor="middle" fontSize={10} fill="#a1a1aa">of {fmtNum(gMax, result.valueFormat)}</text>
        </svg>
        {result.kpis?.[0]?.label && <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{result.kpis[0].label}</p>}
      </div>
    )
  }

  if (result.viz === "pivot" && result.pivot) return <div><CompareCaption result={result} /><PivotTable pivot={result.pivot} onDrill={onDrill} valueFormat={result.valueFormat} /></div>

  const series = result.series ?? []
  if (["vbar", "hbar", "line", "area", "pie", "donut"].includes(result.viz) && series.length) {
    return <div><CompareCaption result={result} /><Chart result={result} style={st} onDrill={onDrill} /><DataTable result={result} onDrill={onDrill} /></div>
  }
  return <div><CompareCaption result={result} /><DataTable result={result} onDrill={onDrill} /></div>
}

function deltaColor(d: number | null): string {
  if (d == null || d === 0) return "text-zinc-400"
  return d > 0 ? "text-green-600" : "text-red-600"
}
function DeltaBadge({ c, vf }: { c: NonNullable<ReportResult["comparison"]>; vf?: ValueFormat }) {
  return <p className={cn("mt-1 text-sm font-medium", deltaColor(c.delta))}>{c.delta == null ? "—" : `${c.delta > 0 ? "▲" : c.delta < 0 ? "▼" : ""} ${Math.abs(c.delta)}%`} <span className="text-zinc-400 font-normal">vs prev {fmtNum(c.prev, vf)}</span></p>
}
function CompareCaption({ result }: { result: ReportResult }) {
  if (!result.comparison) return null
  const c = result.comparison
  return <p className={cn("mb-2 text-xs font-medium", deltaColor(c.delta))}>{c.delta == null ? "—" : `${c.delta > 0 ? "▲" : c.delta < 0 ? "▼" : ""} ${Math.abs(c.delta)}%`} <span className="text-zinc-400 font-normal">vs previous period ({fmtNum(c.prev, result.valueFormat)})</span></p>
}

// Shared footer: "x–y of z" + page-size selector (10/25/50/100) + Prev/Next.
function PagerControls({ total, page, pageCount, pageSize, start, shown, onPage, onPageSize }: {
  total: number; page: number; pageCount: number; pageSize: number; start: number; shown: number
  onPage: (p: number) => void; onPageSize: (n: number) => void
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
      <span>{(start + 1).toLocaleString()}–{(start + shown).toLocaleString()} of {total.toLocaleString()}</span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1">
          <span className="text-zinc-400">Per page</span>
          <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="rounded-md border border-zinc-200 px-1.5 py-1 text-xs outline-none hover:border-zinc-400">
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button onClick={() => onPage(Math.max(0, page - 1))} disabled={page === 0} className="inline-flex items-center gap-0.5 rounded-md border border-zinc-200 px-2 py-1 disabled:opacity-40 hover:border-zinc-400"><ChevronLeft className="h-3.5 w-3.5" /> Prev</button>
          <span className="px-1">{page + 1} / {pageCount}</span>
          <button onClick={() => onPage(Math.min(pageCount - 1, page + 1))} disabled={page >= pageCount - 1} className="inline-flex items-center gap-0.5 rounded-md border border-zinc-200 px-2 py-1 disabled:opacity-40 hover:border-zinc-400">Next <ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </div>
  )
}

export function DataTable({ result, onDrill, pageSize: propPageSize, sortable = true, frozenFirst }: { result: ReportResult; onDrill?: DrillFn; pageSize?: number; sortable?: boolean; frozenFirst?: boolean }) {
  // Summarized tables (one row per dimension group) carry rowKeys → rows drill in.
  const drillable = !!(onDrill && result.rowKeys && result.rowKeys.length === result.rows.length)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(propPageSize ?? 25)
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null)

  // Sort a stable index array so rowKeys (drill) stay aligned with the visible order.
  const orderIdx = useMemo(() => {
    const idxs = result.rows.map((_, i) => i)
    if (!sort) return idxs
    const { col, dir } = sort
    return idxs.sort((a, b) => {
      const av = result.rows[a][col], bv = result.rows[b][col]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
  }, [result.rows, sort])

  const showControls = orderIdx.length > 10
  const pageCount = showControls ? Math.max(1, Math.ceil(orderIdx.length / pageSize)) : 1
  const p = Math.min(page, pageCount - 1)
  const start = showControls ? p * pageSize : 0
  const sliceIdx = showControls ? orderIdx.slice(start, start + pageSize) : orderIdx
  const toggleSort = (col: number) => setSort((s) => (s && s.col === col ? { col, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : { col, dir: 1 }))
  const frozenCls = (j: number) => frozenFirst && j === 0 ? "sticky left-0 z-[1] bg-white" : ""

  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
            {result.columns.map((c, j) => (
              <th key={c.key} className={cn("px-3 py-2 font-semibold", frozenFirst && j === 0 && "sticky left-0 z-[2] bg-zinc-50", sortable && "cursor-pointer select-none hover:text-zinc-700")}
                onClick={sortable ? () => toggleSort(j) : undefined}>
                <span className="inline-flex items-center gap-1">{c.label}{sortable && (sort?.col === j ? (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{sliceIdx.map((idx) => {
          const r = result.rows[idx]
          return (
          <tr key={idx} onClick={drillable ? () => onDrill!(result.rowKeys![idx], null, String(r[0] ?? "Records")) : undefined}
            className={cn("border-b border-zinc-100", drillable ? "cursor-pointer hover:bg-blue-50" : "hover:bg-zinc-50")}>
            {r.map((v, j) => {
              const col = result.columns[j]
              const href = col?.key === "__id" ? result.rowLinks?.[idx] : null
              // Format by the COLUMN's declared type, not the value's JS type — the JSON value bag isn't
              // type-enforced, so a number column can hold both 8504 and "8504". formatNumber coerces, so
              // every cell in a number column renders consistently (currency / raw id / grouped), matching
              // the record detail. Summarized cells use the measure's value format.
              const cell = v == null
                ? <span className="text-zinc-300">—</span>
                : result.rowKeys
                  ? (typeof v === "number" ? fmtNum(v, result.valueFormat) : v)
                  : col?.type === "number"
                    ? formatNumber(v as any, col?.numberFormat as any)
                    : v
              return <td key={j} className={cn("px-3 py-2 text-zinc-700", frozenCls(j))}>{href ? <Link href={href} onClick={(e) => e.stopPropagation()} className="text-blue-600 hover:underline">{cell}</Link> : cell}</td>
            })}
          </tr>
        )})}</tbody>
      </table>
      {showControls && (
        <PagerControls total={orderIdx.length} page={p} pageCount={pageCount} pageSize={pageSize} start={start} shown={sliceIdx.length}
          onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(0) }} />
      )}
      {result.capped && <p className="mt-2 text-xs text-amber-600">Showing the first {result.total.toLocaleString()} records.</p>}
    </div>
  )
}

export function PivotTable({ pivot, onDrill, valueFormat }: { pivot: NonNullable<ReportResult["pivot"]>; onDrill?: DrillFn; valueFormat?: ValueFormat }) {
  const nCols = pivot.colLabels.length
  const rowTotals = pivot.cells.map((row) => row.reduce((a: number, v) => a + (v ?? 0), 0))
  const colTotals = pivot.colLabels.map((_, j) => pivot.cells.reduce((a: number, row) => a + (row[j] ?? 0), 0))
  const grand = colTotals.reduce((a: number, v) => a + v, 0)
  const f = (v: number) => fmtNum(v, valueFormat)

  // Sort col: -1 = row label, 0..nCols-1 = data column, nCols = Total. Totals stay pinned.
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const orderIdx = useMemo(() => {
    const idxs = pivot.rowLabels.map((_, i) => i)
    if (!sort) return idxs
    const { col, dir } = sort
    const rowTotal = (i: number): number => pivot.cells[i].reduce((a: number, v) => a + (v ?? 0), 0)
    return idxs.sort((a, b) => {
      if (col === -1) return String(pivot.rowLabels[a]).localeCompare(String(pivot.rowLabels[b])) * dir
      const av: number = col === nCols ? rowTotal(a) : (pivot.cells[a][col] ?? 0)
      const bv: number = col === nCols ? rowTotal(b) : (pivot.cells[b][col] ?? 0)
      return (av - bv) * dir
    })
  }, [pivot, sort, nCols])

  const showControls = orderIdx.length > 10
  const pageCount = showControls ? Math.max(1, Math.ceil(orderIdx.length / pageSize)) : 1
  const p = Math.min(page, pageCount - 1)
  const start = showControls ? p * pageSize : 0
  const sliceIdx = showControls ? orderIdx.slice(start, start + pageSize) : orderIdx
  const toggleSort = (col: number) => setSort((s) => (s && s.col === col ? { col, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : { col, dir: 1 }))
  const SortIcon = ({ col }: { col: number }) => sort?.col === col ? (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
            <th className="cursor-pointer select-none px-3 py-2 font-semibold hover:text-zinc-700" onClick={() => toggleSort(-1)}><span className="inline-flex items-center gap-1"><SortIcon col={-1} /></span></th>
            {pivot.colLabels.map((c, j) => <th key={j} className="cursor-pointer select-none px-3 py-2 text-right font-semibold hover:text-zinc-700" onClick={() => toggleSort(j)}><span className="inline-flex items-center justify-end gap-1">{c}<SortIcon col={j} /></span></th>)}
            {nCols > 1 && <th className="cursor-pointer select-none px-3 py-2 text-right font-semibold hover:text-zinc-700" onClick={() => toggleSort(nCols)}><span className="inline-flex items-center justify-end gap-1">Total<SortIcon col={nCols} /></span></th>}
          </tr>
        </thead>
        <tbody>
          {sliceIdx.map((i) => {
            const rl = pivot.rowLabels[i]
            return (
            <tr key={i} className="border-b border-zinc-100 hover:bg-zinc-50">
              <td className="px-3 py-2 font-medium text-zinc-700">{rl}</td>
              {pivot.cells[i].map((v, j) => (
                <td key={j} onClick={onDrill && (v ?? 0) > 0 ? () => onDrill(pivot.rowKeys[i], pivot.colKeys[j], `${rl} · ${pivot.colLabels[j]}`) : undefined}
                  className={cn("px-3 py-2 text-right text-zinc-700", onDrill && (v ?? 0) > 0 && "cursor-pointer hover:bg-blue-50")}>{f(v ?? 0)}</td>
              ))}
              {nCols > 1 && <td className="px-3 py-2 text-right font-semibold text-zinc-900">{f(rowTotals[i])}</td>}
            </tr>
          )})}
          <tr className="border-t-2 border-zinc-200 font-semibold text-zinc-900">
            <td className="px-3 py-2">Total</td>
            {colTotals.map((v, j) => <td key={j} className="px-3 py-2 text-right">{f(v)}</td>)}
            {nCols > 1 && <td className="px-3 py-2 text-right">{f(grand)}</td>}
          </tr>
        </tbody>
      </table>
      {showControls && (
        <PagerControls total={orderIdx.length} page={p} pageCount={pageCount} pageSize={pageSize} start={start} shown={sliceIdx.length}
          onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(0) }} />
      )}
    </div>
  )
}

// Simple SVG chart for bar/line/area/pie off the engine's series.
export function Chart({ result, style, onDrill }: { result: ReportResult; style: ReportStyle; onDrill?: DrillFn }) {
  const series = result.series ?? []
  const vf = result.valueFormat
  const palette = PALETTES[style.palette ?? "default"] ?? PALETTE
  const showLegend = style.legend !== false
  const legendPos = style.legendPos ?? "top"
  const showGrid = style.gridlines !== false
  const showAxis = style.axisTitles !== false
  const labels = series[0]?.points.map((p) => p.label) ?? []
  const keys = series[0]?.points.map((p) => p.key) ?? []
  const stacked = result.stacked || !!style.stacked
  const labelClick = (i: number) => onDrill && keys[i] != null ? () => onDrill(keys[i], null, labels[i]) : undefined
  const dataMax = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.value)))
  const stackDataMax = Math.max(1, ...labels.map((_, i) => series.reduce((a, s) => a + (s.points[i]?.value ?? 0), 0)))
  const yMax = style.yMax && style.yMax > 0 ? style.yMax : null
  const max = yMax ?? dataMax
  const stackMax = yMax ?? stackDataMax
  const W = 640, H = 280, padL = 64, padB = 68, padT = 10, cW = W - padL - 10, cH = H - padT - padB
  const xTitle = result.axis?.x, yTitle = result.axis?.y

  // Hover tooltip (dark box near the cursor with category + each series value).
  const wrapRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ x: number; y: number; title: string; rows: { name: string; value: number; color: string }[] } | null>(null)
  const moveTip = (e: React.MouseEvent, title: string, tRows: { name: string; value: number; color: string }[]) => {
    const r = wrapRef.current?.getBoundingClientRect(); if (!r) return
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, title, rows: tRows })
  }
  const clearTip = () => setTip(null)
  const TipEl = tip ? (
    <div className="pointer-events-none absolute z-20 min-w-[120px] rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs text-white shadow-lg"
      style={{ left: Math.min(tip.x + 12, (wrapRef.current?.clientWidth ?? 400) - 150), top: Math.max(0, tip.y - 8) }}>
      <p className="mb-0.5 font-semibold">{tip.title}</p>
      {tip.rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: r.color }} /><span className="text-zinc-300">{r.name}</span><span className="ml-auto pl-3 font-medium">{fmtNum(r.value, vf)}</span></div>
      ))}
    </div>
  ) : null

  if (result.viz === "pie" || result.viz === "donut") {
    const pts = (series[0]?.points ?? [])
    const totalV = Math.max(1, pts.reduce((a, p) => a + p.value, 0))
    let a0 = -Math.PI / 2
    const cx = 130, cy = 130, r = 110, ri = result.viz === "donut" ? 55 : 0
    return (
      <div ref={wrapRef} className="relative flex flex-wrap items-center gap-6" onMouseLeave={clearTip}>
        {TipEl}
        <svg viewBox="0 0 260 260" className="h-56 w-56">
          {pts.map((p, i) => {
            const a1 = a0 + (p.value / totalV) * Math.PI * 2
            const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
            const large = a1 - a0 > Math.PI ? 1 : 0
            const d = ri > 0
              ? `M ${cx + ri * Math.cos(a0)} ${cy + ri * Math.sin(a0)} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${cx + ri * Math.cos(a1)} ${cy + ri * Math.sin(a1)} A ${ri} ${ri} 0 ${large} 0 ${cx + ri * Math.cos(a0)} ${cy + ri * Math.sin(a0)} Z`
              : `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`
            a0 = a1
            return <path key={i} d={d} fill={palette[i % palette.length]} onClick={onDrill ? () => onDrill(p.key, null, p.label) : undefined} onMouseMove={(e) => moveTip(e, p.label, [{ name: series[0]?.name ?? "", value: p.value, color: palette[i % palette.length] }])} className={onDrill ? "cursor-pointer" : undefined} />
          })}
        </svg>
        {showLegend && <div className="space-y-1 text-sm">{pts.map((p, i) => <div key={i} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: palette[i % palette.length] }} />{p.label}<span className="text-zinc-400">{fmtNum(p.value, vf)}</span></div>)}</div>}
      </div>
    )
  }

  const n = labels.length || 1

  // Horizontal bar — category rows top-to-bottom, bars growing left→right.
  if (result.viz === "hbar") {
    const rowH = 26, gap = 8, chartW = 560, labelW = 130
    return (
      <div ref={wrapRef} className="relative" onMouseLeave={clearTip}>
        {TipEl}
        {showAxis && (result.axis?.x || result.axis?.y) && (
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-zinc-500">
            <span>{result.axis?.x}</span>
            <span>{result.axis?.y}</span>
          </div>
        )}
        {showLegend && series.length > 1 && <div className="mb-2 flex flex-wrap gap-3 text-xs">{series.map((s, i) => <span key={i} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: palette[i % palette.length] }} />{s.name}</span>)}</div>}
        <svg viewBox={`0 0 ${labelW + chartW + 50} ${(rowH + gap) * n + 10}`} className="w-full">
          {labels.map((l, i) => {
            const y = i * (rowH + gap) + 5
            const sh = rowH / series.length
            return (
              <g key={i} onClick={labelClick(i)} onMouseMove={(e) => moveTip(e, l, series.map((s, si) => ({ name: s.name, value: s.points[i]?.value ?? 0, color: palette[si % palette.length] })))} className={onDrill ? "cursor-pointer" : undefined}>
                <rect x={0} y={y} width={labelW + chartW + 50} height={rowH} fill="transparent" />
                <text x={labelW - 8} y={y + rowH / 2} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="#555">{l.length > 18 ? l.slice(0, 17) + "…" : l}</text>
                {series.map((s, si) => {
                  const v = s.points[i]?.value ?? 0
                  const w = (v / max) * chartW
                  return <g key={si}><rect x={labelW} y={y + sh * si} width={Math.max(0, w)} height={Math.max(1, sh - 2)} fill={palette[si % palette.length]} rx={2} /><text x={labelW + w + 4} y={y + sh * si + sh / 2} dominantBaseline="middle" fontSize={10} fill="#888">{fmtNum(v, vf)}</text></g>
                })}
              </g>
            )
          })}
        </svg>
      </div>
    )
  }

  // Per-series chart type + axis (combo / dual-axis). Falls back to the viz default.
  const baseType: "bar" | "line" = (result.viz === "line" || result.viz === "area") ? "line" : "bar"
  const typeOf = (s: typeof series[number]) => s.chartType ?? baseType
  const axisOf = (s: typeof series[number]) => s.axis ?? "left"
  const barSeries = series.filter((s) => typeOf(s) === "bar")
  const rightUsed = series.some((s) => axisOf(s) === "right")
  const padRight = rightUsed ? 48 : 10
  const cWc = W - padL - padRight
  const bw = cWc / n
  const canStack = stacked && series.every((s) => typeOf(s) === "bar") && !rightUsed
  const leftVals = series.filter((s) => axisOf(s) === "left").flatMap((s) => s.points.map((p) => p.value))
  const rightVals = series.filter((s) => axisOf(s) === "right").flatMap((s) => s.points.map((p) => p.value))
  const leftMax = yMax ?? (canStack ? Math.max(1, ...labels.map((_, i) => series.reduce((a, s) => a + (s.points[i]?.value ?? 0), 0))) : Math.max(1, ...leftVals, 1))
  const rightMax = Math.max(1, ...rightVals, 1)
  const axisMax = (s: typeof series[number]) => (axisOf(s) === "right" ? rightMax : leftMax)
  const groupW = bw / Math.max(1, barSeries.length)
  const legendEl = showLegend && series.length > 1 ? (
    <div className={cn("flex gap-x-3 gap-y-1 text-xs", legendPos === "right" ? "flex-col" : "flex-wrap")}>
      {series.map((s, i) => <span key={i} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: palette[i % palette.length] }} />{s.name}{s.axis === "right" ? " (R)" : ""}</span>)}
    </div>
  ) : null
  const chartSvg = (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {showGrid && [0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={padL} x2={padL + cWc} y1={padT + cH - t * cH} y2={padT + cH - t * cH} stroke="#eee" />
          <text x={padL - 6} y={padT + cH - t * cH} textAnchor="end" dominantBaseline="middle" fontSize={9} fill="#aaa">{fmtNum(leftMax * t, vf)}</text>
          {rightUsed && <text x={padL + cWc + 6} y={padT + cH - t * cH} textAnchor="start" dominantBaseline="middle" fontSize={9} fill="#aaa">{fmtNum(rightMax * t, vf)}</text>}
        </g>
      ))}
      {showAxis && yTitle && <text x={12} y={padT + cH / 2} transform={`rotate(-90 12 ${padT + cH / 2})`} textAnchor="middle" fontSize={11} fontWeight={600} fill="#666">{yTitle}</text>}
      {showAxis && xTitle && <text x={padL + cWc / 2} y={H - 4} textAnchor="middle" fontSize={11} fontWeight={600} fill="#666">{xTitle}</text>}
      {canStack ? (
        labels.map((_, i) => {
          let running = 0
          const total = series.reduce((a, s) => a + (s.points[i]?.value ?? 0), 0)
          return (
            <g key={i}>
              {series.map((s, si) => {
                const v = s.points[i]?.value ?? 0
                const h = (v / leftMax) * cH
                const y = padT + cH - running - h
                running += h
                return <rect key={si} x={padL + bw * i + bw * 0.15} y={y} width={bw * 0.7} height={Math.max(0, h)} fill={palette[si % palette.length]} />
              })}
              {style.dataLabels && total > 0 && <text x={padL + bw * i + bw / 2} y={padT + cH - (total / leftMax) * cH - 3} textAnchor="middle" fontSize={9} fill="#666">{fmtNum(total, vf)}</text>}
            </g>
          )
        })
      ) : (
        series.map((s, si) => {
          const color = palette[si % palette.length]
          const aMax = axisMax(s)
          if (typeOf(s) === "line") {
            const pts = s.points.map((p, i) => `${padL + bw * i + bw / 2},${padT + cH - (p.value / aMax) * cH}`).join(" ")
            return (
              <g key={si}>
                {result.viz === "area" && !s.chartType && <polygon points={`${padL + bw / 2},${padT + cH} ${pts} ${padL + bw * (n - 1) + bw / 2},${padT + cH}`} fill={color + "33"} />}
                <polyline points={pts} fill="none" stroke={color} strokeWidth={2} />
                {s.points.map((p, i) => <circle key={i} cx={padL + bw * i + bw / 2} cy={padT + cH - (p.value / aMax) * cH} r={2.5} fill={color} />)}
              </g>
            )
          }
          const bi = barSeries.indexOf(s)
          return (
            <g key={si}>
              {labels.map((_, i) => {
                const v = s.points[i]?.value ?? 0
                const bh = (v / aMax) * cH
                return (
                  <g key={i}>
                    <rect x={padL + bw * i + groupW * bi + 2} y={padT + cH - bh} width={Math.max(1, groupW - 4)} height={Math.max(0, bh)} fill={color} rx={2} />
                    {style.dataLabels && v > 0 && <text x={padL + bw * i + groupW * bi + groupW / 2} y={padT + cH - bh - 3} textAnchor="middle" fontSize={9} fill="#666">{fmtNum(v, vf)}</text>}
                  </g>
                )
              })}
            </g>
          )
        })
      )}
      {labels.map((l, i) => <text key={i} x={padL + bw * i + bw / 2} y={H - padB + 16} textAnchor="middle" fontSize={10} fill="#888">{l.length > 10 ? l.slice(0, 9) + "…" : l}</text>)}
      {/* Hover/drill hit areas — rendered LAST so they sit on top of the bars and
          reliably capture the mouse over each full column (fixes sticky tooltips). */}
      {labels.map((_, i) => (
        <rect key={`hit${i}`} x={padL + bw * i} y={padT} width={bw} height={cH} fill="transparent"
          onMouseMove={(e) => moveTip(e, labels[i], series.map((s, si) => ({ name: s.name, value: s.points[i]?.value ?? 0, color: palette[si % palette.length] })))}
          onClick={labelClick(i)} className={onDrill ? "cursor-pointer" : undefined} />
      ))}
    </svg>
  )
  return (
    <div ref={wrapRef} className={cn("relative", legendPos === "right" && "flex items-start gap-4")} onMouseLeave={clearTip}>
      {TipEl}
      {legendEl && legendPos === "top" && <div className="mb-2">{legendEl}</div>}
      <div className="min-w-0 flex-1">{chartSvg}</div>
      {legendEl && legendPos === "right" && <div className="shrink-0 pt-2">{legendEl}</div>}
      {legendEl && legendPos === "bottom" && <div className="mt-2">{legendEl}</div>}
    </div>
  )
}
