"use client"

import { useRouter } from "next/navigation"
import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { ReferralStatus } from "@prisma/client"
import { Users, CheckCircle2, Calendar, Clock, TrendingUp, BarChart2, ChevronRight, ChevronDown, Check, Building2, User } from "lucide-react"

type Granularity = "daily" | "weekly" | "monthly" | "yearly"

interface Bucket {
  label: string
  count: number
  fromStr: string
  toStr: string
}

function computeBuckets(rawDates: string[], gran: Granularity, start: Date, end: Date): Bucket[] {
  const dates = rawDates.map((d) => new Date(d))
  const buckets: Bucket[] = []

  if (gran === "daily") {
    const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate())
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate())
    while (cur <= endDay) {
      const bs = new Date(cur)
      const be = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 23, 59, 59)
      buckets.push({
        label: bs.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        count: dates.filter((d) => d >= bs && d <= be).length,
        fromStr: bs.toISOString().slice(0, 10),
        toStr: be.toISOString().slice(0, 10),
      })
      cur.setDate(cur.getDate() + 1)
    }
  } else if (gran === "weekly") {
    const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate())
    const dow = cur.getDay()
    cur.setDate(cur.getDate() - (dow === 0 ? 6 : dow - 1))
    while (cur <= end) {
      const bs = new Date(cur)
      const be = new Date(cur)
      be.setDate(be.getDate() + 6)
      be.setHours(23, 59, 59)
      buckets.push({
        label: bs.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        count: dates.filter((d) => d >= bs && d <= be).length,
        fromStr: bs.toISOString().slice(0, 10),
        toStr: be.toISOString().slice(0, 10),
      })
      cur.setDate(cur.getDate() + 7)
    }
  } else if (gran === "monthly") {
    const cur = new Date(start.getFullYear(), start.getMonth(), 1)
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1)
    while (cur <= endMonth) {
      const bs = new Date(cur)
      const be = new Date(cur.getFullYear(), cur.getMonth() + 1, 0, 23, 59, 59)
      buckets.push({
        label: bs.toLocaleString("default", { month: "short", year: "2-digit" }),
        count: dates.filter((d) => d >= bs && d <= be).length,
        fromStr: bs.toISOString().slice(0, 10),
        toStr: be.toISOString().slice(0, 10),
      })
      cur.setMonth(cur.getMonth() + 1)
    }
  } else {
    const cur = new Date(start.getFullYear(), 0, 1)
    while (cur.getFullYear() <= end.getFullYear()) {
      const bs = new Date(cur)
      const be = new Date(cur.getFullYear(), 11, 31, 23, 59, 59)
      buckets.push({
        label: String(bs.getFullYear()),
        count: dates.filter((d) => d >= bs && d <= be).length,
        fromStr: bs.toISOString().slice(0, 10),
        toStr: be.toISOString().slice(0, 10),
      })
      cur.setFullYear(cur.getFullYear() + 1)
    }
  }

  return buckets
}

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
  rawDates: string[]
  rangeStart: string
  rangeEnd: string
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
  practiceMode: "any" | "none"
  doctorMode: "any" | "none"
  pipelineMode: "any" | "none"
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
  rawDates,
  rangeStart,
  rangeEnd,
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
  practiceMode: initialPracticeMode,
  doctorMode: initialDoctorMode,
  pipelineMode: initialPipelineMode,
  filterPractices,
  filterDoctors,
  filterPipelines,
}: Props) {
  const router = useRouter()
  const [range, setRange] = useState(currentRange)
  const [customFrom, setCustomFrom] = useState(currentFrom ?? "")
  const [customTo, setCustomTo] = useState(currentTo ?? "")
  const [granularity, setGranularity] = useState<Granularity>("monthly")
  const [practiceMode, setPracticeMode] = useState<"any" | "none">(initialPracticeMode)
  const [doctorMode, setDoctorMode] = useState<"any" | "none">(initialDoctorMode)
  const [pipelineMode, setPipelineMode] = useState<"any" | "none">(initialPipelineMode)

  function buildUrl(
    r: string, from?: string, to?: string,
    pids?: string[], dids?: string[], plids?: string[],
    pm?: "any" | "none", dm?: "any" | "none", plm?: "any" | "none"
  ) {
    const p = new URLSearchParams()
    if (from && to) { p.set("from", from); p.set("to", to); p.set("range", "custom") }
    else p.set("range", r)
    pids?.forEach((id) => p.append("practiceId", id))
    dids?.forEach((id) => p.append("doctorId", id))
    plids?.forEach((id) => p.append("pipelineId", id))
    const pMode = pm ?? practiceMode
    const dMode = dm ?? doctorMode
    const plMode = plm ?? pipelineMode
    if (pMode !== "any") p.set("practiceMode", pMode)
    if (dMode !== "any") p.set("doctorMode", dMode)
    if (plMode !== "any") p.set("pipelineMode", plMode)
    return `/reports/referral-analytics?${p.toString()}`
  }

  const currentRangeStr = range === "custom" ? "custom" : range
  const fromArg = customFrom || undefined
  const toArg = customTo || undefined

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
    router.push(buildUrl(currentRangeStr, fromArg, toArg, next, doctorIds, pipelineIds))
  }

  function toggleDoctor(id: string) {
    const next = doctorIds.includes(id) ? doctorIds.filter((x) => x !== id) : [...doctorIds, id]
    router.push(buildUrl(currentRangeStr, fromArg, toArg, practiceIds, next, pipelineIds))
  }

  function togglePipeline(id: string) {
    const next = pipelineIds.includes(id) ? pipelineIds.filter((x) => x !== id) : [...pipelineIds, id]
    router.push(buildUrl(currentRangeStr, fromArg, toArg, practiceIds, doctorIds, next))
  }

  function clearPractices() {
    router.push(buildUrl(currentRangeStr, fromArg, toArg, [], doctorIds, pipelineIds, "any"))
  }

  function clearDoctors() {
    router.push(buildUrl(currentRangeStr, fromArg, toArg, practiceIds, [], pipelineIds, undefined, "any"))
  }

  function clearPipelines() {
    router.push(buildUrl(currentRangeStr, fromArg, toArg, practiceIds, doctorIds, [], undefined, undefined, "any"))
  }

  function changePracticeMode(m: "any" | "none") {
    setPracticeMode(m)
    router.push(buildUrl(currentRangeStr, fromArg, toArg, practiceIds, doctorIds, pipelineIds, m))
  }

  function changeDoctorMode(m: "any" | "none") {
    setDoctorMode(m)
    router.push(buildUrl(currentRangeStr, fromArg, toArg, practiceIds, doctorIds, pipelineIds, undefined, m))
  }

  function changePipelineMode(m: "any" | "none") {
    setPipelineMode(m)
    router.push(buildUrl(currentRangeStr, fromArg, toArg, practiceIds, doctorIds, pipelineIds, undefined, undefined, m))
  }

  // When practices are selected, scope provider dropdown to those practices
  const visibleDoctors = practiceIds.length > 0
    ? filterDoctors.filter((d) => practiceIds.includes(d.practiceId))
    : filterDoctors

  const maxStatus = Math.max(...Object.values(statusCountMap), 1)
  const maxPractice = Math.max(...practicesData.map((p) => p.count), 1)
  const maxProvider = Math.max(...providersData.map((p) => p.count), 1)
  const maxInsurance = Math.max(...insuranceData.map((i) => i.count), 1)

  const practiceParams = practiceIds.map((id) => `&practice=${id}`).join("")
  const doctorParams = doctorIds.map((id) => `&doctor=${id}`).join("")
  const pipelineParams = pipelineIds.map((id) => `&pipeline=${id}`).join("")
  const referralsBase = `/referrals?from=${rangeFromStr}&to=${rangeToStr}${practiceParams}${doctorParams}${pipelineParams}`

  // Drill into the referrals filtered by an insurance — carried via the advanced
  // `filter` param the referrals list decodes (insuranceProvider is a filter field).
  const insuranceHref = (name: string) => {
    const state = {
      combinator: "AND",
      groups: [{ id: "g1", combinator: "AND", conditions: [
        { id: "c1", field: "insuranceProvider", operator: "is", value: name },
      ] }],
    }
    return `${referralsBase}&filter=${encodeURIComponent(JSON.stringify(state))}`
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header + range selector */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
            <Link href="/reports/builder" className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-zinc-200 rounded-lg text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 transition-all">
              Report Builder
            </Link>
            <Link href="/reports/dashboard" className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-zinc-200 rounded-lg text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 transition-all">
              Dashboard
            </Link>
            <Link href="/reports/builder/classic" className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-zinc-400 hover:text-zinc-600 transition-all">
              Classic
            </Link>
          </div>
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
          mode={practiceMode}
          onModeChange={changePracticeMode}
        />
        <MultiSelectDropdown
          label="Provider"
          icon={<User className="h-3.5 w-3.5 shrink-0" />}
          options={visibleDoctors}
          selected={doctorIds}
          onToggle={toggleDoctor}
          onClear={clearDoctors}
          searchable={visibleDoctors.length > 8}
          mode={doctorMode}
          onModeChange={changeDoctorMode}
        />
        {filterPipelines.length > 0 && (
          <MultiSelectDropdown
            label="Pipeline"
            icon={<ChevronRight className="h-3.5 w-3.5 shrink-0" />}
            options={filterPipelines.map((p) => ({ id: p.id, label: p.name }))}
            selected={pipelineIds}
            onToggle={togglePipeline}
            onClear={clearPipelines}
            mode={pipelineMode}
            onModeChange={changePipelineMode}
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
        {/* Volume Line Chart */}
        <div className="bg-white border rounded-xl p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">Referral Volume</h2>
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
              {(["daily", "weekly", "monthly", "yearly"] as Granularity[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setGranularity(g)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
                    granularity === g ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <LineChart
            buckets={computeBuckets(rawDates, granularity, new Date(rangeStart), new Date(rangeEnd + "T23:59:59"))}
            filterParams={`${practiceParams}${doctorParams}${pipelineParams}`}
            onNavigate={(from, to) => router.push(`/referrals?from=${from}&to=${to}${practiceParams}${doctorParams}${pipelineParams}`)}
          />
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
            <Link href="/practices?sort=referrals" className="text-xs text-blue-600 hover:underline">View all</Link>
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
                <Link key={ins.name} href={insuranceHref(ins.name)} className="flex items-center gap-3 group">
                  <span className="text-xs text-slate-600 w-40 shrink-0 truncate group-hover:text-blue-600">{ins.name}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                    <div
                      className="h-5 bg-teal-500 rounded-full flex items-center px-2"
                      style={{ width: `${Math.max((ins.count / maxInsurance) * 100, ins.count > 0 ? 10 : 0)}%` }}
                    >
                      {ins.count > 0 && <span className="text-xs text-white font-medium">{ins.count}</span>}
                    </div>
                  </div>
                  <ChevronRight className="h-3 w-3 text-slate-300 group-hover:text-slate-500 shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Line Chart ───────────────────────────────────────────────────────────────

function LineChart({
  buckets,
  onNavigate,
}: {
  buckets: Bucket[]
  filterParams: string
  onNavigate: (from: string, to: string) => void
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const n = buckets.length

  if (n === 0) return <p className="text-sm text-slate-400 py-8 text-center">No data in this period.</p>

  const W = 600, H = 200
  const padL = 44, padR = 16, padT = 16, padB = 36
  const cW = W - padL - padR
  const cH = H - padT - padB
  const maxCount = Math.max(...buckets.map((b) => b.count), 1)

  function xp(i: number) { return padL + (n <= 1 ? cW / 2 : (i / (n - 1)) * cW) }
  function yp(c: number) { return padT + cH - (c / maxCount) * cH }

  const pts = buckets.map((b, i) => `${xp(i)},${yp(b.count)}`).join(" ")
  const area = [
    `M ${xp(0)} ${padT + cH}`,
    ...buckets.map((b, i) => `L ${xp(i)} ${yp(b.count)}`),
    `L ${xp(n - 1)} ${padT + cH}`,
    "Z",
  ].join(" ")

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    y: padT + cH - t * cH,
    label: Math.round(t * maxCount),
  }))

  const maxLabels = Math.min(n, 10)
  const labelIndices = new Set<number>()
  if (n <= maxLabels) {
    for (let i = 0; i < n; i++) labelIndices.add(i)
  } else {
    for (let k = 0; k < maxLabels; k++) {
      labelIndices.add(Math.round((k * (n - 1)) / (maxLabels - 1)))
    }
  }

  const bw = n > 1 ? cW / (n - 1) : cW
  const hb = hovered !== null ? buckets[hovered] : null

  return (
    <div className="relative select-none">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 200 }}
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          <linearGradient id="lineAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y-axis grid + labels */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={t.y} x2={W - padR} y2={t.y} stroke="#f1f5f9" strokeWidth="1" />
            <text x={padL - 6} y={t.y + 4} textAnchor="end" fill="#94a3b8" fontSize="9">{t.label}</text>
          </g>
        ))}

        {/* Area fill */}
        <path d={area} fill="url(#lineAreaGrad)" />

        {/* Line */}
        <polyline points={pts} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* Dots */}
        {buckets.map((b, i) => (
          <circle key={i} cx={xp(i)} cy={yp(b.count)} r={hovered === i ? 4.5 : 2.5}
            fill={hovered === i ? "#2563eb" : "#3b82f6"} stroke="white" strokeWidth="1.5" />
        ))}

        {/* Hover vertical line */}
        {hovered !== null && (
          <line x1={xp(hovered)} y1={padT} x2={xp(hovered)} y2={padT + cH}
            stroke="#3b82f6" strokeWidth="1" strokeDasharray="3,2" opacity="0.4" />
        )}

        {/* Hover capture rects */}
        {buckets.map((b, i) => (
          <rect key={i} x={xp(i) - bw / 2} y={padT} width={bw} height={cH}
            fill="transparent" style={{ cursor: "pointer" }}
            onMouseEnter={() => setHovered(i)}
            onClick={() => onNavigate(b.fromStr, b.toStr)}
          />
        ))}

        {/* X-axis labels */}
        {buckets.map((b, i) =>
          labelIndices.has(i) ? (
            <text key={i} x={xp(i)} y={H - 6} textAnchor="middle" fill="#94a3b8" fontSize="9">{b.label}</text>
          ) : null
        )}
      </svg>

      {/* Floating tooltip */}
      {hb !== null && hovered !== null && (
        <div
          className="absolute pointer-events-none bg-slate-900 text-white text-xs rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap z-10"
          style={{
            left: `${(xp(hovered) / W) * 100}%`,
            top: `${(yp(hb.count) / H) * 100}%`,
            transform: "translate(-50%, calc(-100% - 8px))",
          }}
        >
          <p className="font-semibold">{hb.count} referral{hb.count !== 1 ? "s" : ""}</p>
          <p className="text-white/60 text-[10px]">{hb.label}</p>
        </div>
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
  mode,
  onModeChange,
}: {
  label: string
  icon?: React.ReactNode
  options: { id: string; label: string }[]
  selected: string[]
  onToggle: (id: string) => void
  onClear: () => void
  searchable?: boolean
  mode?: "any" | "none"
  onModeChange?: (m: "any" | "none") => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isExclude = mode === "none"
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
          active && isExclude
            ? "bg-rose-600 text-white border-rose-600 hover:bg-rose-700"
            : active
            ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
            : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300 hover:text-zinc-900"
        }`}
      >
        {icon}
        <span>{label}</span>
        {active && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-white/20 text-xs font-bold tabular-nums">
            {isExclude ? "≠" : ""}{selected.length}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full mt-2 left-0 z-50 min-w-[200px] max-w-[280px] bg-white border border-zinc-200 rounded-xl shadow-xl overflow-hidden">
          {onModeChange && (
            <div className="flex items-center gap-1 p-2 border-b border-zinc-100">
              <button
                onClick={() => onModeChange("any")}
                className={`flex-1 h-7 text-xs rounded-md font-medium transition-colors ${!isExclude ? "bg-blue-600 text-white" : "text-zinc-500 hover:bg-zinc-50"}`}
              >
                Any of
              </button>
              <button
                onClick={() => onModeChange("none")}
                className={`flex-1 h-7 text-xs rounded-md font-medium transition-colors ${isExclude ? "bg-rose-600 text-white" : "text-zinc-500 hover:bg-zinc-50"}`}
              >
                None of
              </button>
            </div>
          )}
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
                    selected.includes(opt.id)
                      ? isExclude ? "bg-rose-600 border-rose-600" : "bg-blue-600 border-blue-600"
                      : "border-zinc-300"
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
