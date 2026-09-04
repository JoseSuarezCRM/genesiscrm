// A saved view's configuration for a custom object.
//
// A view owns its *type* (table / board / calendar) plus everything that type needs:
// filters, sort, which pipeline, the board's card layout and footer metrics, the
// calendar's date property. It all lives in CustomObjectView.config (a Json column),
// so widening this shape needs no migration.
//
// Views saved before this existed only carried { filter, columns } — normalizeViewConfig()
// upgrades those in place on read, so old tabs keep working untouched.

import { emptyFilter, type FilterState } from "@/lib/filters"

export type ObjectViewType = "table" | "board" | "calendar"

export const VIEW_TYPES: { value: ObjectViewType; label: string }[] = [
  { value: "table", label: "Table" },
  { value: "board", label: "Board" },
  { value: "calendar", label: "Calendar" },
]

/** How a board's footer line aggregates a property across a column. */
export type BoardAgg = "sum" | "avg" | "weighted" | "count" | "min" | "max"

export const BOARD_AGGS: { value: BoardAgg; label: string; needsProperty: boolean }[] = [
  { value: "sum", label: "Total", needsProperty: true },
  { value: "avg", label: "Average", needsProperty: true },
  { value: "weighted", label: "Weighted", needsProperty: true },
  { value: "count", label: "Record count", needsProperty: false },
  { value: "min", label: "Minimum", needsProperty: true },
  { value: "max", label: "Maximum", needsProperty: true },
]

export interface BoardMetric {
  propertyId: string | null
  agg: BoardAgg
}

export interface BoardConfig {
  /** Property ids rendered as "Label: value" lines under the card title. */
  cardProperties: string[]
  /** Up to 2 footer lines per column. */
  metrics: BoardMetric[]
  showMetrics: boolean
  showChips: boolean
  showLastActivity: boolean
  showActions: boolean
  showTimeInStage: boolean
  collapsedStageIds: string[]
}

export interface CalendarConfig {
  /** DATE or DATE_TIME property that places a record on the grid. */
  datePropertyId: string | null
  /** Defaults to the object's primary/name when unset. */
  titlePropertyId: string | null
  range: "month" | "week" | "day"
  /** "stage" or a DROPDOWN property id. */
  colorBy: string
}

export interface ObjectViewConfig {
  type: ObjectViewType
  filter: FilterState
  sort: { key: string; dir: "asc" | "desc" }
  /** Field keys shown as dropdown chips in the quick-filter row. */
  quickFilters: string[]
  columns: string[]
  frozen: number
  pipelineId: string | null
  board: BoardConfig
  calendar: CalendarConfig
}

export function defaultBoardConfig(): BoardConfig {
  return {
    cardProperties: [],
    metrics: [{ propertyId: null, agg: "sum" }, { propertyId: null, agg: "avg" }],
    showMetrics: true,
    showChips: true,
    showLastActivity: true,
    showActions: true,
    showTimeInStage: true,
    collapsedStageIds: [],
  }
}

export function defaultCalendarConfig(): CalendarConfig {
  return { datePropertyId: null, titlePropertyId: null, range: "month", colorBy: "stage" }
}

export function defaultViewConfig(columns: string[] = []): ObjectViewConfig {
  return {
    type: "table",
    filter: emptyFilter(),
    sort: { key: "__id", dir: "desc" },
    quickFilters: [],
    columns,
    frozen: 0,
    pipelineId: null,
    board: defaultBoardConfig(),
    calendar: defaultCalendarConfig(),
  }
}

function asArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
}

function normalizeMetric(m: any): BoardMetric {
  const agg = BOARD_AGGS.some((a) => a.value === m?.agg) ? (m.agg as BoardAgg) : "sum"
  return { propertyId: typeof m?.propertyId === "string" ? m.propertyId : null, agg }
}

/**
 * Read any stored config (including the legacy `{ filter, columns }` shape) as a
 * complete ObjectViewConfig. Never throws — an unreadable value falls back to defaults,
 * because a broken view must not take down the list.
 */
export function normalizeViewConfig(raw: unknown, fallbackColumns: string[] = []): ObjectViewConfig {
  const c = (raw ?? {}) as any
  const base = defaultViewConfig(fallbackColumns)

  const type: ObjectViewType = VIEW_TYPES.some((t) => t.value === c.type) ? c.type : "table"
  const board = { ...base.board, ...(c.board ?? {}) } as BoardConfig
  const rawMetrics = Array.isArray(c.board?.metrics) ? c.board.metrics : null
  board.metrics = (rawMetrics ?? base.board.metrics).slice(0, 2).map(normalizeMetric)
  board.cardProperties = asArray(board.cardProperties)
  board.collapsedStageIds = asArray(board.collapsedStageIds)

  const calendar = { ...base.calendar, ...(c.calendar ?? {}) } as CalendarConfig
  if (calendar.range !== "week" && calendar.range !== "day") calendar.range = "month"

  return {
    type,
    filter: c.filter && typeof c.filter === "object" ? (c.filter as FilterState) : base.filter,
    sort: {
      key: typeof c.sort?.key === "string" ? c.sort.key : base.sort.key,
      dir: c.sort?.dir === "asc" ? "asc" : "desc",
    },
    quickFilters: asArray(c.quickFilters),
    columns: Array.isArray(c.columns) && c.columns.length ? asArray(c.columns) : base.columns,
    frozen: typeof c.frozen === "number" ? c.frozen : 0,
    pipelineId: typeof c.pipelineId === "string" ? c.pipelineId : null,
    board,
    calendar,
  }
}

/** The subset that decides whether a view is "dirty" vs its saved state. */
export function viewFingerprint(c: ObjectViewConfig): string {
  return JSON.stringify({
    type: c.type, filter: c.filter, sort: c.sort, quickFilters: c.quickFilters,
    columns: c.columns, frozen: c.frozen, pipelineId: c.pipelineId,
    board: c.board, calendar: c.calendar,
  })
}
