"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Download, RefreshCw, Loader2, AlertTriangle, CheckCircle2, PlugZap } from "lucide-react"
import { runIntakeBackfill, type ReferralSourceReport } from "@/app/actions/intakeq"
import { cn } from "@/lib/utils"

function lastWeekRange(): { start: string; end: string } {
  const now = new Date()
  const end = new Date(now); end.setDate(end.getDate() - now.getDay()) // last Sunday-ish
  const start = new Date(end); start.setDate(start.getDate() - 7)
  return { start: start.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) }
}

export default function IntakeqReferralReport({ initial, canEdit }: { initial: ReferralSourceReport; canEdit: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const def = lastWeekRange()
  const [start, setStart] = useState(def.start)
  const [end, setEnd] = useState(def.end)
  const [msg, setMsg] = useState<string | null>(null)

  const { weeks, categories, grid } = initial
  const colTotals = weeks.map((_, wi) => categories.reduce((s, c) => s + (grid[c]?.[wi] ?? 0), 0))
  const rowTotal = (c: string) => (grid[c] ?? []).reduce((s, n) => s + n, 0)
  const grandTotal = colTotals.reduce((s, n) => s + n, 0)

  function runBackfill() {
    setMsg(null)
    startTransition(async () => {
      const res = await runIntakeBackfill(start, end)
      if (res.error) { setMsg(res.error); return }
      setMsg(
        `Processed ${res.processed ?? 0} new submission${res.processed === 1 ? "" : "s"}` +
        ((res.remaining ?? 0) > 0 ? ` — ${res.remaining} still remaining, click again to continue.` : ` — all caught up.`)
      )
      router.refresh()
    })
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
      {!initial.configured ? (
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
          Connected · {initial.totalStored.toLocaleString()} submissions stored
          {initial.lastSubmittedAt && <span className="text-emerald-700">· last submission {new Date(initial.lastSubmittedAt).toLocaleDateString()}</span>}
        </div>
      )}

      {initial.hasUnmapped && (
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
            <button onClick={runBackfill} disabled={isPending || !initial.configured}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50">
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Backfill
            </button>
          </div>
        )}
        <button onClick={exportCsv}
          className="inline-flex items-center gap-1.5 h-8 px-3 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 ml-auto">
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
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
