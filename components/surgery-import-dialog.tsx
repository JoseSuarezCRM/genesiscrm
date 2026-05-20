"use client"

import { useState, useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Upload, X, FileSpreadsheet, CheckCircle, AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function SurgeryImportDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [importing, startImport] = useTransition()
  const [result, setResult] = useState<{ imported: number; duplicates: number; errors: string[]; total: number } | null>(null)
  const [error, setError] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    setResult(null)
    setError("")
  }

  function handleImport() {
    if (!file) return
    setError("")
    startImport(async () => {
      const fd = new FormData()
      fd.append("file", file)
      try {
        const res = await fetch("/api/surgery/import", { method: "POST", body: fd })
        const json = await res.json()
        if (!res.ok) { setError(json.error ?? "Import failed"); return }
        setResult(json)
        router.refresh()
      } catch {
        setError("Network error — please try again.")
      }
    })
  }

  function handleClose() {
    setOpen(false)
    setFile(null)
    setResult(null)
    setError("")
    if (fileRef.current) fileRef.current.value = ""
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4 mr-2" />
        Import File
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-base font-semibold text-slate-900">Import Surgery Cases</h2>
              <button onClick={handleClose} className="text-slate-400 hover:text-slate-700 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Format info */}
              <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 space-y-1.5">
                <p className="font-medium text-slate-800">Supported file formats: .xlsx, .xls, .csv</p>
                <p>Expected columns (case-insensitive):</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-500 text-xs">
                  <li>Patient Name <span className="text-red-500">*required</span></li>
                  <li>MRN</li>
                  <li>Expires</li>
                  <li>Creation Date</li>
                  <li>Diagnosis</li>
                </ul>
                <p className="text-xs text-slate-400 pt-1">Status defaults to <strong>New</strong> for all imported rows.</p>
              </div>

              {/* File picker */}
              {!result && (
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="w-full border-2 border-dashed border-zinc-200 hover:border-zinc-400 rounded-xl p-6 text-center transition-colors group"
                  >
                    {file ? (
                      <div className="flex items-center justify-center gap-3">
                        <FileSpreadsheet className="h-5 w-5 text-green-600" />
                        <span className="text-sm font-medium text-slate-800">{file.name}</span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload className="h-8 w-8 text-slate-300 mx-auto group-hover:text-zinc-500 transition-colors" />
                        <p className="text-sm text-slate-500">Click to select file</p>
                        <p className="text-xs text-slate-400">.xlsx, .xls, or .csv</p>
                      </div>
                    )}
                  </button>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 text-red-600 text-sm bg-red-50 rounded-xl p-3">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              {/* Result */}
              {result && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-xl p-3">
                    <CheckCircle className="h-5 w-5 shrink-0" />
                    <div className="text-sm font-medium">
                      Imported {result.imported} of {result.total} rows successfully.
                      {result.duplicates > 0 && (
                        <span className="block text-xs font-normal text-green-600 mt-0.5">
                          {result.duplicates} duplicate{result.duplicates !== 1 ? "s" : ""} skipped (same MRN + diagnosis already exists).
                        </span>
                      )}
                    </div>
                  </div>
                  {result.errors.length > 0 && (
                    <div className="bg-amber-50 rounded-xl p-3 space-y-1">
                      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Skipped rows:</p>
                      {result.errors.map((e, i) => (
                        <p key={i} className="text-xs text-amber-600">{e}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-slate-50">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-zinc-600 border border-zinc-200 rounded-lg hover:border-zinc-400 transition-all"
              >
                {result ? "Close" : "Cancel"}
              </button>
              {!result && (
                <Button onClick={handleImport} disabled={!file || importing}>
                  {importing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                  Import
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
