"use client"

import { useState, useRef } from "react"
import { Hash, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
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
type ValueFormat = { format: "number" | "currency" | "percent"; decimals?: number }

// Render a measure value per its format (currency/percent/decimals).
export function fmtNum(v: number, vf?: ValueFormat): string {
  if (!vf) return v.toLocaleString()
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

export function DataTable({ result, onDrill, pageSize }: { result: ReportResult; onDrill?: DrillFn; pageSize?: number }) {
  // Summarized tables (one row per dimension group) carry rowKeys → rows drill in.
  const drillable = !!(onDrill && result.rowKeys && result.rowKeys.length === result.rows.length)
  const [page, setPage] = useState(0)
  const paged = !!pageSize && result.rows.length > pageSize
  const pageCount = paged ? Math.ceil(result.rows.length / pageSize!) : 1
  const p = Math.min(page, pageCount - 1)
  const start = paged ? p * pageSize! : 0
  const slice = paged ? result.rows.slice(start, start + pageSize!) : result.rows
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">{result.columns.map((c) => <th key={c.key} className="px-3 py-2 font-semibold">{c.label}</th>)}</tr></thead>
        <tbody>{slice.map((r, i) => {
          const idx = start + i
          return (
          <tr key={idx} onClick={drillable ? () => onDrill!(result.rowKeys![idx], null, String(r[0] ?? "Records")) : undefined}
            className={cn("border-b border-zinc-100", drillable ? "cursor-pointer hover:bg-blue-50" : "hover:bg-zinc-50")}>
            {r.map((v, j) => <td key={j} className="px-3 py-2 text-zinc-700">{v == null ? <span className="text-zinc-300">—</span> : typeof v === "number" ? (result.rowKeys ? fmtNum(v, result.valueFormat) : v.toLocaleString()) : v}</td>)}
          </tr>
        )})}</tbody>
      </table>
      {paged && (
        <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
          <span>{(start + 1).toLocaleString()}–{(start + slice.length).toLocaleString()} of {result.rows.length.toLocaleString()}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(Math.max(0, p - 1))} disabled={p === 0} className="inline-flex items-center gap-0.5 rounded-md border border-zinc-200 px-2 py-1 disabled:opacity-40 hover:border-zinc-400"><ChevronLeft className="h-3.5 w-3.5" /> Prev</button>
            <span className="px-1">{p + 1} / {pageCount}</span>
            <button onClick={() => setPage(Math.min(pageCount - 1, p + 1))} disabled={p >= pageCount - 1} className="inline-flex items-center gap-0.5 rounded-md border border-zinc-200 px-2 py-1 disabled:opacity-40 hover:border-zinc-400">Next <ChevronRight className="h-3.5 w-3.5" /></button>
          </div>
        </div>
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
                  className={cn("px-3 py-2 text-right text-zinc-700", onDrill && (v ?? 0) > 0 && "cursor-pointer hover:bg-blue-50")}>{f(v ?? 0)}</td>
              ))}
              {nCols > 1 && <td className="px-3 py-2 text-right font-semibold text-zinc-900">{f(rowTotals[i])}</td>}
            </tr>
          ))}
          <tr className="border-t-2 border-zinc-200 font-semibold text-zinc-900">
            <td className="px-3 py-2">Total</td>
            {colTotals.map((v, j) => <td key={j} className="px-3 py-2 text-right">{f(v)}</td>)}
            {nCols > 1 && <td className="px-3 py-2 text-right">{f(grand)}</td>}
          </tr>
        </tbody>
      </table>
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

  const bw = cW / n
  const legendEl = showLegend && series.length > 1 ? (
    <div className={cn("flex gap-x-3 gap-y-1 text-xs", legendPos === "right" ? "flex-col" : "flex-wrap")}>
      {series.map((s, i) => <span key={i} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: palette[i % palette.length] }} />{s.name}</span>)}
    </div>
  ) : null
  const chartSvg = (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {showGrid && [0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - 10} y1={padT + cH - t * cH} y2={padT + cH - t * cH} stroke="#eee" />
          <text x={padL - 6} y={padT + cH - t * cH} textAnchor="end" dominantBaseline="middle" fontSize={9} fill="#aaa">{fmtNum(max * t, vf)}</text>
        </g>
      ))}
      {showAxis && yTitle && <text x={12} y={padT + cH / 2} transform={`rotate(-90 12 ${padT + cH / 2})`} textAnchor="middle" fontSize={11} fontWeight={600} fill="#666">{yTitle}</text>}
      {showAxis && xTitle && <text x={padL + cW / 2} y={H - 4} textAnchor="middle" fontSize={11} fontWeight={600} fill="#666">{xTitle}</text>}
      {labels.map((_, i) => (
        <rect key={`hit${i}`} x={padL + bw * i} y={padT} width={bw} height={cH} fill="transparent"
          onMouseMove={(e) => moveTip(e, labels[i], series.map((s, si) => ({ name: s.name, value: s.points[i]?.value ?? 0, color: palette[si % palette.length] })))}
          onClick={labelClick(i)} className={onDrill ? "cursor-pointer" : undefined} />
      ))}
        {result.viz === "line" || result.viz === "area" ? (
          series.map((s, si) => {
            const pts = s.points.map((p, i) => `${padL + bw * i + bw / 2},${padT + cH - (p.value / max) * cH}`).join(" ")
            return <g key={si}>{result.viz === "area" && <polygon points={`${padL + bw / 2},${padT + cH} ${pts} ${padL + bw * (n - 1) + bw / 2},${padT + cH}`} fill={palette[si % palette.length] + "33"} />}<polyline points={pts} fill="none" stroke={palette[si % palette.length]} strokeWidth={2} /></g>
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
                  return <rect key={si} x={padL + bw * i + bw * 0.15} y={y} width={bw * 0.7} height={Math.max(0, h)} fill={palette[si % palette.length]} />
                })}
                {style.dataLabels && total > 0 && <text x={padL + bw * i + bw / 2} y={padT + cH - (total / stackMax) * cH - 3} textAnchor="middle" fontSize={9} fill="#666">{fmtNum(total, vf)}</text>}
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
                    <rect x={padL + bw * i + groupW * si + 2} y={padT + cH - bh} width={Math.max(1, groupW - 4)} height={bh} fill={palette[si % palette.length]} rx={2} />
                    {style.dataLabels && v > 0 && <text x={padL + bw * i + groupW * si + groupW / 2} y={padT + cH - bh - 3} textAnchor="middle" fontSize={9} fill="#666">{fmtNum(v, vf)}</text>}
                  </g>
                )
              })}
            </g>
          ))
        )}
      {labels.map((l, i) => <text key={i} x={padL + bw * i + bw / 2} y={H - padB + 16} textAnchor="middle" fontSize={10} fill="#888">{l.length > 10 ? l.slice(0, 9) + "…" : l}</text>)}
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
