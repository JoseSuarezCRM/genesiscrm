"use client"

import { useState, useTransition, useRef } from "react"
import { matchAppointments, applyReconciliation, cleanupGenesisMrn } from "@/app/actions/reconcile"
import type { CsvRow, MatchResult, NoShowCandidate, AppliedRecord } from "@/app/actions/reconcile"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import {
  Upload,
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  FileText,
  Check,
  Calendar,
} from "lucide-react"

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = "", inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { cell += '"'; i++ } else inQuotes = !inQuotes
    } else if (ch === "," && !inQuotes) {
      row.push(cell.trim()); cell = ""
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && text[i + 1] === "\n") i++
      row.push(cell.trim()); rows.push(row); row = []; cell = ""
    } else { cell += ch }
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row) }
  return rows.filter((r) => r.some((c) => c !== ""))
}

function findCol(headers: string[], ...kw: string[]) {
  return headers.findIndex((h) => kw.some((k) => h.toLowerCase().includes(k.toLowerCase())))
}

function extractRows(raw: string[][]): CsvRow[] {
  if (raw.length < 2) return []
  const h = raw[0]
  const mrnIdx = findCol(h, "mrn"), nameIdx = findCol(h, "patient"), dateIdx = findCol(h, "visit date", "date")
  return raw.slice(1).map((r) => ({ mrn: r[mrnIdx] ?? "", patientName: r[nameIdx] ?? "", visitDate: r[dateIdx] ?? "" }))
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-slate-100 text-slate-600",
  READY_FOR_CALL: "bg-yellow-100 text-yellow-700",
  CONTACTED: "bg-blue-100 text-blue-700",
  SCHEDULED: "bg-purple-100 text-purple-700",
  COMPLETED: "bg-green-100 text-green-700",
  NO_SHOW: "bg-red-100 text-red-700",
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ReconcileManager() {
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<"setup" | "preview" | "done">("setup")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo]     = useState("")
  const [fileName, setFileName] = useState("")

  const [matches, setMatches]           = useState<MatchResult[]>([])
  const [noShowList, setNoShowList]     = useState<NoShowCandidate[]>([])
  const [unmatchedCsv, setUnmatchedCsv] = useState(0)

  // selected IDs per group (default all-checked)
  const [selCompleted, setSelCompleted] = useState<string[]>([])
  const [selNoShow, setSelNoShow]       = useState<string[]>([])

  const [applied, setApplied]   = useState<AppliedRecord[]>([])
  const [error, setError]       = useState<string | null>(null)
  const [cleanupMsg, setCleanupMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function reset() {
    setStep("setup"); setFileName(""); setMatches([]); setNoShowList([])
    setSelCompleted([]); setSelNoShow([]); setApplied([])
  }

  function handleFile(file: File) {
    if (!dateFrom || !dateTo) { setError("Select a date range before uploading."); return }
    if (new Date(dateFrom) > new Date(dateTo)) { setError("Start date must be before end date."); return }
    setError(null)
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const rows = extractRows(parseCsv(e.target?.result as string))
      if (!rows.length) { setError("Could not parse file. Save as CSV from Excel first."); return }
      startTransition(async () => {
        const result = await matchAppointments(rows, dateFrom, dateTo)
        setMatches(result.matches)
        setNoShowList(result.noShowCandidates)
        setUnmatchedCsv(result.unmatchedCsvRows)
        setSelCompleted(result.matches.map((m) => m.referralId))
        setSelNoShow(result.noShowCandidates.map((c) => c.referralId))
        setStep("preview")
      })
    }
    reader.readAsText(file)
  }

  function handleApply() {
    const matchMap: Record<string, { reportMrn: string; reportVisitDate: string }> = {}
    for (const m of matches) matchMap[m.referralId] = { reportMrn: m.csvRow.mrn, reportVisitDate: m.csvRow.visitDate }
    startTransition(async () => {
      const result = await applyReconciliation(selCompleted, selNoShow, matchMap)
      if (result.error) { setError(result.error); return }
      setApplied(result.applied ?? [])
      setStep("done")
    })
  }

  function handleCleanup() {
    startTransition(async () => {
      const r = await cleanupGenesisMrn()
      setCleanupMsg(r.error ? `Error: ${r.error}` : `Cleaned ${r.fixed} record${r.fixed !== 1 ? "s" : ""}.`)
    })
  }

  const completedCount = applied.filter((r) => r.newStatus === "COMPLETED").length
  const noShowCount    = applied.filter((r) => r.newStatus === "NO_SHOW").length

  return (
    <div className="space-y-6">

      {/* MRN Cleanup */}
      <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <div>
          <p className="text-sm font-medium text-amber-800">Fix existing Genesis MRN values</p>
          <p className="text-xs text-amber-600 mt-0.5">Strips "MRN: " prefix and non-digit chars from all records. Run once before first reconciliation.</p>
          {cleanupMsg && <p className="text-xs font-medium mt-1 text-green-700">{cleanupMsg}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={handleCleanup} disabled={isPending} className="ml-4 shrink-0">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="h-4 w-4 mr-2" />Clean Now</>}
        </Button>
      </div>

      {/* ── Setup: date range + file upload ─────────── */}
      {step === "setup" && (
        <div className="space-y-6">
          {/* Date range */}
          <div className="p-5 border border-slate-200 rounded-xl bg-white space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="h-4 w-4 text-slate-500" />
              <p className="text-sm font-semibold text-slate-700">Step 1 — Select appointment date range</p>
            </div>
            <p className="text-xs text-slate-500">
              Referrals with a scheduled date in this range that are <strong>not found in the CSV</strong> will be marked <span className="text-red-600 font-medium">No Show</span>.
            </p>
            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-xs text-slate-500 font-medium">From</label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-xs text-slate-500 font-medium">To</label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
          </div>

          {/* File upload */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-500" />
              <p className="text-sm font-semibold text-slate-700">Step 2 — Upload completed appointments CSV</p>
            </div>
            <div
              className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl py-12 transition-colors ${dateFrom && dateTo ? "border-slate-300 cursor-pointer hover:border-blue-400 hover:bg-blue-50" : "border-slate-200 bg-slate-50 cursor-not-allowed opacity-60"}`}
              onClick={() => dateFrom && dateTo && fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            >
              {isPending
                ? <><Loader2 className="h-9 w-9 text-blue-500 animate-spin mb-3" /><p className="text-sm text-slate-600 font-medium">Matching records…</p></>
                : <><Upload className="h-9 w-9 text-slate-400 mb-3" /><p className="text-sm font-medium text-slate-700">{dateFrom && dateTo ? "Drop CSV here or click to browse" : "Select a date range first"}</p><p className="text-xs text-slate-400 mt-1">Export from Excel as CSV</p></>
              }
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
        </div>
      )}

      {/* ── Preview ──────────────────────────────────── */}
      {step === "preview" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-800">{fileName}</p>
              <p className="text-xs text-slate-500">
                Range: {fmtDate(dateFrom)} — {fmtDate(dateTo)}
                {" · "}{matches.length} matched → Completed
                {" · "}{noShowList.length} unmatched → No Show
                {unmatchedCsv > 0 && ` · ${unmatchedCsv} CSV rows outside range or no match`}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={reset}>Start over</Button>
          </div>

          {matches.length === 0 && noShowList.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <AlertCircle className="h-10 w-10 text-amber-400 mb-3" />
              <p className="font-medium text-slate-700">No referrals found in this date range</p>
              <p className="text-sm text-slate-500 mt-1">Try a different date range or check that Genesis MRNs are cleaned up.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Completed table */}
              {matches.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">COMPLETED</span>
                    <p className="text-sm font-semibold text-slate-700">Matched in CSV ({matches.length})</p>
                    <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                      <input type="checkbox" checked={selCompleted.length === matches.length} onChange={() => setSelCompleted(selCompleted.length === matches.length ? [] : matches.map((m) => m.referralId))} />
                      Select all
                    </label>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 w-8"></th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600">Patient (App)</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600">Patient (Report)</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600">MRN (Report)</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600">Genesis MRN (App)</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600">Visit Date (Report)</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600">Scheduled (App)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {matches.map((m) => (
                          <tr key={m.referralId} className={`cursor-pointer hover:bg-slate-50 ${selCompleted.includes(m.referralId) ? "bg-green-50" : ""}`} onClick={() => setSelCompleted((p) => p.includes(m.referralId) ? p.filter((x) => x !== m.referralId) : [...p, m.referralId])}>
                            <td className="px-3 py-2"><input type="checkbox" checked={selCompleted.includes(m.referralId)} onChange={() => {}} onClick={(e) => e.stopPropagation()} /></td>
                            <td className="px-3 py-2 font-medium text-slate-800">{m.appPatientName}</td>
                            <td className="px-3 py-2 text-slate-500">{m.csvRow.patientName || "—"}</td>
                            <td className="px-3 py-2 font-mono text-slate-600">{m.csvRow.mrn}</td>
                            <td className="px-3 py-2 font-mono text-slate-600">{m.appGenesisMrn ?? "—"}</td>
                            <td className="px-3 py-2 text-slate-600">{m.csvRow.visitDate || "—"}</td>
                            <td className="px-3 py-2 text-slate-600">{fmtDate(m.appScheduledDate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* No Show table */}
              {noShowList.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">NO SHOW</span>
                    <p className="text-sm font-semibold text-slate-700">Not in CSV — scheduled in range ({noShowList.length})</p>
                    <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                      <input type="checkbox" checked={selNoShow.length === noShowList.length} onChange={() => setSelNoShow(selNoShow.length === noShowList.length ? [] : noShowList.map((c) => c.referralId))} />
                      Select all
                    </label>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-red-100">
                    <table className="w-full text-sm">
                      <thead className="bg-red-50 border-b border-red-100">
                        <tr>
                          <th className="px-3 py-2 w-8"></th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600">Patient</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600">Genesis MRN</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600">Scheduled Date</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600">Current Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-50">
                        {noShowList.map((c) => (
                          <tr key={c.referralId} className={`cursor-pointer hover:bg-red-50 ${selNoShow.includes(c.referralId) ? "bg-red-50" : ""}`} onClick={() => setSelNoShow((p) => p.includes(c.referralId) ? p.filter((x) => x !== c.referralId) : [...p, c.referralId])}>
                            <td className="px-3 py-2"><input type="checkbox" checked={selNoShow.includes(c.referralId)} onChange={() => {}} onClick={(e) => e.stopPropagation()} /></td>
                            <td className="px-3 py-2 font-medium text-slate-800">{c.appPatientName}</td>
                            <td className="px-3 py-2 font-mono text-slate-600">{c.appGenesisMrn ?? "—"}</td>
                            <td className="px-3 py-2 text-slate-600">{fmtDate(c.appScheduledDate)}</td>
                            <td className="px-3 py-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[c.currentStatus] ?? ""}`}>{c.currentStatus}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

              <div className="flex items-center justify-between pt-2">
                <p className="text-sm text-slate-500">
                  {selCompleted.length} → Completed · {selNoShow.length} → No Show
                </p>
                <Button onClick={handleApply} disabled={isPending || (selCompleted.length === 0 && selNoShow.length === 0)}>
                  {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Applying…</> : <><Check className="h-4 w-4 mr-2" />Apply</>}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Done ─────────────────────────────────────── */}
      {step === "done" && (
        <div className="space-y-6">
          <div className="flex items-center gap-4 p-4 bg-green-50 border border-green-200 rounded-xl">
            <CheckCircle className="h-8 w-8 text-green-500 shrink-0" />
            <div>
              <p className="font-semibold text-green-800">
                {completedCount} marked Completed · {noShowCount} marked No Show
              </p>
              <p className="text-sm text-green-600">
                {fileName} · Range: {fmtDate(dateFrom)} — {fmtDate(dateTo)}
              </p>
            </div>
            <Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={reset}>
              Reconcile another file
            </Button>
          </div>

          {applied.filter((r) => r.newStatus === "COMPLETED").length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-700">Moved to Completed ({completedCount})</h2>
              <ReportTable records={applied.filter((r) => r.newStatus === "COMPLETED")} />
            </div>
          )}

          {applied.filter((r) => r.newStatus === "NO_SHOW").length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-red-600">Marked No Show ({noShowCount})</h2>
              <ReportTable records={applied.filter((r) => r.newStatus === "NO_SHOW")} noShow />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Report table ─────────────────────────────────────────────────────────────

function ReportTable({ records, noShow }: { records: AppliedRecord[]; noShow?: boolean }) {
  return (
    <div className={`overflow-x-auto rounded-xl border ${noShow ? "border-red-100" : "border-slate-200"}`}>
      <table className="w-full text-sm">
        <thead className={`border-b ${noShow ? "bg-red-50 border-red-100" : "bg-slate-50 border-slate-200"}`}>
          <tr>
            <th className="px-3 py-2 text-left font-medium text-slate-600">Patient</th>
            <th className="px-3 py-2 text-left font-medium text-slate-600">Genesis MRN (App)</th>
            {!noShow && <th className="px-3 py-2 text-left font-medium text-slate-600">MRN (Report)</th>}
            {!noShow && <th className="px-3 py-2 text-left font-medium text-slate-600">Visit Date (Report)</th>}
            <th className="px-3 py-2 text-left font-medium text-slate-600">Scheduled (App)</th>
            <th className="px-3 py-2 text-left font-medium text-slate-600">Was</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {records.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="px-3 py-2 font-medium text-slate-800">{r.appPatientName}</td>
              <td className="px-3 py-2 font-mono text-slate-600">{r.appGenesisMrn ?? "—"}</td>
              {!noShow && <td className="px-3 py-2 font-mono text-slate-600">{r.reportMrn || "—"}</td>}
              {!noShow && <td className="px-3 py-2 text-slate-600">{r.reportVisitDate || "—"}</td>}
              <td className="px-3 py-2 text-slate-600">{fmtDate(r.appScheduledDate)}</td>
              <td className="px-3 py-2">
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600">{r.previousStatus}</span>
              </td>
              <td className="px-3 py-2">
                <Link href={`/referrals/${r.id}`} className="text-xs text-blue-600 hover:underline">View →</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
