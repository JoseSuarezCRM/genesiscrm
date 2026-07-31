"use client"

import { useState, useRef } from "react"
import { Download, RefreshCw, Loader2, AlertTriangle, CheckCircle2, PlugZap, Square, CalendarRange } from "lucide-react"
import { runIntakeBackfill, getReferralSourceReport, type ReferralSourceReport } from "@/app/actions/intakeq"
import type { Granularity } from "@/lib/intakeq-weeks"
import { cn } from "@/lib/utils"

const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "quarter", label: "Quarterly" },
  { value: "year", label: "Yearly" },
]

function lastWeekRange(): { start: string; end: string } {
  const now = new Date()
  const end = new Date(now); end.setDate(end.getDate() - now.getDay()) // last Sunday-ish
  const start = new Date(end); start.setDate(start.getDate() - 7)
  return { start: start.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) }
}

export default function IntakeqReferralReport({ initial, canEdit }: { initial: ReferralSourceReport; canEdit: boolean }) {
  const def = lastWeekRange()
  const [start, setStart] = useState(def.start)
  const [end, setEnd] = useState(def.end)
  const [msg, setMsg] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [autoContinue, setAutoContinue] = useState(true)
  const cancelRef = useRef(false)
  const [report, setReport] = useState(initial)
  const [granularity, setGranularity] = useState<Granularity>(initial.granularity)
  const [loadingReport, setLoadingReport] = useState(false)

  async function reloadReport(g: Granularity = granularity) {
    setLoadingReport(true)
    try { setReport(await getReferralSourceReport(g)) } finally { setLoadingReport(false) }
  }
  function changeGranularity(g: Granularity) { setGranularity(g); reloadReport(g) }

  const { weeks, categories, grid } = report
  const colTotals = weeks.map((_, wi) => categories.reduce((s, c) => s + (grid[c]?.[wi] ?? 0), 0))
  const rowTotal = (c: string) => (grid[c] ?? []).reduce((s, n) => s + n, 0)
  const grandTotal = colTotals.reduce((s, n) => s + n, 0)

  async function runBackfill() {
    if (running) return
    setMsg(null); setRunning(true); cancelRef.current = false
    let total = 0
    try {
      // IntakeQ's 10 req/min limit means each call processes a batch. With
      // "Run until complete" on, we keep going through the batches; otherwise
      // a single batch runs. Stop cancels between batches.
      for (let i = 0; i < 2000; i++) {
        // Checked at the TOP so Stop halts before starting another batch.
        if (cancelRef.current) { setMsg(`Stopped. Processed ${total} this run.`); break }

        const res = await runIntakeBackfill(start, end)
        if (res.error) { setMsg(res.error); break }
        total += res.processed ?? 0
        const remaining = res.remaining ?? 0
        await reloadReport()

        if (cancelRef.current) { setMsg(`Stopped. Processed ${total} this run.`); break }

        // Hit IntakeQ's 10/min limit — wait a minute, then keep going (Stop-aware).
        if (res.rateLimited) {
          if (!autoContinue) { setMsg(`Processed ${total}. Hit IntakeQ’s rate limit — click Backfill to continue.`); break }
          for (let s = 60; s > 0 && !cancelRef.current; s--) {
            setMsg(`Processed ${total} so far. Waiting ${s}s for IntakeQ’s rate limit…`)
            await new Promise((r) => setTimeout(r, 1000))
          }
          continue // top-of-loop cancel check will stop if Stop was pressed
        }
        if (remaining <= 0) { setMsg(`Done — processed ${total} new submission${total === 1 ? "" : "s"}.`); break }
        if ((res.processed ?? 0) === 0) { setMsg(`Processed ${total}. ${remaining} left but nothing new was ingested — check the date range.`); break }
        if (!autoContinue) { setMsg(`Processed ${total}. ${remaining} remaining — click Backfill again to continue.`); break }
        setMsg(`Processing… ${total} done, ${remaining} remaining. You can leave this open.`)
      }
    } finally {
      setRunning(false)
    }
  }

  function exportCsv() {
    const header = ["Referral Source", ...weeks.map((w) => w.label), "Total"]
    const lines = categories.map((c) => [c, ...weeks.map((_, wi) => grid[c]?.[wi] ?? 0), rowTotal(c)])
    const totals = ["Total", ...colTotals, grandTotal]
    const esc = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const csv = [header, ...lines, totals].map((r) => r.map(esc).join(",")).join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    const a = document.createElement("a")
    a.href = url; a.download = `referral-sources-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Connection status */}
      {!report.configured ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3">
          <PlugZap className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 space-y-1">
            <p className="font-semibold">Not connected yet.</p>
            <p>Add the <code className="text-xs bg-amber-100 px-1 py-0.5 rounded">INTAKEQ_API_KEY</code> environment variable in Vercel, then set IntakeQ’s Submission Webhook to
              <code className="text-xs bg-amber-100 px-1 py-0.5 rounded ml-1">/api/webhooks/intakeq?token=…</code>. New submissions flow in automatically; use Backfill for history.</p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Connected · {report.totalStored.toLocaleString()} submissions stored
          {report.lastSubmittedAt && <span className="text-emerald-700">· last submission {new Date(report.lastSubmittedAt).toLocaleDateString()}</span>}
        </div>
      )}

      {report.hasUnmapped && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 flex items-center gap-2 text-sm text-orange-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Some answers didn’t match a known category. Tell me the exact wording and I’ll map them.
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-end gap-3">
        {canEdit && (
          <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Backfill from</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">to</label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white" />
            </div>
            <button onClick={runBackfill} disabled={running || !report.configured}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50">
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Backfill
            </button>
            {running && autoContinue && (
              <button onClick={() => { cancelRef.current = true }}
                className="inline-flex items-center gap-1.5 h-8 px-3 text-sm font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100">
                <Square className="h-3 w-3" /> Stop
              </button>
            )}
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 pb-1.5 ml-1" title="Keep going through IntakeQ's rate-limited batches until the whole range is done">
              <input type="checkbox" checked={autoContinue} onChange={(e) => setAutoContinue(e.target.checked)} disabled={running} className="rounded border-slate-300" />
              Run until complete
            </label>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 text-sm text-slate-600">
            <CalendarRange className="h-3.5 w-3.5 text-slate-400" />
            <select value={granularity} onChange={(e) => changeGranularity(e.target.value as Granularity)} disabled={loadingReport}
              className="h-8 pl-2 pr-7 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-zinc-400">
              {GRANULARITIES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
            {loadingReport && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
          </div>
          <button onClick={exportCsv}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>
      </div>
      {msg && <p className="text-xs text-slate-600">{msg}</p>}

      {/* Grid */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left font-semibold text-slate-600 px-3 py-2 sticky left-0 bg-slate-50 z-10">Referral Source</th>
              {weeks.map((w) => <th key={w.start} className="text-right font-semibold text-slate-600 px-3 py-2 whitespace-nowrap">{w.label}</th>)}
              <th className="text-right font-semibold text-slate-700 px-3 py-2 bg-slate-100">Total</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c} className="border-b border-slate-100 hover:bg-slate-50/60">
                <td className="text-left text-slate-800 px-3 py-1.5 font-medium sticky left-0 bg-white z-10 whitespace-nowrap">{c}</td>
                {weeks.map((w, wi) => {
                  const n = grid[c]?.[wi] ?? 0
                  return <td key={w.start} className={cn("text-right px-3 py-1.5 tabular-nums", n === 0 ? "text-slate-300" : "text-slate-800")}>{n === 0 ? "—" : n}</td>
                })}
                <td className="text-right px-3 py-1.5 tabular-nums font-semibold text-slate-800 bg-slate-50">{rowTotal(c)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
              <td className="text-left text-slate-700 px-3 py-2 sticky left-0 bg-slate-50 z-10">Total</td>
              {colTotals.map((n, wi) => <td key={wi} className="text-right px-3 py-2 tabular-nums text-slate-800">{n}</td>)}
              <td className="text-right px-3 py-2 tabular-nums text-slate-900 bg-slate-100">{grandTotal}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
