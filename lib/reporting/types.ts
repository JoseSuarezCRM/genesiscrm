// Config + result types for the cross-object Report Builder. The config is stored
// in SavedReport.config; the query engine (lib/reporting/query.ts) turns it into a
// result the builder preview and dashboards render.
import type { FilterState } from "@/lib/filters"

export type ReportFieldType = "text" | "number" | "date" | "select" | "boolean"

// A field available on a reportable object (native column or custom property).
export interface ReportField {
  key: string          // stable id, unique within a source (native key or cp id)
  label: string
  type: ReportFieldType
  source: string       // object key this field belongs to (primary or a joined source)
  column: string       // DB column / JSON key used to read the value
  jsonBag?: string     // set when the value lives in a JSON bag (customProperties/values)
  joinPath?: string    // set for a joined source: the Prisma relation on the primary row
  options?: { value: string; label: string }[]
}

export type Aggregation = "count" | "distinct_count" | "sum" | "avg" | "min" | "max"
export type DateFrequency = "day" | "week" | "month" | "quarter" | "year"

export type VizType = "table" | "vbar" | "hbar" | "line" | "area" | "pie" | "donut" | "kpi" | "pivot"

// A reference to a field on a source (source === primary key or a joined source key).
export interface FieldRef {
  source: string
  key: string
}

export type ValueFormat = "number" | "currency" | "percent" | "duration"

export interface Measure extends FieldRef {
  agg: Aggregation
  label?: string
  format?: ValueFormat
  decimals?: number
}

export interface Dimension extends FieldRef {
  dateFrequency?: DateFrequency
  label?: string
}

export interface ReportSource {
  objectKey: string    // the joined object
  joinPath: string     // association path from the primary (Prisma relation name)
  label?: string
}

export interface ReportConfig {
  primary: string
  sources: ReportSource[]
  viz: VizType
  columns: FieldRef[]          // table columns (unsummarized view)
  measures: Measure[]
  dimensions: Dimension[]      // x-axis / group / pivot rows
  breakdown?: Dimension | null // compare / stack / pivot columns
  filters?: FilterState | null
  sort?: { by: "value" | "label"; dir: "asc" | "desc" } | null
  limit?: number | null
  tableMode?: "summarized" | "unsummarized" // table viz: grouped rows vs raw records
  dateRange?: { field: string; preset: string; from?: string; to?: string } | null
  compare?: boolean            // compare the primary measure vs the previous period
  style?: Record<string, unknown>
}

export type DateRangePreset =
  | "all" | "last_7" | "last_30" | "last_90" | "this_month" | "last_month"
  | "this_quarter" | "this_year" | "ytd" | "custom"

// ── Results ────────────────────────────────────────────────────────────────
export interface ResultColumn { key: string; label: string; type: ReportFieldType }

// A grouped series: one entry per breakdown value (or a single series when no
// breakdown), each with points keyed by the primary dimension's label.
export interface Series { name: string; points: { label: string; key: string; value: number }[] }

export interface ReportResult {
  viz: VizType
  columns: ResultColumn[]     // for table / unsummarized rows
  rows: (string | number | null)[][]
  series?: Series[]           // for charts (bar/line/area/pie)
  kpi?: number                // for the KPI viz
  pivot?: { rowLabels: string[]; colLabels: string[]; cells: (number | null)[][]; rowKeys: string[]; colKeys: string[] }
  kpis?: { label: string; value: number; format?: { format: ValueFormat; decimals?: number } }[] // multi-metric KPI card
  total: number               // total matching primary records
  capped?: boolean
  stacked?: boolean           // series form a composition (from a breakdown) → stack
  rowKeys?: string[]          // dimension group keys aligned with `rows` (for drill-into)
  valueFormat?: { format: ValueFormat; decimals?: number } // how to render measure values
  comparison?: { prev: number; delta: number | null } // primary measure vs previous period
  axis?: { x?: string; y?: string } // chart axis titles (dimension / measure)
}

export const EMPTY_REPORT: ReportConfig = {
  primary: "REFERRAL",
  sources: [],
  viz: "table",
  columns: [],
  measures: [{ source: "REFERRAL", key: "*", agg: "count" }],
  dimensions: [],
  breakdown: null,
  filters: null,
  sort: { by: "value", dir: "desc" },
  limit: null,
}
