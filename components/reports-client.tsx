"use client"

import { useRouter } from "next/navigation"
import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { ReferralStatus } from "@prisma/client"
import { Users, CheckCircle2, Calendar, Clock, TrendingUp, BarChart2, ChevronRight, ChevronDown, Check, Building2, User } from "lucide-react"

interface Props {
  kpis: {
    total: number
    completed: number
    scheduled: number
    pending: number
    conversionRate: number
    scheduleRate: number
    totalEver: number
  }
  monthlyData: { label: string; year: number; month: number; count: number }[]
  statusCountMap: Record<string, number>
  statusColors: Record<string, string>
  statusLabels: Record<string, string>
  practicesData: { id: string; name: string; count: number }[]
  providersData: { id: string; name: string; specialty: string | null; practiceName: string | null; count: number }[]
  insuranceData: { name: string; count: number }[]
  currentRange: string
  currentFrom?: string
  currentTo?: string
  rangeFromStr: string
  rangeToStr: string
  practiceIds: string[]
  doctorIds: string[]
  pipelineIds: string[]
  filterPractices: { id: string; name: string }[]
  filterDoctors: { id: string; label: string; practiceId: string }[]
  filterPipelines: { id: string; name: string; color: string }[]
}

const RANGE_OPTIONS = [
  { value: "last_6m", label: "Last 6 months" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3m", label: "Last 3 months" },
  { value: "last_year", label: "Last 12 months" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
]

export default function ReportsClient({
  kpis,
  monthlyData,
  statusCountMap,
  statusColors,
  statusLabels,
  practicesData,
  providersData,
  insuranceData,
  currentRange,
  currentFrom,
  currentTo,
  rangeFromStr,
  rangeToStr,
  practiceIds,
  doctorIds,
  pipelineIds,
  filterPractices,
  filterDoctors,
  filterPipelines,
}: Props) {
  const router = useRouter()
  const [range, setRange] = useState(currentRange)
  const [customFrom, setCustomFrom] = useState(currentFrom ?? "")
  const [customTo, setCustomTo] = useState(currentTo ?? "")

  function buildUrl(r: string, from?: string, to?: string, pids?: string[], dids?: string[], plids?: string[]) {
    const p = new URLSearchParams()
    if (from && to) { p.set("from", from); p.set("to", to); p.set("range", "custom") }
    else p.set("range", r)
    pids?.forEach((id) => p.append("practiceId", id))
    dids?.forEach((id) => p.append("doctorId", id))
    plids?.forEach((id) => p.append("pipelineId", id))
    return `/reports?${p.toString()}`
  }

  const currentRangeStr = range === "custom" ? "custom" : range

  function applyRange(r: string) {
    setRange(r)
    if (r === "custom") return
    router.push(buildUrl(r, undefined, undefined, practiceIds, doctorIds, pipelineIds))
  }

  function applyCustom() {
    if (!customFrom || !customTo) return
    router.push(buildUrl("custom", customFrom, customTo, practiceIds, doctorIds, pipelineIds))
  }

  function togglePractice(id: string) {
    const next = practiceIds.includes(id) ? practiceIds.filter((x) => x !== id) : [...practiceIds, id]
    router.push(buildUrl(currentRangeStr, customFrom || undefined, customTo || undefined, next, doctorIds, pipelineIds))
  }

  function toggleDoctor(id: string) {
    const next = doctorIds.includes(id) ? doctorIds.filter((x) => x !== id) : [...doctorIds, id]
    router.push(buildUrl(currentRangeStr, customFrom || undefined, customTo || undefined, practiceIds, next, pipelineIds))
  }

  function togglePipeline(id: string) {
    const next = pipelineIds.includes(id) ? pipelineIds.filter((x) => x !== id) : [...pipelineIds, id]
    router.push(buildUrl(currentRangeStr, customFrom || undefined, customTo || undefined, practiceIds, doctorIds, next))
  }

  function clearPractices() {
    router.push(buildUrl(currentRangeStr, customFrom || undefined, customTo || undefined, [], doctorIds, pipelineIds))
  }

  function clearDoctors() {
    router.push(buildUrl(currentRangeStr, customFrom || undefined, customTo || undefined, practiceIds, [], pipelineIds))
  }

  function clearPipelines() {
    router.push(buildUrl(currentRangeStr, customFrom || undefined, customTo || undefined, practiceIds, doctorIds, []))
  }

  // When practices are selected, scope provider dropdown to those practices
  const visibleDoctors = practiceIds.length > 0
    ? filterDoctors.filter((d) => practiceIds.includes(d.practiceId))
    : filterDoctors

  const maxMonthly = Math.max(...monthlyData.map((m) => m.count), 1)
  const maxStatus = Math.max(...Object.values(statusCountMap), 1)
  const maxPractice = Math.max(...practicesData.map((p) => p.count), 1)
  const maxProvider = Math.max(...providersData.map((p) => p.count), 1)
  const maxInsurance = Math.max(...insuranceData.map((i) => i.count), 1)

  const practiceParams = practiceIds.map((id) => `&practice=${id}`).join("")
  const doctorParams = doctorIds.map((id) => `&doctor=${id}`).join("")
  const pipelineParams = pipelineIds.map((id) => `&pipeline=${id}`).join("")
  const referralsBase = `/referrals?from=${rangeFromStr}&to=${rangeToStr}${practiceParams}${doctorParams}${pipelineParams}`

  return (
    <div className="p-6 space-y-6">
      {/* Header + range selector */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
          <p className="text-sm text-slate-500">Click any metric to view the matching referrals</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => applyRange(opt.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                range === opt.value
                  ? "bg-blue-600 text-white"
                  : "bg-white border text-slate-600 hover:bg-slate-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
          {range === "custom" && (
            <div className="flex items-center gap-2 mt-1 w-full">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                className="border rounded-md px-2 py-1.5 text-sm" />
              <span className="text-slate-400 text-sm">to</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                className="border rounded-md px-2 py-1.5 text-sm" />
              <button onClick={applyCustom} className="px-3 py-1.5 rounded-md text-sm bg-blue-600 text-white hover:bg-blue-700">
                Apply
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Entity filters */}
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
        <MultiSelectDropdown
          label="Provider"
          icon={<User className="h-3.5 w-3.5 shrink-0" />}
          options={visibleDoctors}
          selected={doctorIds}
          onToggle={toggleDoctor}
          onClear={clearDoctors}
          searchable={visibleDoctors.length > 8}
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
        {(practiceIds.length > 0 || doctorIds.length > 0 || pipelineIds.length > 0) && (
          <button
            onClick={() => router.push(buildUrl(currentRangeStr, customFrom || undefined, customTo || undefined, [], [], []))}
            className="h-9 px-2 text-sm text-zinc-400 hover:text-zinc-700 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          title="Total in Period"
          value={kpis.total}
          icon={<Users className="h-4 w-4 text-blue-500" />}
          href={referralsBase}
        />
        <KpiCard
          title="Completed"
          value={kpis.completed}
          icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
          href={`${referralsBase}&status=COMPLETED`}
          sub={`${kpis.conversionRate}% conversion`}
          subColor="text-green-600"
        />
        <KpiCard
          title="Scheduled"
          value={kpis.scheduled}
          icon={<Calendar className="h-4 w-4 text-purple-500" />}
          href={`${referralsBase}&status=SCHEDULED`}
          sub={`${kpis.scheduleRate}% schedule rate`}
          subColor="text-purple-600"
        />
        <KpiCard
          title="Pending Follow-up"
          value={kpis.pending}
          icon={<Clock className="h-4 w-4 text-yellow-500" />}
          href={`${referralsBase}&status=NEW&status=READY_FOR_CALL&status=CONTACTED`}
          sub="New + Contacted"
        />
        <KpiCard
          title="Conversion Rate"
          value={`${kpis.conversionRate}%`}
          icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
          sub="Completed / Total"
        />
        <KpiCard
          title="All Time Total"
          value={kpis.totalEver}
          icon={<BarChart2 className="h-4 w-4 text-slate-400" />}
          href="/referrals"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Chart */}
        <div className="bg-white border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Monthly Volume</h2>
          <div className="space-y-2.5">
            {monthlyData.map(({ label, year, month, count }) => {
              const mFrom = `${year}-${String(month).padStart(2, "0")}-01`
              const lastDay = new Date(year, month, 0).getDate()
              const mTo = `${year}-${String(month).padStart(2, "0")}-${lastDay}`
              return (
                <Link key={label} href={`/referrals?from=${mFrom}&to=${mTo}${practiceParams}${doctorParams}${pipelineParams}`} className="flex items-center gap-3 group">
                  <span className="text-xs text-slate-500 w-12 shrink-0">{label}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                    <div
                      className="h-6 bg-blue-500 group-hover:bg-blue-600 rounded-full flex items-center px-2 transition-all"
                      style={{ width: `${Math.max((count / maxMonthly) * 100, count > 0 ? 8 : 0)}%` }}
                    >
                      {count > 0 && <span className="text-xs text-white font-medium">{count}</span>}
                    </div>
                  </div>
                  {count === 0 && <span className="text-xs text-slate-400">0</span>}
                  <ChevronRight className="h-3 w-3 text-slate-300 group-hover:text-slate-500 shrink-0" />
                </Link>
              )
            })}
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="bg-white border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Status Breakdown</h2>
          <div className="space-y-2.5">
            {(Object.keys(statusLabels) as ReferralStatus[]).map((status) => {
              const count = statusCountMap[status] ?? 0
              return (
                <Link key={status} href={`${referralsBase}&status=${status}`} className="flex items-center gap-3 group">
                  <span className="text-xs text-slate-500 w-28 shrink-0">{statusLabels[status]}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                    <div
                      className={`h-6 ${statusColors[status]} rounded-full flex items-center px-2 transition-all group-hover:opacity-90`}
                      style={{ width: `${Math.max((count / maxStatus) * 100, count > 0 ? 8 : 0)}%` }}
                    >
                      {count > 0 && <span className="text-xs text-white font-medium">{count}</span>}
                    </div>
                  </div>
                  {count === 0 && <span className="text-xs text-slate-400">0</span>}
                  <ChevronRight className="h-3 w-3 text-slate-300 group-hover:text-slate-500 shrink-0" />
                </Link>
              )
            })}
          </div>
        </div>

        {/* Top Practices */}
        <div className="bg-white border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">Top Referring Practices</h2>
            <Link href="/referring-doctors" className="text-xs text-blue-600 hover:underline">View all</Link>
          </div>
          {practicesData.length === 0 ? (
            <p className="text-sm text-slate-400">No data in this period</p>
          ) : (
            <div className="space-y-2.5">
              {practicesData.map((p, i) => (
                <Link key={p.id} href={`/referrals?practice=${p.id}&from=${rangeFromStr}&to=${rangeToStr}`} className="flex items-center gap-3 group">
                  <span className="text-xs font-bold text-slate-400 w-5 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate group-hover:text-blue-600">{p.name}</p>
                    <div className="mt-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div className="h-1.5 bg-blue-400 rounded-full" style={{ width: `${(p.count / maxPractice) * 100}%` }} />
                    </div>
                  </div>
                  <span className="text-sm font-bold text-blue-600 shrink-0">{p.count}</span>
                  <ChevronRight className="h-3 w-3 text-slate-300 group-hover:text-slate-500 shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Top Providers */}
        <div className="bg-white border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">Top Referring Providers</h2>
          </div>
          {providersData.length === 0 ? (
            <p className="text-sm text-slate-400">No data in this period</p>
          ) : (
            <div className="space-y-2.5">
              {providersData.map((d, i) => (
                <Link key={d.id} href={`/referring-doctors/${d.id}`} className="flex items-center gap-3 group">
                  <span className="text-xs font-bold text-slate-400 w-5 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate group-hover:text-blue-600">{d.name}</p>
                    <p className="text-xs text-slate-400 truncate">{d.practiceName ?? d.specialty ?? ""}</p>
                    <div className="mt-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div className="h-1.5 bg-purple-400 rounded-full" style={{ width: `${(d.count / maxProvider) * 100}%` }} />
                    </div>
                  </div>
                  <span className="text-sm font-bold text-purple-600 shrink-0">{d.count}</span>
                  <ChevronRight className="h-3 w-3 text-slate-300 group-hover:text-slate-500 shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Insurance Breakdown */}
        {insuranceData.length > 0 && (
          <div className="bg-white border rounded-xl p-5 lg:col-span-2">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Insurance Breakdown</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {insuranceData.map((ins) => (
                <div key={ins.name} className="flex items-center gap-3">
                  <span className="text-xs text-slate-600 w-40 shrink-0 truncate">{ins.name}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                    <div
                      className="h-5 bg-teal-500 rounded-full flex items-center px-2"
                      style={{ width: `${Math.max((ins.count / maxInsurance) * 100, ins.count > 0 ? 10 : 0)}%` }}
                    >
                      {ins.count > 0 && <span className="text-xs text-white font-medium">{ins.count}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
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

  const filtered = searchable && search.trim()
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

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  title,
  value,
  icon,
  sub,
  subColor = "text-slate-400",
  href,
}: {
  title: string
  value: number | string
  icon: React.ReactNode
  sub?: string
  subColor?: string
  href?: string
}) {
  const inner = (
    <div className={`bg-white border rounded-xl p-4 ${href ? "hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide leading-tight">{title}</span>
        {icon}
      </div>
      <p className="text-3xl font-bold text-slate-900">{value}</p>
      {sub && <p className={`text-xs mt-1 ${subColor}`}>{sub}</p>}
    </div>
  )
  if (href) return <Link href={href}>{inner}</Link>
  return inner
}
