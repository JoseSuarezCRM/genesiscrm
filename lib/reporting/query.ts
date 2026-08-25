// Report query engine: turns a ReportConfig into a ReportResult. Prisma isn't a
// generic query engine, so we fetch the primary object's rows (filtered) and
// aggregate in memory. Cross-object joins and pivot are layered on in later phases.
import { prisma } from "@/lib/prisma"
import { delegateFor } from "@/lib/automation-records"
import { filterStateToWhere } from "@/lib/filter-to-prisma"
import type { FilterField } from "@/lib/filters"
import { reportFieldsFor, joinedFieldsForSource, REPORT_OBJECTS, recordHref } from "./objects"
import type {
  ReportConfig, ReportResult, ReportField, Measure, Dimension, ResultColumn, Series, DateFrequency,
} from "./types"
import { resolvePreset } from "./date-presets"
import { computeStageDurations } from "@/lib/stages/durations"

const ROW_CAP = 10000

// Resolve a date-range preset (or custom from/to) to a [start, end] window.
function resolveWindow(dr: NonNullable<ReportConfig["dateRange"]>): { start: Date; end: Date } | null {
  return resolvePreset(dr.preset, dr.from, dr.to)
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
  if (field.stageDuration) {
    const sd = row?.__sd
    if (!sd) return null
    const k = field.stageDuration
    const ms = k.kind === "current" ? sd.timeInCurrentStage
      : k.kind === "toClose" ? sd.timeToClose
      : k.kind === "cumulative" ? (sd.cumulative[k.stageId!] ?? 0)
      : (sd.latest[k.stageId!] ?? 0)
    return ms == null ? null : ms / 864e5 // milliseconds → days
  }
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

// The bucket key + label for a specific date at a frequency — must match dimKeyLabel's date branch.
function dateBucket(d: Date, freq: DateFrequency): { key: string; label: string } {
  const y = d.getUTCFullYear(), m = d.getUTCMonth()
  if (freq === "year") return { key: `${y}`, label: `${y}` }
  if (freq === "quarter") { const q = Math.floor(m / 3) + 1; return { key: `${y}-Q${q}`, label: `Q${q} ${y}` } }
  if (freq === "month") return { key: `${y}-${String(m + 1).padStart(2, "0")}`, label: d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) }
  if (freq === "week") { const day = d.getUTCDate(); const wk = Math.ceil(day / 7); return { key: `${y}-${m}-w${wk}`, label: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) } }
  return { key: d.toISOString().slice(0, 10), label: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) }
}
// Every bucket between two dates (inclusive) at the given frequency, in order — so a
// date axis is continuous (empty periods still appear), like HubSpot.
function enumerateDateBuckets(min: Date, max: Date, freq: DateFrequency): { key: string; label: string; t: number }[] {
  const out: { key: string; label: string; t: number }[] = []
  const seen = new Set<string>()
  const cur = new Date(Date.UTC(min.getUTCFullYear(), min.getUTCMonth(), min.getUTCDate()))
  let guard = 0
  while (cur.getTime() <= max.getTime() && guard++ < 2000) {
    const b = dateBucket(cur, freq)
    if (!seen.has(b.key)) { seen.add(b.key); out.push({ ...b, t: cur.getTime() }) }
    if (freq === "year") cur.setUTCFullYear(cur.getUTCFullYear() + 1)
    else if (freq === "quarter") cur.setUTCMonth(cur.getUTCMonth() + 3)
    else if (freq === "month") cur.setUTCMonth(cur.getUTCMonth() + 1)
    else if (freq === "week") cur.setUTCDate(cur.getUTCDate() + 7)
    else cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
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
  const include: Record<string, unknown> = Object.fromEntries((config.sources ?? []).map((s) => [s.joinPath, true]))
  // Always join the primary's USER owner relations so inline Owner/Created-by name
  // fields resolve (they're single-FK and cheap), regardless of selected sources.
  for (const a of (REPORT_OBJECTS[primary]?.associations ?? [])) {
    if (a.target === "USER" && !(a.path in include)) include[a.path] = { select: { name: true, email: true } }
  }
  const rows: any[] = await model.findMany({ where, ...(Object.keys(include).length ? { include } : {}), take: ROW_CAP }).catch(() => [])

  // If any referenced field is a stage duration, compute time-in-stage per row
  // from the StageTransition log (attach row.__sd for readValue).
  if (allFields.some((f) => f.stageDuration) && rows.length) {
    await attachStageDurations(primary, rows)
  }
  return { rows, fields, byKey, total: rows.length, capped: rows.length >= ROW_CAP }
}

// Load StageTransitions for the loaded rows and compute per-record durations.
async function attachStageDurations(primary: string, rows: any[]): Promise<void> {
  const ids = rows.map((r) => r.id).filter(Boolean)
  if (!ids.length) return
  const [stages, transitions] = await Promise.all([
    (prisma as any).pipelineStage.findMany({ where: { pipeline: { objectType: primary } }, select: { id: true, isClosed: true, isWon: true, name: true, order: true, pipelineId: true, probability: true, color: true } }).catch(() => []),
    (prisma as any).stageTransition.findMany({ where: { recordType: primary, recordId: { in: ids } }, orderBy: { enteredAt: "asc" }, select: { recordId: true, toStageId: true, enteredAt: true } }).catch(() => []),
  ])
  const byRecord = new Map<string, { toStageId: string; enteredAt: Date }[]>()
  for (const t of transitions) {
    const arr = byRecord.get(t.recordId) ?? []
    arr.push({ toStageId: t.toStageId, enteredAt: t.enteredAt })
    byRecord.set(t.recordId, arr)
  }
  const now = new Date()
  for (const r of rows) r.__sd = computeStageDurations(byRecord.get(r.id) ?? [], stages, now)
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
  const slice = matched.slice(0, 1000)
  const out = slice.map((r) => cols.map((f) => formatCell(readValue(r, f), f)))
  const rowLinks = slice.map((r) => recordHref(config.primary, r?.id))
  return { viz: "table", columns, rows: out, total: matched.length, capped: matched.length > 1000, rowLinks }
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
  const AGG_LABEL: Record<string, string> = { count: "Count", distinct_count: "Distinct count", sum: "Sum", avg: "Average", min: "Min", max: "Max" }
  const measureLabel = (m: Measure) => m.label ?? (m.key === "*" ? "(Count)" : `(${AGG_LABEL[m.agg] ?? m.agg}) ${byKey[m.key]?.label ?? m.key}`)
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

  // KPI / gauge — one big number per measure (a multi-metric summary card / dial).
  if (config.viz === "kpi" || config.viz === "gauge") {
    const kpis = measures.map((m) => ({
      label: measureLabel(m),
      value: aggregate(rows, m, measureField(m)),
      format: m.format ? { format: m.format, decimals: m.decimals } : undefined,
    }))
    return { viz: config.viz, columns: [], rows: [], kpi: kpis[0]?.value ?? 0, kpis, total, capped, valueFormat, comparison }
  }

  const dims = config.dimensions.map((d) => ({ d, f: byKey[d.key] })).filter((x) => x.f)

  // Unsummarized table: raw rows for the chosen columns (or a sensible default).
  if (config.viz === "table" && (dims.length === 0 || config.tableMode === "unsummarized")) {
    const cols = (config.columns.length ? config.columns.map((c) => byKey[c.key]).filter(Boolean) : fields.slice(0, 6)) as ReportField[]
    const columns: ResultColumn[] = cols.map((f) => ({ key: f.key, label: f.label, type: f.type }))
    const sliced = rows.slice(0, 500)
    const out = sliced.map((r) => cols.map((f) => {
      const v = readValue(r, f)
      if (v == null) return null
      if (f.type === "date") { const d = toDate(v); return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : String(v) }
      if (Array.isArray(v)) return v.join(", ")
      return typeof v === "number" ? v : String(v)
    }))
    const rowLinks = sliced.map((r) => recordHref(primary, r?.id))
    return { viz: "table", columns, rows: out, total, capped, rowLinks }
  }

  // Grouped: one primary dimension (first), optional breakdown → series/rows.
  const dim = dims[0]
  const breakdownField = config.breakdown ? byKey[config.breakdown.key] : null

  // Bucket rows by the primary dimension (a single "All" group when none is set).
  const groups = new Map<string, { label: string; rows: any[] }>()
  const bucketTime = new Map<string, number>() // sortable timestamp for (esp. empty) date buckets
  const order: string[] = []
  for (const r of rows) {
    const { key, label } = dim ? dimKeyLabel(r, dim.d, dim.f) : { key: "all", label: "All" }
    if (!groups.has(key)) { groups.set(key, { label, rows: [] }); order.push(key) }
    groups.get(key)!.rows.push(r)
  }

  // Continuous date axis: for a date dimension, insert empty buckets between the
  // earliest and latest present value so gaps (e.g. a day with no records) still show.
  const dateDimGF = !!dim && (dim.f.type === "date" || !!dim.d.dateFrequency)
  if (dateDimGF && order.length > 1) {
    const freq = dim!.d.dateFrequency ?? "day"
    const dates = rows.map((r) => toDate(readValue(r, dim!.f))).filter((d): d is Date => !!d)
    if (dates.length) {
      const min = new Date(Math.min(...dates.map((d) => d.getTime())))
      const max = new Date(Math.max(...dates.map((d) => d.getTime())))
      const full = enumerateDateBuckets(min, max, freq)
      if (full.length <= 500) {
        const complete: string[] = []
        for (const b of full) {
          if (!groups.has(b.key)) groups.set(b.key, { label: b.label, rows: [] })
          bucketTime.set(b.key, b.t)
          complete.push(b.key)
        }
        // keep any "(No value)" bucket that isn't part of the date sequence
        for (const k of order) if (!complete.includes(k)) complete.push(k)
        order.splice(0, order.length, ...complete)
      }
    }
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
      series.push({ name: measureLabel(m), chartType: m.chartType, axis: m.axis, points: order.map((gk) => ({ key: gk, label: groups.get(gk)!.label, value: aggregate(groups.get(gk)!.rows, m, measureField(m)) })) })
    }
  }

  // Order groups. A date/time dimension is always chronological (oldest → newest);
  // other dimensions sort by the first series value (or label).
  const dateDim = !!dim && (dim.f.type === "date" || !!dim.d.dateFrequency)
  if (dateDim) {
    const t = (k: string) => {
      const r0 = groups.get(k)!.rows[0]
      const d = r0 ? toDate(readValue(r0, dim!.f)) : null
      return d ? d.getTime() : (bucketTime.get(k) ?? -Infinity)
    }
    const idxOrder = order.map((k, i) => ({ k, i })).sort((a, b) => t(a.k) - t(b.k))
    const perm = idxOrder.map((x) => x.i)
    order.splice(0, order.length, ...idxOrder.map((x) => x.k))
    for (const s of series) s.points = perm.map((i) => s.points[i])
  } else if (config.sort) {
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
    if (dateDim) {
      // Keep the most recent N buckets, still ordered oldest → newest.
      const startIdx = Math.max(0, order.length - config.limit)
      order.splice(0, startIdx)
      for (const s of series) s.points = s.points.slice(startIdx)
    } else {
      order.splice(config.limit)
      for (const s of series) s.points = s.points.slice(0, config.limit)
    }
  }

  // Summarized table columns = dimension + each series. The dimension header honors
  // a rename override (dim.d.label); the y-axis title is the primary measure label.
  const dimLabel = dim ? (dim.d.label ?? dim.f.label) : "All"
  const axis = { x: dim ? dimLabel : undefined, y: measureLabel(measures[0]) }
  const columns: ResultColumn[] = [{ key: "__dim", label: dimLabel, type: dim ? dim.f.type : "text" }, ...series.map((s) => ({ key: s.name, label: s.name, type: "number" as const }))]
  const tableRows: (string | number | null)[][] = order.map((gk) => {
    const label = groups.get(gk)!.label
    return [label, ...series.map((s) => s.points.find((p) => p.key === gk)?.value ?? 0)]
  })

  return { viz: config.viz, columns, rows: tableRows, series, total, capped, stacked: !!(breakdownField && config.breakdown), rowKeys: order, valueFormat, comparison, axis }
}
