// Report query engine: turns a ReportConfig into a ReportResult. Prisma isn't a
// generic query engine, so we fetch the primary object's rows (filtered) and
// aggregate in memory. Cross-object joins and pivot are layered on in later phases.
import { prisma } from "@/lib/prisma"
import { delegateFor } from "@/lib/automation-records"
import { filterStateToWhere } from "@/lib/filter-to-prisma"
import type { FilterField } from "@/lib/filters"
import { reportFieldsFor, joinedFieldsForSource, REPORT_OBJECTS } from "./objects"
import type {
  ReportConfig, ReportResult, ReportField, Measure, Dimension, ResultColumn, Series,
} from "./types"

const ROW_CAP = 10000

// Resolve a date-range preset (or custom from/to) to a [start, end] window.
function resolveWindow(dr: NonNullable<ReportConfig["dateRange"]>): { start: Date; end: Date } | null {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  const end = now
  if (dr.preset === "all") return null
  if (dr.preset === "custom") {
    if (!dr.from || !dr.to) return null
    return { start: new Date(dr.from), end: new Date(dr.to + "T23:59:59") }
  }
  const days = (n: number) => new Date(now.getTime() - n * 864e5)
  switch (dr.preset) {
    case "last_7": return { start: days(7), end }
    case "last_30": return { start: days(30), end }
    case "last_90": return { start: days(90), end }
    case "this_month": return { start: new Date(y, m, 1), end }
    case "last_month": return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0, 23, 59, 59) }
    case "this_quarter": return { start: new Date(y, Math.floor(m / 3) * 3, 1), end }
    case "this_year": case "ytd": return { start: new Date(y, 0, 1), end }
  }
  return null
}

// The equal-length period immediately before a window (for comparison).
function previousWindow(w: { start: Date; end: Date }): { start: Date; end: Date } {
  const span = w.end.getTime() - w.start.getTime()
  return { start: new Date(w.start.getTime() - span), end: new Date(w.start.getTime() - 1) }
}

// Map the report field list to FilterField[] so filterStateToWhere can build a where.
// Joined fields (joinPath set) carry relationPath so the filter nests under the relation.
function toFilterFields(fields: ReportField[]): FilterField[] {
  return fields.map((f) => ({
    key: f.key, label: f.label, type: f.type, column: f.column, jsonBag: f.jsonBag,
    options: f.options, relationPath: f.joinPath, getValue: () => null,
  }))
}

function readValue(row: any, field: ReportField): unknown {
  const base = field.joinPath ? row?.[field.joinPath] : row
  if (base == null) return null
  if (field.jsonBag) return base?.[field.jsonBag]?.[field.column]
  return base?.[field.column]
}

function toDate(v: unknown): Date | null {
  if (!v) return null
  const d = new Date(v as any)
  return isNaN(d.getTime()) ? null : d
}

// A group key + display label for a dimension value (with date bucketing).
function dimKeyLabel(row: any, dim: Dimension, field: ReportField): { key: string; label: string } {
  const raw = readValue(row, field)
  if (field.type === "date" || dim.dateFrequency) {
    const d = toDate(raw)
    if (!d) return { key: "∅", label: "(No value)" }
    const y = d.getUTCFullYear(), m = d.getUTCMonth()
    const freq = dim.dateFrequency ?? "day"
    if (freq === "year") return { key: `${y}`, label: `${y}` }
    if (freq === "quarter") { const q = Math.floor(m / 3) + 1; return { key: `${y}-Q${q}`, label: `Q${q} ${y}` } }
    if (freq === "month") return { key: `${y}-${String(m + 1).padStart(2, "0")}`, label: d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) }
    if (freq === "week") { const day = d.getUTCDate(); const wk = Math.ceil(day / 7); return { key: `${y}-${m}-w${wk}`, label: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) } }
    const key = d.toISOString().slice(0, 10)
    return { key, label: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) }
  }
  if (raw == null || raw === "") return { key: "∅", label: "(No value)" }
  if (Array.isArray(raw)) { const s = raw.filter(Boolean).join(", "); return { key: s || "∅", label: s || "(No value)" } }
  const s = String(raw)
  const label = field.options?.find((o) => o.value === s)?.label ?? s
  return { key: s, label }
}

function aggregate(rows: any[], measure: Measure, field: ReportField | null): number {
  if (measure.agg === "count") return rows.length
  if (!field) return rows.length
  const vals = rows.map((r) => readValue(r, field)).filter((v) => v != null && v !== "")
  if (measure.agg === "distinct_count") return new Set(vals.map((v) => String(v))).size
  const nums = vals.map((v) => Number(v)).filter((n) => !Number.isNaN(n))
  if (nums.length === 0) return 0
  if (measure.agg === "sum") return nums.reduce((a, b) => a + b, 0)
  if (measure.agg === "avg") return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100
  if (measure.agg === "min") return Math.min(...nums)
  if (measure.agg === "max") return Math.max(...nums)
  return 0
}

function formatCell(v: unknown, f: ReportField): string | number | null {
  if (v == null) return null
  if (f.type === "date") { const d = toDate(v); return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : String(v) }
  if (Array.isArray(v)) return v.join(", ")
  return typeof v === "number" ? v : String(v)
}

// Load the primary object's rows (filtered + joined) — shared by runReport + drill.
// `window` overrides the configured date range (used for the comparison pass).
async function loadReportRows(config: ReportConfig, window?: { start: Date; end: Date }): Promise<{ rows: any[]; fields: ReportField[]; byKey: Record<string, ReportField>; total: number; capped: boolean }> {
  const primary = config.primary
  const fields = await reportFieldsFor(primary)
  const joined = (await Promise.all((config.sources ?? []).map((s) => joinedFieldsForSource(primary, s.joinPath)))).flat()
  const allFields = [...fields, ...joined]
  const byKey = Object.fromEntries(allFields.map((f) => [f.key, f]))
  const model = delegateFor(primary)
  if (!model) return { rows: [], fields, byKey, total: 0, capped: false }
  // Filters translate on primary scalar fields + joined single-FK fields (nested
  // via relationPath). m2m/relation traversal beyond that isn't supported.
  const advanced = filterStateToWhere(config.filters ?? null, toFilterFields(allFields))
  const clauses: Record<string, unknown>[] = [advanced]
  // Date-range window on the chosen (primary) date field.
  const dr = config.dateRange
  if (dr?.field) {
    const df = byKey[dr.field]
    const win = window ?? resolveWindow(dr)
    if (df && !df.joinPath && win) clauses.push({ [df.column]: { gte: win.start, lte: win.end } })
  }
  let where: Record<string, unknown> = clauses.length > 1 ? { AND: clauses } : advanced
  if (primary.startsWith("CO:")) {
    const def = await (prisma as any).customObjectDef.findUnique({ where: { key: primary.slice(3) }, select: { id: true } }).catch(() => null)
    where = def ? { AND: [{ objectDefId: def.id }, ...clauses] } : where
  }
  const include = Object.fromEntries((config.sources ?? []).map((s) => [s.joinPath, true]))
  const rows: any[] = await model.findMany({ where, ...(Object.keys(include).length ? { include } : {}), take: ROW_CAP }).catch(() => [])
  return { rows, fields, byKey, total: rows.length, capped: rows.length >= ROW_CAP }
}

// The underlying primary records behind a chart bar / summarized row / pivot cell.
export async function drillReport(config: ReportConfig, dimKey: string, breakdownKey?: string | null): Promise<ReportResult> {
  const { rows, fields, byKey } = await loadReportRows(config)
  const dim = config.dimensions[0] ? { d: config.dimensions[0], f: byKey[config.dimensions[0].key] } : null
  const bd = config.breakdown ? byKey[config.breakdown.key] : null
  const matched = rows.filter((r) => {
    if (dim && dim.f && dimKeyLabel(r, dim.d, dim.f).key !== dimKey) return false
    if (breakdownKey != null && bd && config.breakdown && dimKeyLabel(r, config.breakdown, bd).key !== breakdownKey) return false
    return true
  })
  const cols = (config.columns.length ? config.columns.map((c) => byKey[c.key]).filter(Boolean) : fields.slice(0, 6)) as ReportField[]
  const columns: ResultColumn[] = cols.map((f) => ({ key: f.key, label: f.label, type: f.type }))
  const out = matched.slice(0, 1000).map((r) => cols.map((f) => formatCell(readValue(r, f), f)))
  return { viz: "table", columns, rows: out, total: matched.length, capped: matched.length > 1000 }
}

// Flat, unsummarized rows for CSV export (chosen columns, or all primary fields).
export async function exportReportRows(config: ReportConfig): Promise<{ headers: string[]; rows: (string | number | null)[][] }> {
  const { rows, fields, byKey } = await loadReportRows(config)
  const cols = (config.columns.length ? config.columns.map((c) => byKey[c.key]).filter(Boolean) : fields) as ReportField[]
  const headers = cols.map((f) => f.label)
  const out = rows.map((r) => cols.map((f) => formatCell(readValue(r, f), f)))
  return { headers, rows: out }
}

export async function runReport(config: ReportConfig): Promise<ReportResult> {
  const primary = config.primary
  const { rows, fields, byKey, total, capped } = await loadReportRows(config)
  if (!delegateFor(primary)) return { viz: config.viz, columns: [], rows: [], total: 0 }

  const measures = config.measures.length ? config.measures : [{ source: primary, key: "*", agg: "count" as const }]
  const measureField = (m: Measure) => (m.key === "*" ? null : byKey[m.key] ?? null)
  const measureLabel = (m: Measure) => m.label ?? (m.key === "*" ? "Count" : `${m.agg} ${byKey[m.key]?.label ?? m.key}`)
  const valueFormat = measures[0]?.format ? { format: measures[0].format!, decimals: measures[0].decimals } : undefined

  // Comparison vs the previous period (overall primary-measure total).
  let comparison: { prev: number; delta: number | null } | undefined
  if (config.compare && config.dateRange?.field) {
    const win = resolveWindow(config.dateRange)
    if (win) {
      const prev = await loadReportRows(config, previousWindow(win))
      const prevTotal = aggregate(prev.rows, measures[0], measures[0].key === "*" ? null : prev.byKey[measures[0].key] ?? null)
      const curTotal = aggregate(rows, measures[0], measureField(measures[0]))
      comparison = { prev: prevTotal, delta: prevTotal === 0 ? null : Math.round(((curTotal - prevTotal) / prevTotal) * 1000) / 10 }
    }
  }

  // KPI — a single measure, no dimension.
  if (config.viz === "kpi") {
    return { viz: "kpi", columns: [], rows: [], kpi: aggregate(rows, measures[0], measureField(measures[0])), total, capped, valueFormat, comparison }
  }

  const dims = config.dimensions.map((d) => ({ d, f: byKey[d.key] })).filter((x) => x.f)

  // Unsummarized table: raw rows for the chosen columns (or a sensible default).
  if (config.viz === "table" && (dims.length === 0 || config.tableMode === "unsummarized")) {
    const cols = (config.columns.length ? config.columns.map((c) => byKey[c.key]).filter(Boolean) : fields.slice(0, 6)) as ReportField[]
    const columns: ResultColumn[] = cols.map((f) => ({ key: f.key, label: f.label, type: f.type }))
    const out = rows.slice(0, 500).map((r) => cols.map((f) => {
      const v = readValue(r, f)
      if (v == null) return null
      if (f.type === "date") { const d = toDate(v); return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : String(v) }
      if (Array.isArray(v)) return v.join(", ")
      return typeof v === "number" ? v : String(v)
    }))
    return { viz: "table", columns, rows: out, total, capped }
  }

  // Grouped: one primary dimension (first), optional breakdown → series/rows.
  const dim = dims[0]
  const breakdownField = config.breakdown ? byKey[config.breakdown.key] : null

  // Bucket rows by the primary dimension (a single "All" group when none is set).
  const groups = new Map<string, { label: string; rows: any[] }>()
  const order: string[] = []
  for (const r of rows) {
    const { key, label } = dim ? dimKeyLabel(r, dim.d, dim.f) : { key: "all", label: "All" }
    if (!groups.has(key)) { groups.set(key, { label, rows: [] }); order.push(key) }
    groups.get(key)!.rows.push(r)
  }

  // Pivot: rows = primary dimension, columns = breakdown (or a single value column).
  if (config.viz === "pivot") {
    const m0 = measures[0], mf0 = measureField(m0)
    let colKeys: string[] = ["__v"], colLabels: string[] = [measureLabel(m0)]
    if (breakdownField && config.breakdown) {
      const bd = new Map<string, string>()
      for (const r of rows) { const { key, label } = dimKeyLabel(r, config.breakdown, breakdownField); if (!bd.has(key)) bd.set(key, label) }
      colKeys = Array.from(bd.keys()); colLabels = Array.from(bd.values())
    }
    const cells = order.map((gk) => colKeys.map((ck) => {
      const gr = groups.get(gk)!.rows
      const sub = ck === "__v" ? gr : gr.filter((r) => dimKeyLabel(r, config.breakdown!, breakdownField!).key === ck)
      return aggregate(sub, m0, mf0)
    }))
    return {
      viz: "pivot", columns: [], rows: [], total, capped, valueFormat, comparison,
      pivot: { rowLabels: order.map((k) => groups.get(k)!.label), colLabels, cells, rowKeys: order, colKeys },
    }
  }

  // Breakdown series (or a single series over the first measure).
  const series: Series[] = []
  if (breakdownField && config.breakdown) {
    const bdValues = new Map<string, string>() // key -> label
    for (const r of rows) { const { key, label } = dimKeyLabel(r, config.breakdown, breakdownField); if (!bdValues.has(key)) bdValues.set(key, label) }
    for (const [bk, bl] of Array.from(bdValues)) {
      series.push({
        name: bl,
        points: order.map((gk) => {
          const g = groups.get(gk)!
          const sub = g.rows.filter((r) => dimKeyLabel(r, config.breakdown!, breakdownField).key === bk)
          return { key: gk, label: g.label, value: aggregate(sub, measures[0], measureField(measures[0])) }
        }),
      })
    }
  } else {
    for (const m of measures) {
      series.push({ name: measureLabel(m), points: order.map((gk) => ({ key: gk, label: groups.get(gk)!.label, value: aggregate(groups.get(gk)!.rows, m, measureField(m)) })) })
    }
  }

  // Sort groups (by first series value or by label).
  if (config.sort) {
    const by = config.sort.by, dir = config.sort.dir === "asc" ? 1 : -1
    const primarySeries = series[0]
    const idxOrder = order.map((k, i) => ({ k, i }))
    idxOrder.sort((a, b) => {
      if (by === "label") return dir * groups.get(a.k)!.label.localeCompare(groups.get(b.k)!.label)
      return dir * ((primarySeries.points[a.i]?.value ?? 0) - (primarySeries.points[b.i]?.value ?? 0))
    })
    const perm = idxOrder.map((x) => x.i)
    order.splice(0, order.length, ...idxOrder.map((x) => x.k))
    for (const s of series) s.points = perm.map((i) => s.points[i])
  }
  if (config.limit && config.limit > 0) {
    order.splice(config.limit)
    for (const s of series) s.points = s.points.slice(0, config.limit)
  }

  // Summarized table columns = dimension + each series.
  const columns: ResultColumn[] = [{ key: "__dim", label: dim ? dim.f.label : "All", type: dim ? dim.f.type : "text" }, ...series.map((s) => ({ key: s.name, label: s.name, type: "number" as const }))]
  const tableRows: (string | number | null)[][] = order.map((gk) => {
    const label = groups.get(gk)!.label
    return [label, ...series.map((s) => s.points.find((p) => p.key === gk)?.value ?? 0)]
  })

  return { viz: config.viz, columns, rows: tableRows, series, total, capped, stacked: !!(breakdownField && config.breakdown), rowKeys: order, valueFormat, comparison }
}
