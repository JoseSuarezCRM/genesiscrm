"use client"

import { useState } from "react"
import { X, Download, Loader2 } from "lucide-react"
import StyledSelect from "@/components/ui/styled-select"
import { toCsv, downloadCsv } from "@/lib/export-csv"

interface Props {
  open: boolean
  onClose: () => void
  // What's being exported, e.g. "activities" (used in the summary line).
  subject: string
  defaultName: string
  // Client-side export: lazily produce the data when the user clicks Export.
  // May be async (e.g. fetch all matching rows from the server).
  getData?: () => ExportData | Promise<ExportData>
  // Server-side export: download from this URL instead (filename appended).
  href?: string
  // Row count to display. When provided it's used directly (so getData isn't
  // called just to count — important for large/server-fetched exports).
  count?: number
}

type ExportData = { headers: string[]; rows: (string | number | null | undefined)[][] }

// HubSpot-style export modal (a16z styling): name the file, pick a format, export.
export default function ExportDialog({ open, onClose, subject, defaultName, getData, href, count }: Props) {
  const [name, setName] = useState(defaultName)
  const [format, setFormat] = useState("csv")
  const [busy, setBusy] = useState(false)
  const [rowCount, setRowCount] = useState<number | null>(null)

  // Count from getData only when no explicit count and it's cheap (sync) — never
  // fetch a big/async dataset just to show the number.
  if (open && getData && count == null && rowCount === null) {
    try { const d = getData() as any; if (d && typeof d.then !== "function") setRowCount((d as ExportData).rows.length) } catch { setRowCount(0) }
  }

  const shownCount = count != null ? count : (getData ? rowCount : null)

  function handleClose() {
    setRowCount(null)
    onClose()
  }

  async function handleExport() {
    setBusy(true)
    try {
      const filename = (name.trim() || defaultName)
      if (href) {
        const url = `${href}${href.includes("?") ? "&" : "?"}filename=${encodeURIComponent(filename)}`
        const link = document.createElement("a")
        link.href = url
        link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`
        link.click()
      } else if (getData) {
        const { headers, rows } = await Promise.resolve(getData())
        downloadCsv(filename, toCsv(headers, rows))
      }
      handleClose()
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 animate-overlay-in" onMouseDown={handleClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-modal-in" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
          <h2 className="text-base font-semibold text-zinc-900">Export view</h2>
          <button onClick={handleClose} className="text-zinc-400 hover:text-zinc-700"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-zinc-500">
            Exporting <span className="font-medium text-zinc-800 capitalize">{subject}</span>
            {shownCount !== null && <> · {shownCount.toLocaleString()} row{shownCount === 1 ? "" : "s"}</>}
          </p>

          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">Export name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg bg-white focus:outline-none focus:border-zinc-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">File format</label>
            <StyledSelect className="w-full" value={format} onChange={e => setFormat(e.target.value)}>
              <option value="csv">CSV</option>
            </StyledSelect>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-zinc-100">
          <button onClick={handleClose} className="px-4 py-2 text-sm font-medium rounded-lg border border-zinc-200 text-zinc-600 hover:border-zinc-300">Cancel</button>
          <button onClick={handleExport} disabled={busy || (getData && rowCount === 0)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export
          </button>
        </div>
      </div>
    </div>
  )
}
