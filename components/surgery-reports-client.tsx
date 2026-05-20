"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Stethoscope, CheckCircle2, Calendar, Clock, XCircle, AlertTriangle, Phone, BarChart2 } from "lucide-react"
import { SURGERY_STATUS_LABELS } from "@/lib/surgery-constants"

const STATUS_COLORS: Record<string, string> = {
  NEW:                  "bg-zinc-500",
  SCHEDULED:            "bg-blue-500",
  PENDING_CONFIRMATION: "bg-amber-500",
  PENDING_CLEARANCE:    "bg-orange-500",
  CANCELED:             "bg-red-500",
  COMPLETED:            "bg-green-500",
}

const OUTCOME_LABELS: Record<string, string> = {
  NO_ANSWER: "No Answer",
  VOICEMAIL: "Voicemail",
  ANSWERED:  "Answered",
}

const RANGE_OPTIONS = [
  { value: "last_6m",   label: "Last 6 months" },
  { value: "this_month",label: "This month" },
  { value: "last_month",label: "Last month" },
  { value: "last_3m",   label: "Last 3 months" },
  { value: "last_year", label: "Last 12 months" },
  { value: "all",       label: "All time" },
  { value: "custom",    label: "Custom range" },
]

interface Props {
  kpis: {
    total: number
    completed: number
    scheduled: number
    pendingClearance: number
    pendingConfirmation: number
    canceled: number
    newCount: number
    completionRate: number
    expiringSoon: number
    totalEver: number
  }
  monthlyData: { label: string; count: number }[]
  statusMap: Record<string, number>
  facilitiesData: { name: string; count: number }[]
  providersData: { name: string; count: number }[]
  diagnosisData: { name: string; count: number }[]
  callOutcomes: { outcome: string; count: number }[]
  currentRange: string
  currentFrom?: string
  currentTo?: string
}

function KpiCard({
  title, value, icon, sub, subColor,
}: {
  title: string
  value: number | string
  icon: React.ReactNode
  sub?: string
  subColor?: string
}) {
  return (
    <div className="bg-white rounded-xl border p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{title}</p>
        {icon}
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className={`text-xs ${subColor ?? "text-slate-400"}`}>{sub}</p>}
    </div>
  )
}

function BarRow({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-48 text-sm text-slate-700 truncate shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-sm font-semibold text-slate-700 shrink-0">{count}</span>
    </div>
  )
}

export default function SurgeryReportsClient({
  kpis, monthlyData, statusMap, facilitiesData, providersData, diagnosisData, callOutcomes,
  currentRange, currentFrom, currentTo,
}: Props) {
  const router = useRouter()
  const [range, setRange] = useState(currentRange)
  const [customFrom, setCustomFrom] = useState(currentFrom ?? "")
  const [customTo, setCustomTo] = useState(currentTo ?? "")

  function buildUrl(r: string, from?: string, to?: string) {
    const p = new URLSearchParams()
    if (from && to) { p.set("from", from); p.set("to", to); p.set("range", "custom") }
    else p.set("range", r)
    return `/surgery/reports?${p.toString()}`
  }

  function applyRange(r: string) {
    setRange(r)
    if (r === "custom") return
    router.push(buildUrl(r))
  }

  function applyCustom() {
    if (!customFrom || !customTo) return
    router.push(buildUrl("custom", customFrom, customTo))
  }

  const maxMonthly = Math.max(...monthlyData.map((m) => m.count), 1)
  const maxFacility = Math.max(...facilitiesData.map((f) => f.count), 1)
  const maxProvider = Math.max(...providersData.map((p) => p.count), 1)
  const maxDiagnosis = Math.max(...diagnosisData.map((d) => d.count), 1)
  const totalCalls = callOutcomes.reduce((s, o) => s + o.count, 0)

  const allStatuses = ["NEW", "SCHEDULED", "PENDING_CONFIRMATION", "PENDING_CLEARANCE", "CANCELED", "COMPLETED"]
  const maxStatus = Math.max(...allStatuses.map((s) => statusMap[s] ?? 0), 1)

  return (
    <div className="p-6 space-y-6">
      {/* Header + range selector */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Surgery Reports</h1>
          <p className="text-sm text-slate-500">{kpis.totalEver} total cases all time</p>
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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        <KpiCard title="Total in Period" value={kpis.total}
          icon={<Stethoscope className="h-4 w-4 text-slate-400" />} />
        <KpiCard title="Completed" value={kpis.completed}
          icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
          sub={`${kpis.completionRate}% completion rate`} subColor="text-green-600" />
        <KpiCard title="Scheduled" value={kpis.scheduled}
          icon={<Calendar className="h-4 w-4 text-blue-500" />} />
        <KpiCard title="Pending Clearance" value={kpis.pendingClearance}
          icon={<Clock className="h-4 w-4 text-orange-500" />} />
        <KpiCard title="Canceled" value={kpis.canceled}
          icon={<XCircle className="h-4 w-4 text-red-500" />} />
        <KpiCard title="New" value={kpis.newCount}
          icon={<BarChart2 className="h-4 w-4 text-zinc-400" />} />
        <KpiCard title="Pending Confirmation" value={kpis.pendingConfirmation}
          icon={<Clock className="h-4 w-4 text-amber-500" />} />
        <KpiCard title="Expiring ≤ 30 Days" value={kpis.expiringSoon}
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
          sub="Active cases only" subColor={kpis.expiringSoon > 0 ? "text-amber-600" : "text-slate-400"} />
      </div>

      {/* Monthly trend + Status distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly trend */}
        <div className="bg-white border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Cases Created — Monthly</h2>
          <div className="space-y-1">
            {monthlyData.map((m) => (
              <div key={m.label} className="flex items-end gap-2">
                <span className="w-14 text-xs text-slate-500 shrink-0">{m.label}</span>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 h-6 bg-slate-50 rounded overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded transition-all"
                      style={{ width: `${maxMonthly > 0 ? (m.count / maxMonthly) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-xs font-semibold text-slate-700">{m.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Status distribution */}
        <div className="bg-white border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Status Distribution</h2>
          <div className="space-y-0.5">
            {allStatuses.map((s) => (
              <BarRow
                key={s}
                label={SURGERY_STATUS_LABELS[s] ?? s}
                count={statusMap[s] ?? 0}
                max={maxStatus}
                color={STATUS_COLORS[s] ?? "bg-zinc-400"}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Facilities + Ordering Providers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Cases by Facility</h2>
          {facilitiesData.length === 0 ? (
            <p className="text-sm text-slate-400">No facility data yet.</p>
          ) : (
            <div className="space-y-0.5">
              {facilitiesData.map((f) => (
                <BarRow key={f.name} label={f.name} count={f.count} max={maxFacility} color="bg-blue-400" />
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Cases by Ordering Provider</h2>
          {providersData.length === 0 ? (
            <p className="text-sm text-slate-400">No provider data yet.</p>
          ) : (
            <div className="space-y-0.5">
              {providersData.map((p) => (
                <BarRow key={p.name} label={p.name} count={p.count} max={maxProvider} color="bg-violet-400" />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top Diagnoses + Call Outcomes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Top Diagnoses</h2>
          {diagnosisData.length === 0 ? (
            <p className="text-sm text-slate-400">No diagnosis data yet.</p>
          ) : (
            <div className="space-y-0.5">
              {diagnosisData.map((d) => (
                <BarRow key={d.name} label={d.name} count={d.count} max={maxDiagnosis} color="bg-teal-400" />
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Call Attempt Outcomes</h2>
          {totalCalls === 0 ? (
            <p className="text-sm text-slate-400">No call attempts recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {callOutcomes.map((o) => {
                const pct = Math.round((o.count / totalCalls) * 100)
                return (
                  <div key={o.outcome} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-slate-700">
                        <Phone className="h-3.5 w-3.5 text-slate-400" />
                        {OUTCOME_LABELS[o.outcome] ?? o.outcome}
                      </span>
                      <span className="font-semibold text-slate-900">{o.count} <span className="font-normal text-slate-400">({pct}%)</span></span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          o.outcome === "ANSWERED" ? "bg-green-500" :
                          o.outcome === "VOICEMAIL" ? "bg-amber-500" : "bg-slate-400"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
              <p className="text-xs text-slate-400 pt-1">{totalCalls} total call attempts (all time)</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
