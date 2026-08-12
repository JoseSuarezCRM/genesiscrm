"use client"

import { useState, useRef, useTransition } from "react"
import { Upload, FileText, AlertCircle, CheckCircle2, Trash2, ChevronDown, ChevronUp } from "lucide-react"
import { importCompletedAppointments, deleteAppointmentBatch, AppointmentRow } from "@/app/actions/completed-appointments"
import { confirmDialog } from "@/components/ui/confirm-dialog"

// ── CSV parser ──────────────────────────────────────────────────────────────
function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++ }
      else if (ch === '"') inQuotes = false
      else current += ch
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') { fields.push(current); current = "" }
      else current += ch
    }
  }
  fields.push(current)
  return fields
}

function parseCsv(text: string): AppointmentRow[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean)
  if (lines.length < 2) return []

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase())

  // flexible column detection
  const idx = (candidates: string[]) => {
    for (const c of candidates) {
      const i = header.findIndex((h) => h.includes(c))
      if (i !== -1) return i
    }
    return -1
  }

  const col = {
    patientName:              idx(["patient name", "patient", "name"]),
    mrn:                      idx(["mrn", "medical record"]),
    phone:                    idx(["phone"]),
    email:                    idx(["email"]),
    appointmentDate:          idx(["appointment date", "appt date", "visit date", "date"]),
    referringProvider:        idx(["referring provider", "referring physician", "referring doctor", "provider"]),
    referringProviderAddress: idx(["referring provider address", "provider address", "referring address"]),
    referringProviderPhone:   idx(["referring provider phone", "provider phone", "referring phone"]),
  }

  const rows: AppointmentRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i])
    const get = (c: number) => (c !== -1 ? (cells[c] ?? "").trim() : "")
    rows.push({
      patientName:              get(col.patientName),
      mrn:                      get(col.mrn),
      phone:                    get(col.phone),
      email:                    get(col.email),
      appointmentDate:          get(col.appointmentDate),
      referringProvider:        get(col.referringProvider),
      referringProviderAddress: get(col.referringProviderAddress),
      referringProviderPhone:   get(col.referringProviderPhone),
    })
  }
  return rows
}

// ── Serialized appointment from server ──────────────────────────────────────
export interface SerializedAppointment {
  id: string
  patientName: string
  mrn: string | null
  phone: string | null
  email: string | null
  appointmentDate: string | null
  referringProvider: string
  referringProviderAddress: string | null
  referringProviderPhone: string | null
  importBatchId: string | null
  importedAt: string
}

interface Props {
  appointments: SerializedAppointment[]
  isAdmin: boolean
}

export default function CompletedAppointmentsManager({ appointments, isAdmin }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [parsed, setParsed] = useState<AppointmentRow[] | null>(null)
  const [fileName, setFileName] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [isPending, startTransition] = useTransition()
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set())

  function handleFile(file: File) {
    setError("")
    setSuccess("")
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const rows = parseCsv(text)
      if (!rows.length) { setError("Could not parse CSV — check column headers."); return }
      setParsed(rows)
    }
    reader.readAsText(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const validRows = parsed?.filter((r) => r.referringProvider.trim()) ?? []
  const skippedRows = (parsed?.length ?? 0) - validRows.length

  function handleImport() {
    if (!validRows.length) return
    startTransition(async () => {
      const res = await importCompletedAppointments(validRows)
      if (!res.success) { setError(res.error); return }
      setSuccess(`Imported ${res.result.imported} appointments${res.result.skipped ? ` (${res.result.skipped} skipped — no referring provider)` : ""}.`)
      setParsed(null)
      setFileName("")
    })
  }

  async function handleDeleteBatch(batchId: string) {
    if (!(await confirmDialog("Delete all appointments in this import batch?"))) return
    startTransition(async () => {
      const res = await deleteAppointmentBatch(batchId)
      if (!res.success) setError(res.error ?? "Delete failed.")
      else setSuccess("Batch deleted.")
    })
  }

  // group by importBatchId
  const batches: Record<string, SerializedAppointment[]> = {}
  for (const a of appointments) {
    const key = a.importBatchId ?? "unknown"
    if (!batches[key]) batches[key] = []
    batches[key].push(a)
  }
  const batchKeys = Object.keys(batches).sort((a, b) => {
    const dateA = batches[a][0].importedAt
    const dateB = batches[b][0].importedAt
    return dateB.localeCompare(dateA)
  })

  function toggleBatch(key: string) {
    setExpandedBatches((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  return (
    <div className="space-y-6">
      {/* Upload Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-800">Import Appointments CSV</h2>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
            <AlertCircle className="h-4 w-4 shrink-0" />{error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />{success}
          </div>
        )}

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragging ? "border-blue-400 bg-blue-50" : "border-slate-300 hover:border-blue-400 hover:bg-slate-50"
          }`}
        >
          <Upload className="h-8 w-8 mx-auto text-slate-400 mb-2" />
          <p className="text-sm font-medium text-slate-700">
            {fileName ? fileName : "Drop a CSV file here or click to browse"}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Columns: Patient Name, MRN, Phone, Email, Appointment Date, Referring Provider, Referring Provider Address, Referring Provider Phone
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
        </div>

        {/* Preview */}
        {parsed && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-600">
                <span className="font-medium text-green-700">{validRows.length} rows to import</span>
                {skippedRows > 0 && (
                  <span className="ml-2 text-amber-600">· {skippedRows} skipped (no referring provider)</span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setParsed(null); setFileName("") }}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={isPending || !validRows.length}
                  className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isPending ? "Importing…" : `Import ${validRows.length} Appointments`}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    {["Patient Name","MRN","Phone","Appt Date","Referring Provider","Status"].map(h => (
                      <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsed.slice(0, 20).map((row, i) => (
                    <tr key={i} className={row.referringProvider.trim() ? "" : "opacity-40 bg-red-50"}>
                      <td className="px-3 py-1.5">{row.patientName || "—"}</td>
                      <td className="px-3 py-1.5 font-mono">{row.mrn || "—"}</td>
                      <td className="px-3 py-1.5">{row.phone || "—"}</td>
                      <td className="px-3 py-1.5">{row.appointmentDate || "—"}</td>
                      <td className="px-3 py-1.5">{row.referringProvider || <span className="text-red-500">missing</span>}</td>
                      <td className="px-3 py-1.5">
                        {row.referringProvider.trim()
                          ? <span className="text-green-600 font-medium">Import</span>
                          : <span className="text-red-500 font-medium">Skip</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.length > 20 && (
                <p className="text-xs text-slate-400 px-3 py-2 bg-slate-50">
                  Showing first 20 of {parsed.length} rows
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Imported batches */}
      {batchKeys.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
          No appointments imported yet
        </div>
      ) : (
        <div className="space-y-3">
          {batchKeys.map((batchId) => {
            const rows = batches[batchId]
            const firstDate = rows[0].importedAt
            const isExpanded = expandedBatches.has(batchId)
            return (
              <div key={batchId} className="bg-white rounded-xl border border-slate-200">
                <div
                  className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-slate-50 rounded-xl"
                  onClick={() => toggleBatch(batchId)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                    <div>
                      <span className="text-sm font-medium text-slate-800">
                        {rows.length} appointments
                      </span>
                      <span className="text-xs text-slate-400 ml-2">
                        imported {new Date(firstDate).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteBatch(batchId) }}
                      className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3" /> Delete batch
                    </button>
                  )}
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          {["Patient Name","MRN","Phone","Email","Appt Date","Referring Provider","Provider Phone"].map(h => (
                            <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rows.map((row) => (
                          <tr key={row.id} className="hover:bg-slate-50">
                            <td className="px-3 py-2">{row.patientName}</td>
                            <td className="px-3 py-2 font-mono">{row.mrn || "—"}</td>
                            <td className="px-3 py-2">{row.phone || "—"}</td>
                            <td className="px-3 py-2">{row.email || "—"}</td>
                            <td className="px-3 py-2">
                              {row.appointmentDate ? new Date(row.appointmentDate).toLocaleDateString() : "—"}
                            </td>
                            <td className="px-3 py-2">{row.referringProvider}</td>
                            <td className="px-3 py-2">{row.referringProviderPhone || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
