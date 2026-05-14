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
  { value: "month", label: "Month" },
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

type SortKey = keyof Pick<ReportRow, "label" | "total" | "completed" | "scheduled" | "noShow" | "pending" | "conversionRate">
type SortDir = "asc" | "desc"

interface Props {
  groupBy: GroupBy
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
  const [sortKey, setSortKey] = useState<SortKey>("total")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  function buildUrl(g: GroupBy, r: string, from?: string, to?: string, pids?: string[], plids?: string[]) {
    const p = new URLSearchParams()
    p.set("groupBy", g)
    if (from && to) { p.set("from", from); p.set("to", to); p.set("range", "custom") }
    else p.set("range", r)
    pids?.forEach((id) => p.append("practiceId", id))
    plids?.forEach((id) => p.append("pipelineId", id))
    return `/reports/builder?${p.toString()}`
  }

  function applyGroupBy(g: GroupBy) {
    router.push(buildUrl(g, range, currentFrom, currentTo, practiceIds, pipelineIds))
  }

  function applyRange(r: string) {
    if (r === "custom") { router.push(buildUrl(groupBy, "custom", undefined, undefined, practiceIds, pipelineIds)); return }
    router.push(buildUrl(groupBy, r, undefined, undefined, practiceIds, pipelineIds))
  }

  function applyCustom() {
    if (!customFrom || !customTo) return
    router.push(buildUrl(groupBy, "custom", customFrom, customTo, practiceIds, pipelineIds))
  }

  function togglePractice(id: string) {
    const next = practiceIds.includes(id) ? practiceIds.filter((x) => x !== id) : [...practiceIds, id]
    router.push(buildUrl(groupBy, range, currentFrom, currentTo, next, pipelineIds))
  }

  function togglePipeline(id: string) {
    const next = pipelineIds.includes(id) ? pipelineIds.filter((x) => x !== id) : [...pipelineIds, id]
    router.push(buildUrl(groupBy, range, currentFrom, currentTo, practiceIds, next))
  }

  function clearPractices() {
    router.push(buildUrl(groupBy, range, currentFrom, currentTo, [], pipelineIds))
  }

  function clearPipelines() {
    router.push(buildUrl(groupBy, range, currentFrom, currentTo, practiceIds, []))
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "label" ? "asc" : "desc")
    }
  }

  const sortedRows = [...rows].sort((a, b) => {
    const av = a[sortKey]
    const bv = b[sortKey]
    if (typeof av === "string" && typeof bv === "string") {
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av)
    }
    return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number)
  })

  const maxTotal = Math.max(...rows.map((r) => r.total), 1)
  const chartRows = groupBy === "month" ? rows : rows.slice(0, 15)
  const groupLabel = GROUP_OPTIONS.find((g) => g.value === groupBy)?.label ?? groupBy
  const rangeLabel = RANGE_OPTIONS.find((r) => r.value === range)?.label ?? range

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
        const [y, m] = row.key.split("-").map(Number)
        const mFrom = `${y}-${String(m).padStart(2, "0")}-01`
        const lastDay = new Date(y, m, 0).getDate()
        const mTo = `${y}-${String(m).padStart(2, "0")}-${lastDay}`
        return `/referrals?from=${mFrom}&to=${mTo}${pParams}${plParams}`
      }
      default:
        return undefined
    }
  }

  function downloadCsv() {
    const headers = [groupLabel, "Total", "Completed", "Scheduled", "No-Show", "Pending", "Conversion %"]
    const csvRows = sortedRows.map((r) => [
      r.label, r.total, r.completed, r.scheduled, r.noShow, r.pending, `${r.conversionRate}%`,
    ])
    const csv = [headers, ...csvRows]
      .map((row) =>
        row.map((v) => {
          const s = String(v)
          return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
        }).join(",")
      )
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
    { key: "label", label: groupLabel },
    { key: "total", label: "Total" },
    { key: "completed", label: "Completed" },
    { key: "scheduled", label: "Scheduled" },
    { key: "noShow", label: "No-Show" },
    { key: "pending", label: "Pending" },
    { key: "conversionRate", label: "Conv. %" },
  ]

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
                onClick={() => router.push(buildUrl(groupBy, range, currentFrom, currentTo, [], []))}
                className="h-9 px-2 text-sm text-zinc-400 hover:text-zinc-700 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
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
              <span className="font-semibold text-slate-900">{rows.length}</span> rows · Grouped by{" "}
              <span className="font-medium text-slate-700">{groupLabel}</span> · {rangeLabel}
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
              {/* Bar chart */}
              <div className="bg-white border rounded-xl p-5">
                <h2 className="text-sm font-semibold text-slate-700 mb-4">
                  {groupLabel} by Volume
                  {chartRows.length < rows.length && (
                    <span className="font-normal text-slate-400 ml-1">(top {chartRows.length})</span>
                  )}
                </h2>
                <div className="space-y-2.5">
                  {chartRows.map((row) => {
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
                    return href ? (
                      <Link key={row.key} href={href}>{bar}</Link>
                    ) : (
                      <div key={row.key}>{bar}</div>
                    )
                  })}
                </div>
              </div>

              {/* Sortable table */}
              <div className="bg-white border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="border-b bg-slate-50">
                    <tr>
                      {TABLE_COLS.map((col) => (
                        <th
                          key={col.key}
                          onClick={() => handleSort(col.key)}
                          className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-800 select-none whitespace-nowrap"
                        >
                          <span className="inline-flex items-center gap-1">
                            {col.label}
                            {sortKey === col.key ? (
                              sortDir === "asc"
                                ? <ArrowUp className="h-3 w-3" />
                                : <ArrowDown className="h-3 w-3" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3 opacity-25" />
                            )}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedRows.map((row) => {
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
              </div>
            </div>
          )}
        </>
      )}
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
