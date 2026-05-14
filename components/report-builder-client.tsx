"use client"

import { useRouter } from "next/navigation"
import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Check,
  Building2,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react"

export type GroupBy = "practice" | "pipeline" | "status" | "provider" | "insurance" | "month"
export type VizType = "bar" | "line" | "pie" | "donut" | "table"
export type Granularity = "day" | "week" | "month" | "year"

export interface ReportRow {
  key: string
  label: string
  total: number
  completed: number
  scheduled: number
  noShow: number
  pending: number
  conversionRate: number
}

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "practice", label: "Practice" },
  { value: "pipeline", label: "Pipeline" },
  { value: "status", label: "Status" },
  { value: "provider", label: "Provider" },
  { value: "insurance", label: "Insurance" },
  { value: "month", label: "Time" },
]

const RANGE_OPTIONS = [
  { value: "last_6m", label: "Last 6 months" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3m", label: "Last 3 months" },
  { value: "last_year", label: "Last 12 months" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
]

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
]

const VIZ_OPTIONS: { value: VizType; label: string }[] = [
  { value: "bar", label: "Bar" },
  { value: "line", label: "Line" },
  { value: "pie", label: "Pie" },
  { value: "donut", label: "Donut" },
  { value: "table", label: "Table only" },
]

const LIMIT_OPTIONS: { label: string; value: number | undefined }[] = [
  { label: "5", value: 5 },
  { label: "10", value: 10 },
  { label: "25", value: 25 },
  { label: "50", value: 50 },
  { label: "All", value: undefined },
]

const PALETTE = [
  "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1",
  "#14b8a6", "#a855f7",
]

// "key" enables chronological sort for time groupBy (keys are YYYY-MM-DD / YYYY-MM / YYYY)
type SortKey = keyof Pick<ReportRow, "key" | "label" | "total" | "completed" | "scheduled" | "noShow" | "pending" | "conversionRate">
type SortDir = "asc" | "desc"

function getSortOptions(groupBy: GroupBy): { label: string; key: SortKey; dir: SortDir }[] {
  if (groupBy === "month") {
    return [
      { label: "Oldest first", key: "key", dir: "asc" },
      { label: "Newest first", key: "key", dir: "desc" },
      { label: "Total ↓", key: "total", dir: "desc" },
      { label: "Total ↑", key: "total", dir: "asc" },
    ]
  }
  return [
    { label: "Total ↓", key: "total", dir: "desc" },
    { label: "Total ↑", key: "total", dir: "asc" },
    { label: "Name A→Z", key: "label", dir: "asc" },
    { label: "Name Z→A", key: "label", dir: "desc" },
    { label: "Conv. % ↓", key: "conversionRate", dir: "desc" },
    { label: "Conv. % ↑", key: "conversionRate", dir: "asc" },
  ]
}

interface Props {
  groupBy: GroupBy
  granularity: Granularity
  range: string
  currentFrom?: string
  currentTo?: string
  practiceIds: string[]
  pipelineIds: string[]
  filterPractices: { id: string; name: string }[]
  filterPipelines: { id: string; name: string; color: string }[]
  rows: ReportRow[]
  hasRun: boolean
  rangeFromStr: string
  rangeToStr: string
}

export default function ReportBuilderClient({
  groupBy,
  granularity,
  range,
  currentFrom,
  currentTo,
  practiceIds,
  pipelineIds,
  filterPractices,
  filterPipelines,
  rows,
  hasRun,
  rangeFromStr,
  rangeToStr,
}: Props) {
  const router = useRouter()
  const [customFrom, setCustomFrom] = useState(currentFrom ?? "")
  const [customTo, setCustomTo] = useState(currentTo ?? "")
  const [viz, setViz] = useState<VizType>("bar")
  const [limit, setLimit] = useState<number | undefined>(undefined)
  const [sortKey, setSortKey] = useState<SortKey>(() => groupBy === "month" ? "key" : "total")
  const [sortDir, setSortDir] = useState<SortDir>(() => groupBy === "month" ? "asc" : "desc")

  // Reset sort when groupBy changes via URL navigation
  const prevGroupByRef = useRef(groupBy)
  useEffect(() => {
    if (prevGroupByRef.current !== groupBy) {
      setSortKey(groupBy === "month" ? "key" : "total")
      setSortDir(groupBy === "month" ? "asc" : "desc")
      setLimit(undefined)
      prevGroupByRef.current = groupBy
    }
  }, [groupBy])

  function buildUrl(
    g: GroupBy,
    gran: Granularity,
    r: string,
    from?: string,
    to?: string,
    pids?: string[],
    plids?: string[],
  ) {
    const p = new URLSearchParams()
    p.set("groupBy", g)
    if (g === "month") p.set("granularity", gran)
    if (from && to) { p.set("from", from); p.set("to", to); p.set("range", "custom") }
    else p.set("range", r)
    pids?.forEach((id) => p.append("practiceId", id))
    plids?.forEach((id) => p.append("pipelineId", id))
    return `/reports/builder?${p.toString()}`
  }

  function applyGroupBy(g: GroupBy) {
    router.push(buildUrl(g, granularity, range, currentFrom, currentTo, practiceIds, pipelineIds))
  }

  function applyGranularity(gran: Granularity) {
    router.push(buildUrl(groupBy, gran, range, currentFrom, currentTo, practiceIds, pipelineIds))
  }

  function applyRange(r: string) {
    if (r === "custom") {
      router.push(buildUrl(groupBy, granularity, "custom", undefined, undefined, practiceIds, pipelineIds))
      return
    }
    router.push(buildUrl(groupBy, granularity, r, undefined, undefined, practiceIds, pipelineIds))
  }

  function applyCustom() {
    if (!customFrom || !customTo) return
    router.push(buildUrl(groupBy, granularity, "custom", customFrom, customTo, practiceIds, pipelineIds))
  }

  function togglePractice(id: string) {
    const next = practiceIds.includes(id) ? practiceIds.filter((x) => x !== id) : [...practiceIds, id]
    router.push(buildUrl(groupBy, granularity, range, currentFrom, currentTo, next, pipelineIds))
  }

  function togglePipeline(id: string) {
    const next = pipelineIds.includes(id) ? pipelineIds.filter((x) => x !== id) : [...pipelineIds, id]
    router.push(buildUrl(groupBy, granularity, range, currentFrom, currentTo, practiceIds, next))
  }

  function clearPractices() {
    router.push(buildUrl(groupBy, granularity, range, currentFrom, currentTo, [], pipelineIds))
  }

  function clearPipelines() {
    router.push(buildUrl(groupBy, granularity, range, currentFrom, currentTo, practiceIds, []))
  }

  function handleTableSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "key" || key === "label" ? "asc" : "desc")
    }
  }

  const sortedRows = [...rows].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey]
    if (typeof av === "string" && typeof bv === "string") {
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av)
    }
    return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number)
  })

  const displayedRows = limit !== undefined ? sortedRows.slice(0, limit) : sortedRows

  const groupLabel = GROUP_OPTIONS.find((g) => g.value === groupBy)?.label ?? groupBy
  const rangeLabel = RANGE_OPTIONS.find((r) => r.value === range)?.label ?? range
  const currentSortOpts = getSortOptions(groupBy)

  // "Group" table column: clicking sorts chronologically for time, alphabetically otherwise
  const groupColSortKey: SortKey = groupBy === "month" ? "key" : "label"

  function rowHref(row: ReportRow): string | undefined {
    const pParams = practiceIds.map((id) => `&practice=${id}`).join("")
    const plParams = pipelineIds.map((id) => `&pipeline=${id}`).join("")
    const base = `/referrals?from=${rangeFromStr}&to=${rangeToStr}`
    switch (groupBy) {
      case "practice":
        return row.key === "__none__" ? undefined : `${base}&practice=${row.key}${plParams}`
      case "pipeline":
        return row.key === "__none__" ? undefined : `${base}&pipeline=${row.key}${pParams}`
      case "status":
        return `${base}&status=${row.key}${pParams}${plParams}`
      case "provider":
        return row.key === "__none__" ? undefined : `${base}&doctor=${row.key}${pParams}${plParams}`
      case "month": {
        let mFrom: string, mTo: string
        if (granularity === "day") {
          mFrom = row.key; mTo = row.key
        } else if (granularity === "week") {
          mFrom = row.key
          const weekEnd = new Date(row.key)
          weekEnd.setDate(weekEnd.getDate() + 6)
          mTo = weekEnd.toISOString().slice(0, 10)
        } else if (granularity === "year") {
          mFrom = `${row.key}-01-01`; mTo = `${row.key}-12-31`
        } else {
          const [y, m] = row.key.split("-").map(Number)
          mFrom = `${y}-${String(m).padStart(2, "0")}-01`
          mTo = `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`
        }
        return `/referrals?from=${mFrom}&to=${mTo}${pParams}${plParams}`
      }
      default:
        return undefined
    }
  }

  function downloadCsv() {
    // Exports all sorted rows, ignoring limit
    const headers = [groupLabel, "Total", "Completed", "Scheduled", "No-Show", "Pending", "Conversion %"]
    const csvRows = sortedRows.map((r) => [
      r.label, r.total, r.completed, r.scheduled, r.noShow, r.pending, `${r.conversionRate}%`,
    ])
    const csv = [headers, ...csvRows]
      .map((row) => row.map((v) => {
        const s = String(v)
        return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
      }).join(","))
      .join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `report-${groupBy}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const TABLE_COLS: { key: SortKey; label: string }[] = [
    { key: groupColSortKey, label: groupLabel },
    { key: "total", label: "Total" },
    { key: "completed", label: "Completed" },
    { key: "scheduled", label: "Scheduled" },
    { key: "noShow", label: "No-Show" },
    { key: "pending", label: "Pending" },
    { key: "conversionRate", label: "Conv. %" },
  ]

  const chartTitle =
    viz === "line" ? `${groupLabel} Trend` :
    viz === "pie" || viz === "donut" ? `${groupLabel} Distribution` :
    `${groupLabel} by Volume`

  const showDisplayInfo = limit !== undefined && limit < rows.length

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/reports" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors">
          <ChevronLeft className="h-4 w-4" />
          Reports
        </Link>
        <span className="text-slate-300">/</span>
        <h1 className="text-2xl font-bold text-slate-900">Custom Report</h1>
      </div>

      {/* Configuration card */}
      <div className="bg-white border rounded-xl p-5 space-y-5">
        {/* Group by */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Group by</p>
          <div className="flex flex-wrap gap-2">
            {GROUP_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => applyGroupBy(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                  groupBy === opt.value && hasRun
                    ? "bg-zinc-900 text-white border-zinc-900"
                    : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400 hover:text-zinc-900"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Granularity — only when groupBy = "month" (Time) */}
        {groupBy === "month" && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Granularity</p>
            <div className="flex flex-wrap gap-2">
              {GRANULARITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => applyGranularity(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                    granularity === opt.value
                      ? "bg-zinc-900 text-white border-zinc-900"
                      : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400 hover:text-zinc-900"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Period */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Period</p>
          <div className="flex flex-wrap gap-2">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => applyRange(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                  range === opt.value
                    ? "bg-zinc-900 text-white border-zinc-900"
                    : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400 hover:text-zinc-900"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {range === "custom" && (
            <div className="flex items-center gap-2 mt-3">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                className="border rounded-lg px-2 py-1.5 text-sm" />
              <span className="text-slate-400 text-sm">to</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                className="border rounded-lg px-2 py-1.5 text-sm" />
              <button onClick={applyCustom}
                className="px-3 py-1.5 rounded-lg text-sm bg-zinc-900 text-white hover:bg-zinc-800 transition-colors">
                Apply
              </button>
            </div>
          )}
        </div>

        {/* Filters */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Filters</p>
          <div className="flex flex-wrap items-center gap-2">
            <MultiSelectDropdown
              label="Practice"
              icon={<Building2 className="h-3.5 w-3.5 shrink-0" />}
              options={filterPractices.map((p) => ({ id: p.id, label: p.name }))}
              selected={practiceIds}
              onToggle={togglePractice}
              onClear={clearPractices}
              searchable={filterPractices.length > 8}
            />
            {filterPipelines.length > 0 && (
              <MultiSelectDropdown
                label="Pipeline"
                icon={<ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                options={filterPipelines.map((p) => ({ id: p.id, label: p.name }))}
                selected={pipelineIds}
                onToggle={togglePipeline}
                onClear={clearPipelines}
              />
            )}
            {(practiceIds.length > 0 || pipelineIds.length > 0) && (
              <button
                onClick={() => router.push(buildUrl(groupBy, granularity, range, currentFrom, currentTo, [], []))}
                className="h-9 px-2 text-sm text-zinc-400 hover:text-zinc-700 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Sort, Limit, Visualization — only after results load */}
        {hasRun && rows.length > 0 && (
          <>
            {/* Sort */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Sort</p>
              <div className="flex flex-wrap gap-2">
                {currentSortOpts.map((opt) => (
                  <button
                    key={`${opt.key}-${opt.dir}`}
                    onClick={() => { setSortKey(opt.key); setSortDir(opt.dir) }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                      sortKey === opt.key && sortDir === opt.dir
                        ? "bg-zinc-900 text-white border-zinc-900"
                        : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400 hover:text-zinc-900"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Limit */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Limit
                <span className="ml-1.5 font-normal normal-case text-slate-400">· {rows.length} rows total</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {LIMIT_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => setLimit(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                      limit === opt.value
                        ? "bg-zinc-900 text-white border-zinc-900"
                        : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400 hover:text-zinc-900"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Visualization */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Visualization</p>
              <div className="flex flex-wrap gap-2">
                {VIZ_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setViz(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                      viz === opt.value
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400 hover:text-zinc-900"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Empty state */}
      {!hasRun && (
        <div className="bg-white border rounded-xl p-16 text-center">
          <p className="text-slate-400 text-sm">Select a group-by above to run your report</p>
        </div>
      )}

      {/* Results */}
      {hasRun && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              <span className="font-semibold text-slate-900">
                {showDisplayInfo ? `${displayedRows.length} of ${rows.length}` : rows.length}
              </span>{" "}
              rows · Grouped by <span className="font-medium text-slate-700">{groupLabel}</span>
              {groupBy === "month" && (
                <span className="text-slate-400"> · {GRANULARITY_OPTIONS.find(g => g.value === granularity)?.label}</span>
              )}
              {" "}· {rangeLabel}
            </p>
            {rows.length > 0 && (
              <button
                onClick={downloadCsv}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-zinc-200 rounded-lg text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 transition-all"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </button>
            )}
          </div>

          {rows.length === 0 ? (
            <div className="bg-white border rounded-xl p-16 text-center">
              <p className="text-slate-400 text-sm">No referrals found for this period and filters</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Chart */}
              {viz !== "table" && (
                <div className="bg-white border rounded-xl p-5">
                  <h2 className="text-sm font-semibold text-slate-700 mb-4">{chartTitle}</h2>
                  {viz === "bar" && <BarChartViz rows={displayedRows} rowHref={rowHref} />}
                  {viz === "line" && <LineChartViz rows={displayedRows} />}
                  {viz === "pie" && <PieChartViz rows={displayedRows} />}
                  {viz === "donut" && <DonutChartViz rows={displayedRows} />}
                </div>
              )}

              {/* Table */}
              <div className="bg-white border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="border-b bg-slate-50">
                    <tr>
                      {TABLE_COLS.map((col) => (
                        <th
                          key={col.key}
                          onClick={() => handleTableSort(col.key)}
                          className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-800 select-none whitespace-nowrap"
                        >
                          <span className="inline-flex items-center gap-1">
                            {col.label}
                            {sortKey === col.key ? (
                              sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3 opacity-25" />
                            )}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedRows.map((row) => {
                      const href = rowHref(row)
                      return (
                        <tr key={row.key} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-800 max-w-[220px] truncate">
                            {href ? (
                              <Link href={href} className="hover:text-blue-600 hover:underline">{row.label}</Link>
                            ) : row.label}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900">{row.total}</td>
                          <td className="px-4 py-3 text-green-700 font-medium">{row.completed}</td>
                          <td className="px-4 py-3 text-purple-700 font-medium">{row.scheduled}</td>
                          <td className="px-4 py-3 text-red-500 font-medium">{row.noShow}</td>
                          <td className="px-4 py-3 text-slate-500">{row.pending}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                              row.conversionRate >= 70
                                ? "bg-green-100 text-green-700"
                                : row.conversionRate >= 40
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-red-100 text-red-600"
                            }`}>
                              {row.conversionRate}%
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {showDisplayInfo && (
                  <div className="px-4 py-2.5 border-t bg-slate-50 text-xs text-slate-400">
                    Showing {displayedRows.length} of {rows.length} rows · Change limit above to see more
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Bar chart ────────────────────────────────────────────────────────────────

function BarChartViz({
  rows,
  rowHref,
}: {
  rows: ReportRow[]
  rowHref: (r: ReportRow) => string | undefined
}) {
  const maxTotal = Math.max(...rows.map((r) => r.total), 1)
  return (
    <div className="space-y-2.5">
      {rows.map((row) => {
        const href = rowHref(row)
        const bar = (
          <div className="flex items-center gap-3 group">
            <span className="text-xs text-slate-500 w-40 shrink-0 truncate">{row.label}</span>
            <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
              <div
                className="h-6 bg-blue-500 group-hover:bg-blue-600 rounded-full flex items-center px-2 transition-all"
                style={{ width: `${Math.max((row.total / maxTotal) * 100, row.total > 0 ? 6 : 0)}%` }}
              >
                {row.total > 0 && <span className="text-xs text-white font-medium">{row.total}</span>}
              </div>
            </div>
            {row.total === 0 && <span className="text-xs text-slate-400">0</span>}
            {href && <ChevronRight className="h-3 w-3 text-slate-300 group-hover:text-slate-500 shrink-0" />}
          </div>
        )
        return href
          ? <Link key={row.key} href={href}>{bar}</Link>
          : <div key={row.key}>{bar}</div>
      })}
    </div>
  )
}

// ─── Line chart ───────────────────────────────────────────────────────────────

function LineChartViz({ rows }: { rows: ReportRow[] }) {
  const max = Math.max(...rows.map((r) => r.total), 1)
  const W = 560, H = 180
  const padX = 40, padTop = 20, padBottom = 36
  const chartW = W - padX * 2
  const chartH = H - padTop - padBottom
  const n = rows.length

  const pts = rows.map((r, i) => ({
    x: padX + (n <= 1 ? chartW / 2 : (i / (n - 1)) * chartW),
    y: padTop + (1 - r.total / max) * chartH,
    ...r,
  }))

  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")
  const areaPath = pts.length > 0
    ? `${linePath} L${pts[pts.length - 1].x.toFixed(1)},${(padTop + chartH).toFixed(1)} L${pts[0].x.toFixed(1)},${(padTop + chartH).toFixed(1)} Z`
    : ""

  const yTicks = [0, 0.5, 1].map((pct) => ({
    y: padTop + (1 - pct) * chartH,
    val: Math.round(pct * max),
  }))

  const maxLabelLen = n > 12 ? 5 : n > 8 ? 7 : 10

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: "visible" }}>
      {yTicks.map(({ y, val }) => (
        <g key={val}>
          <line x1={padX} x2={W - padX} y1={y} y2={y} stroke="#f1f5f9" strokeWidth="1" />
          <text x={padX - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{val}</text>
        </g>
      ))}
      {areaPath && <path d={areaPath} fill="rgba(59,130,246,0.07)" />}
      <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => {
        const lbl = p.label.length > maxLabelLen ? p.label.slice(0, maxLabelLen - 1) + "…" : p.label
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4" fill="#3b82f6" stroke="white" strokeWidth="1.5" />
            {p.total > 0 && (
              <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="11" fontWeight="600" fill="#1e293b">
                {p.total}
              </text>
            )}
            <text x={p.x} y={H - 4} textAnchor="middle" fontSize="9" fill="#94a3b8">{lbl}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── Pie + Donut helpers ──────────────────────────────────────────────────────

function preparePieSlices(rows: ReportRow[]): ReportRow[] {
  const sorted = [...rows].sort((a, b) => b.total - a.total)
  const TOP = 11
  if (sorted.length <= TOP + 1) return sorted
  const top = sorted.slice(0, TOP)
  const rest = sorted.slice(TOP)
  return [
    ...top,
    {
      key: "__other__",
      label: "Other",
      total: rest.reduce((s, r) => s + r.total, 0),
      completed: 0, scheduled: 0, noShow: 0, pending: 0, conversionRate: 0,
    },
  ]
}

function pieArcPath(
  cx: number, cy: number, r: number,
  startAngle: number, endAngle: number,
  innerR = 0,
): string {
  const s = startAngle - Math.PI / 2
  const e = endAngle - Math.PI / 2
  const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s)
  const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e)
  const large = endAngle - startAngle > Math.PI ? 1 : 0
  if (innerR === 0) {
    return `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`
  }
  const ix1 = cx + innerR * Math.cos(s), iy1 = cy + innerR * Math.sin(s)
  const ix2 = cx + innerR * Math.cos(e), iy2 = cy + innerR * Math.sin(e)
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${ix2.toFixed(2)} ${iy2.toFixed(2)} A ${innerR} ${innerR} 0 ${large} 0 ${ix1.toFixed(2)} ${iy1.toFixed(2)} Z`
}

function PieDonutLegend({ slices }: { slices: ReportRow[] }) {
  const total = slices.reduce((s, r) => s + r.total, 0)
  return (
    <div className="flex-1 space-y-2 overflow-y-auto max-h-56 pr-1">
      {slices.map((slice, i) => (
        <div key={slice.key} className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
          <span className="text-slate-700 truncate flex-1 text-xs">{slice.label}</span>
          <span className="font-semibold text-slate-900 tabular-nums text-xs">{slice.total}</span>
          <span className="text-slate-400 text-xs tabular-nums w-9 text-right">
            {total > 0 ? Math.round((slice.total / total) * 100) : 0}%
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Pie chart ────────────────────────────────────────────────────────────────

function PieChartViz({ rows }: { rows: ReportRow[] }) {
  const slices = preparePieSlices(rows)
  const total = slices.reduce((s, r) => s + r.total, 0)
  if (total === 0) return null

  const cx = 120, cy = 120, r = 108, size = 240
  let angle = 0

  return (
    <div className="flex items-start gap-8">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-48 shrink-0">
        {slices.length === 1 ? (
          <circle cx={cx} cy={cy} r={r} fill={PALETTE[0]} />
        ) : (
          slices.map((slice, i) => {
            const sweep = (slice.total / total) * Math.PI * 2
            const d = pieArcPath(cx, cy, r, angle, angle + sweep)
            angle += sweep
            return (
              <path key={slice.key} d={d} fill={PALETTE[i % PALETTE.length]}
                stroke="white" strokeWidth="2" className="hover:opacity-80 transition-opacity cursor-default" />
            )
          })
        )}
      </svg>
      <PieDonutLegend slices={slices} />
    </div>
  )
}

// ─── Donut chart ──────────────────────────────────────────────────────────────

function DonutChartViz({ rows }: { rows: ReportRow[] }) {
  const slices = preparePieSlices(rows)
  const total = slices.reduce((s, r) => s + r.total, 0)
  if (total === 0) return null

  const cx = 120, cy = 120, r = 108, innerR = 56, size = 240
  let angle = 0

  return (
    <div className="flex items-start gap-8">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-48 shrink-0">
        {slices.length === 1 ? (
          <>
            <circle cx={cx} cy={cy} r={r} fill={PALETTE[0]} />
            <circle cx={cx} cy={cy} r={innerR} fill="white" />
          </>
        ) : (
          slices.map((slice, i) => {
            const sweep = (slice.total / total) * Math.PI * 2
            const d = pieArcPath(cx, cy, r, angle, angle + sweep, innerR)
            angle += sweep
            return (
              <path key={slice.key} d={d} fill={PALETTE[i % PALETTE.length]}
                stroke="white" strokeWidth="2" className="hover:opacity-80 transition-opacity cursor-default" />
            )
          })
        )}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="20" fontWeight="700" fill="#1e293b">{total}</text>
        <text x={cx} y={cy + 15} textAnchor="middle" fontSize="10" fill="#94a3b8">total</text>
      </svg>
      <PieDonutLegend slices={slices} />
    </div>
  )
}

// ─── Multi-select dropdown ────────────────────────────────────────────────────

function MultiSelectDropdown({
  label,
  icon,
  options,
  selected,
  onToggle,
  onClear,
  searchable,
}: {
  label: string
  icon?: React.ReactNode
  options: { id: string; label: string }[]
  selected: string[]
  onToggle: (id: string) => void
  onClear: () => void
  searchable?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered =
    searchable && search.trim()
      ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
      : options

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch("")
      }
    }
    if (open) {
      document.addEventListener("mousedown", handler)
      if (searchable) setTimeout(() => inputRef.current?.focus(), 0)
    }
    return () => document.removeEventListener("mousedown", handler)
  }, [open, searchable])

  const active = selected.length > 0

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm font-medium transition-all select-none ${
          active
            ? "bg-zinc-900 text-white border-zinc-900 hover:bg-zinc-800"
            : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300 hover:text-zinc-900"
        }`}
      >
        {icon}
        <span>{label}</span>
        {active && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-white/20 text-xs font-bold tabular-nums">
            {selected.length}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full mt-2 left-0 z-50 min-w-[200px] max-w-[280px] bg-white border border-zinc-200 rounded-xl shadow-xl overflow-hidden">
          {searchable && (
            <div className="px-2 pt-2 pb-1">
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}...`}
                className="w-full h-8 px-2.5 text-sm bg-zinc-50 border border-zinc-200 rounded-lg outline-none focus:border-zinc-400 focus:bg-white transition-colors"
              />
            </div>
          )}
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2.5 text-sm text-zinc-400">No results</div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => onToggle(opt.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-zinc-50 transition-colors"
                >
                  <span className={`shrink-0 w-[14px] h-[14px] rounded border flex items-center justify-center transition-all ${
                    selected.includes(opt.id) ? "bg-zinc-900 border-zinc-900" : "border-zinc-300"
                  }`}>
                    {selected.includes(opt.id) && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                  </span>
                  <span className="text-zinc-800 text-left truncate">{opt.label}</span>
                </button>
              ))
            )}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-zinc-100 px-3 py-1.5">
              <button
                onClick={() => { onClear(); setOpen(false) }}
                className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
