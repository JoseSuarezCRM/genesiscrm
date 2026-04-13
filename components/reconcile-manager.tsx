"use client"

import { useState, useTransition, useRef } from "react"
import { matchAppointments, applyReconciliation, cleanupGenesisMrn } from "@/app/actions/reconcile"
import type { CsvRow, MatchResult, AppliedRecord } from "@/app/actions/reconcile"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import {
  Upload,
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  FileText,
  Check,
} from "lucide-react"

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { cell += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === "," && !inQuotes) {
      row.push(cell.trim()); cell = ""
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && text[i + 1] === "\n") i++
      row.push(cell.trim()); rows.push(row); row = []; cell = ""
    } else {
      cell += ch
    }
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row) }
  return rows.filter((r) => r.some((c) => c !== ""))
}

function findCol(headers: string[], ...keywords: string[]): number {
  return headers.findIndex((h) =>
    keywords.some((k) => h.toLowerCase().includes(k.toLowerCase()))
  )
}

function extractRows(raw: string[][]): CsvRow[] {
  if (raw.length < 2) return []
  const headers = raw[0]
  const mrnIdx    = findCol(headers, "mrn")
  const nameIdx   = findCol(headers, "patient")
  const dateIdx   = findCol(headers, "visit date", "date")

  return raw.slice(1).map((r) => ({
    mrn:         r[mrnIdx]  ?? "",
    patientName: r[nameIdx] ?? "",
    visitDate:   r[dateIdx] ?? "",
  }))
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ReconcileManager() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload")
  const [fileName, setFileName] = useState("")
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [unmatched, setUnmatched] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [appliedRecords, setAppliedRecords] = useState<AppliedRecord[]>([])
  const [skippedRecords, setSkippedRecords] = useState<AppliedRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cleanupMsg, setCleanupMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function toggleAll() {
    if (selected.length === matches.length) setSelected([])
    else setSelected(matches.map((m) => m.referralId))
  }

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  function reset() {
    setStep("upload"); setFileName(""); setMatches([])
    setSelected([]); setAppliedRecords([]); setSkippedRecords([])
  }

  function handleFile(file: File) {
    setFileName(file.name)
    setError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const rows = extractRows(parseCsv(text))
      if (!rows.length) { setError("Could not parse file. Save as CSV from Excel first."); return }

      startTransition(async () => {
        const result = await matchAppointments(rows)
        setMatches(result.matches)
        setUnmatched(result.unmatched)
        setSelected(result.matches.map((m) => m.referralId))
        setStep("preview")
      })
    }
    reader.readAsText(file)
  }

  function handleApply() {
    const matchMap: Record<string, { reportMrn: string; reportVisitDate: string }> = {}
    for (const m of matches) {
      matchMap[m.referralId] = { reportMrn: m.csvRow.mrn, reportVisitDate: m.csvRow.visitDate }
    }
    startTransition(async () => {
      const result = await applyReconciliation(selected, matchMap)
      if (result.error) { setError(result.error); return }
      setAppliedRecords(result.applied ?? [])
      setSkippedRecords(result.skipped ?? [])
      setStep("done")
    })
  }

  function handleCleanup() {
    startTransition(async () => {
      const result = await cleanupGenesisMrn()
      setCleanupMsg(result.error ? `Error: ${result.error}` : `Cleaned ${result.fixed} record${result.fixed !== 1 ? "s" : ""}.`)
    })
  }

  return (
    <div className="space-y-6">

      {/* MRN Cleanup */}
      <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <div>
          <p className="text-sm font-medium text-amber-800">Fix existing Genesis MRN values</p>
          <p className="text-xs text-amber-600 mt-0.5">Strips "MRN: " prefixes and non-numeric characters from all records. Run once before first reconciliation.</p>
          {cleanupMsg && <p className="text-xs font-medium mt-1 text-green-700">{cleanupMsg}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={handleCleanup} disabled={isPending} className="ml-4 shrink-0">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="h-4 w-4 mr-2" />Clean Now</>}
        </Button>
      </div>

      {/* Upload */}
      {step === "upload" && (
        <div
          className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl py-16 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        >
          {isPending
            ? <><Loader2 className="h-10 w-10 text-blue-500 animate-spin mb-3" /><p className="text-sm text-slate-600 font-medium">Matching records…</p></>
            : <><Upload className="h-10 w-10 text-slate-400 mb-3" /><p className="text-sm font-medium text-slate-700">Drop CSV file here or click to browse</p><p className="text-xs text-slate-400 mt-1">Export from Excel as CSV first</p></>
          }
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        </div>
      )}

      {/* Preview */}
      {step === "preview" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-slate-500" />
              <div>
                <p className="text-sm font-medium text-slate-800">{fileName}</p>
                <p className="text-xs text-slate-500">
                  {matches.length} match{matches.length !== 1 ? "es" : ""} by Genesis MRN
                  {unmatched > 0 && ` · ${unmatched} row${unmatched !== 1 ? "s" : ""} unmatched`}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={reset}>Upload different file</Button>
          </div>

          {matches.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <AlertCircle className="h-10 w-10 text-amber-400 mb-3" />
              <p className="font-medium text-slate-700">No matches found</p>
              <p className="text-sm text-slate-500 mt-1">No referrals matched by Genesis MRN. Run "Clean Now" first and verify the MRN column in your CSV.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 w-8">
                        <input type="checkbox" checked={selected.length === matches.length} onChange={toggleAll} />
                      </th>
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
                      <tr key={m.referralId} className={`cursor-pointer hover:bg-slate-50 ${selected.includes(m.referralId) ? "bg-blue-50" : ""}`} onClick={() => toggle(m.referralId)}>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={selected.includes(m.referralId)} onChange={() => toggle(m.referralId)} onClick={(e) => e.stopPropagation()} />
                        </td>
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

              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">{selected.length} of {matches.length} selected</p>
                <Button onClick={handleApply} disabled={isPending || selected.length === 0}>
                  {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Applying…</> : <><Check className="h-4 w-4 mr-2" />Mark {selected.length} as Completed</>}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Done — report */}
      {step === "done" && (
        <div className="space-y-6">
          <div className="flex items-center gap-4 p-4 bg-green-50 border border-green-200 rounded-xl">
            <CheckCircle className="h-8 w-8 text-green-500 shrink-0" />
            <div>
              <p className="font-semibold text-green-800">
                {appliedRecords.length} referral{appliedRecords.length !== 1 ? "s" : ""} moved to Completed
              </p>
              <p className="text-sm text-green-600">
                {fileName} · {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                {skippedRecords.length > 0 && ` · ${skippedRecords.length} already Completed / No Show`}
              </p>
            </div>
            <Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={reset}>
              Reconcile another file
            </Button>
          </div>

          {appliedRecords.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-700">Moved to Completed ({appliedRecords.length})</h2>
              <ReportTable records={appliedRecords} />
            </div>
          )}

          {skippedRecords.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-500">Already Completed / No Show — skipped ({skippedRecords.length})</h2>
              <ReportTable records={skippedRecords} dim />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ReportTable({ records, dim }: { records: AppliedRecord[]; dim?: boolean }) {
  return (
    <div className={`overflow-x-auto rounded-xl border ${dim ? "border-slate-100 opacity-60" : "border-slate-200"}`}>
      <table className="w-full text-sm">
        <thead className={`border-b ${dim ? "bg-slate-50 border-slate-100" : "bg-slate-50 border-slate-200"}`}>
          <tr>
            <th className="px-3 py-2 text-left font-medium text-slate-600">Patient</th>
            <th className="px-3 py-2 text-left font-medium text-slate-600">MRN (Report)</th>
            <th className="px-3 py-2 text-left font-medium text-slate-600">Genesis MRN (App)</th>
            <th className="px-3 py-2 text-left font-medium text-slate-600">Visit Date (Report)</th>
            <th className="px-3 py-2 text-left font-medium text-slate-600">Scheduled (App)</th>
            <th className="px-3 py-2 text-left font-medium text-slate-600">Was</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {records.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="px-3 py-2 font-medium text-slate-800">{r.appPatientName}</td>
              <td className="px-3 py-2 font-mono text-slate-600">{r.reportMrn || "—"}</td>
              <td className="px-3 py-2 font-mono text-slate-600">{r.appGenesisMrn ?? "—"}</td>
              <td className="px-3 py-2 text-slate-600">{r.reportVisitDate || "—"}</td>
              <td className="px-3 py-2 text-slate-600">{fmtDate(r.appScheduledDate)}</td>
              <td className="px-3 py-2">
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600">
                  {r.previousStatus}
                </span>
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
