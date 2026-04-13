"use client"

import { useState, useTransition, useRef } from "react"
import { matchAppointments, applyReconciliation, cleanupGenesisMrn } from "@/app/actions/reconcile"
import type { CsvRow, MatchResult } from "@/app/actions/reconcile"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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

function findColIndex(headers: string[], ...keywords: string[]): number {
  return headers.findIndex((h) =>
    keywords.some((k) => h.toLowerCase().includes(k.toLowerCase()))
  )
}

function extractRows(raw: string[][]): CsvRow[] {
  if (raw.length < 2) return []
  const headers = raw[0]

  const mrnIdx    = findColIndex(headers, "mrn")
  const phoneIdx  = findColIndex(headers, "home", "phone")
  const cellIdx   = findColIndex(headers, "cell")
  const nameIdx   = findColIndex(headers, "patient")
  const dateIdx   = findColIndex(headers, "visit date", "date")
  const statusIdx = findColIndex(headers, "appt status", "status")

  return raw.slice(1).map((r) => ({
    mrn:         r[mrnIdx]    ?? "",
    phone1:      r[phoneIdx]  ?? "",
    phone2:      r[cellIdx]   ?? "",
    patientName: r[nameIdx]   ?? "",
    visitDate:   r[dateIdx]   ?? "",
    apptStatus:  r[statusIdx] ?? "",
  }))
}

// ─── Status badge colours ─────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  NEW:            "bg-slate-100 text-slate-600",
  READY_FOR_CALL: "bg-yellow-100 text-yellow-700",
  CONTACTED:      "bg-blue-100 text-blue-700",
  SCHEDULED:      "bg-purple-100 text-purple-700",
  COMPLETED:      "bg-green-100 text-green-700",
  NO_SHOW:        "bg-red-100 text-red-700",
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ReconcileManager() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload")
  const [fileName, setFileName] = useState("")
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [unmatched, setUnmatched] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [appliedCount, setAppliedCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [cleanupMsg, setCleanupMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function toggleAll() {
    if (selected.size === matches.length) setSelected(new Set())
    else setSelected(new Set(matches.map((m) => m.referralId)))
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleFile(file: File) {
    if (!file) return
    setFileName(file.name)
    setError(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const raw = parseCsv(text)
      const rows = extractRows(raw)

      if (!rows.length) {
        setError("Could not parse the file. Make sure it is a CSV with a header row.")
        return
      }

      startTransition(async () => {
        const result = await matchAppointments(rows)
        setMatches(result.matches)
        setUnmatched(result.unmatched)
        setSelected(new Set(result.matches.map((m) => m.referralId)))
        setStep("preview")
      })
    }
    reader.readAsText(file)
  }

  function handleApply() {
    startTransition(async () => {
      const result = await applyReconciliation(Array.from(selected))
      if (result.error) {
        setError(result.error)
      } else {
        setAppliedCount(result.count ?? 0)
        setStep("done")
      }
    })
  }

  function handleCleanup() {
    startTransition(async () => {
      const result = await cleanupGenesisMrn()
      if (result.error) setCleanupMsg(`Error: ${result.error}`)
      else setCleanupMsg(`Cleaned ${result.fixed} record${result.fixed !== 1 ? "s" : ""}.`)
    })
  }

  return (
    <div className="space-y-6">

      {/* ── MRN Cleanup ─────────────────────────────── */}
      <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <div>
          <p className="text-sm font-medium text-amber-800">Fix existing Genesis MRN values</p>
          <p className="text-xs text-amber-600 mt-0.5">
            Strips "MRN: " prefixes and non-numeric characters from all existing records.
            Run this once before your first reconciliation.
          </p>
          {cleanupMsg && <p className="text-xs text-green-700 font-medium mt-1">{cleanupMsg}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={handleCleanup} disabled={isPending} className="shrink-0 ml-4">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          {!isPending && "Clean Now"}
        </Button>
      </div>

      {/* ── Step: Upload ─────────────────────────────── */}
      {step === "upload" && (
        <div
          className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl py-16 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        >
          {isPending ? (
            <>
              <Loader2 className="h-10 w-10 text-blue-500 animate-spin mb-3" />
              <p className="text-sm text-slate-600 font-medium">Matching records…</p>
            </>
          ) : (
            <>
              <Upload className="h-10 w-10 text-slate-400 mb-3" />
              <p className="text-sm font-medium text-slate-700">Drop your CSV file here, or click to browse</p>
              <p className="text-xs text-slate-400 mt-1">Export your appointment report as CSV from Excel first</p>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
        </div>
      )}

      {/* ── Step: Preview ────────────────────────────── */}
      {step === "preview" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-slate-500" />
              <div>
                <p className="text-sm font-medium text-slate-800">{fileName}</p>
                <p className="text-xs text-slate-500">
                  {matches.length} match{matches.length !== 1 ? "es" : ""} found
                  {unmatched > 0 && ` · ${unmatched} row${unmatched !== 1 ? "s" : ""} unmatched`}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => { setStep("upload"); setFileName("") }}>
              Upload different file
            </Button>
          </div>

          {matches.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <AlertCircle className="h-10 w-10 text-amber-400 mb-3" />
              <p className="font-medium text-slate-700">No matches found</p>
              <p className="text-sm text-slate-500 mt-1">
                No referrals matched by MRN or phone number. Make sure Genesis MRNs are cleaned up and the correct columns are present.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left w-8">
                        <input type="checkbox" checked={selected.size === matches.length} onChange={toggleAll} />
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">Report Patient</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">Matched Referral</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">Matched By</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">Visit Date</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">Current Status</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">New Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {matches.map((m) => (
                      <tr
                        key={m.referralId}
                        className={`cursor-pointer hover:bg-slate-50 ${selected.has(m.referralId) ? "bg-blue-50" : ""}`}
                        onClick={() => toggle(m.referralId)}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selected.has(m.referralId)}
                            onChange={() => toggle(m.referralId)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                        <td className="px-3 py-2 text-slate-700">{m.csvRow.patientName || "—"}</td>
                        <td className="px-3 py-2 font-medium text-slate-800">{m.patientName}</td>
                        <td className="px-3 py-2">
                          <Badge variant="secondary" className="text-xs">
                            {m.matchedBy === "mrn" ? `MRN: ${m.matchedValue}` : `Phone: ${m.matchedValue}`}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-slate-500">{m.csvRow.visitDate || "—"}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[m.currentStatus] ?? ""}`}>
                            {m.currentStatus}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
                            COMPLETED
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
              )}

              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  {selected.size} of {matches.length} selected
                </p>
                <Button onClick={handleApply} disabled={isPending || selected.size === 0}>
                  {isPending
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Applying…</>
                    : <><Check className="h-4 w-4 mr-2" />Mark {selected.size} as Completed</>
                  }
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Step: Done ───────────────────────────────── */}
      {step === "done" && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
          <p className="text-xl font-bold text-slate-800">
            {appliedCount} referral{appliedCount !== 1 ? "s" : ""} marked as Completed
          </p>
          <p className="text-sm text-slate-500 mt-2">
            The referral list has been updated.
          </p>
          <Button className="mt-6" onClick={() => { setStep("upload"); setFileName(""); setMatches([]) }}>
            Reconcile another file
          </Button>
        </div>
      )}
    </div>
  )
}
