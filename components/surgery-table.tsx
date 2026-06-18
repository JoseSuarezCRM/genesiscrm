"use client"

import { useState, useTransition, useEffect, useRef } from "react"
import Link from "next/link"
import {
  Phone, FileText, ChevronDown, ChevronUp, Loader2, Trash2,
  LayoutList, Table2, Download, Columns3, Check, Stethoscope,
} from "lucide-react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { bulkUpdateSurgeryCases, bulkDeleteSurgeryCases } from "@/app/actions/surgery"
import { SURGERY_STATUS_LABELS } from "@/lib/surgery-constants"
import { LANGUAGE_OPTIONS } from "@/lib/automation-properties"
import ExportDialog from "@/components/ui/export-dialog"
import { cn } from "@/lib/utils"

const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-zinc-100 text-zinc-700",
  SCHEDULED: "bg-blue-100 text-blue-700",
  PENDING_CONFIRMATION: "bg-amber-100 text-amber-700",
  PENDING_CLEARANCE: "bg-orange-100 text-orange-700",
  CANCELED: "bg-red-100 text-red-700",
  COMPLETED: "bg-green-100 text-green-700",
}

const STATUS_OPTIONS = Object.entries(SURGERY_STATUS_LABELS).map(([id, label]) => ({ id, label }))
const LANGUAGE_LABELS: Record<string, string> = Object.fromEntries(LANGUAGE_OPTIONS.map(o => [o.value, o.label]))

// Table columns for the surgery cases table view.
const SURGERY_COLUMNS: { key: string; label: string; sortable?: boolean }[] = [
  { key: "patient",          label: "Patient",          sortable: true },
  { key: "mrn",              label: "MRN" },
  { key: "status",           label: "Status",           sortable: true },
  { key: "surgeryDate",      label: "Surgery Date",     sortable: true },
  { key: "language",         label: "Language" },
  { key: "procedure",        label: "Procedure" },
  { key: "facility",         label: "Facility" },
  { key: "orderingProvider", label: "Ordering Provider" },
  { key: "diagnosis",        label: "Diagnosis" },
  { key: "expires",          label: "Expires" },
  { key: "calls",            label: "Calls" },
  { key: "docs",             label: "Docs" },
]
const DEFAULT_SURGERY_COLS = ["patient", "mrn", "status", "surgeryDate", "language", "procedure", "diagnosis", "calls", "docs"]

interface SurgeryCase {
  id: string
  patientName: string
  mrn: string | null
  status: string
  surgeryDate: string | Date | null
  language: string | null
  procedure: string | null
  facility: string | null
  orderingProvider: string | null
  diagnosis: string | null
  expires: string | Date | null
  _count: { callAttempts: number; documents: number }
}

interface Props {
  cases: SurgeryCase[]
  total: number
  allMatchingIds: string[]
}

function fmt(d: string | Date | null | undefined) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" })
}

export default function SurgeryTable({ cases, total, allMatchingIds }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [allPagesSelected, setAllPagesSelected] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const menuRef = useRef<HTMLDivElement>(null)
  const headerCheckRef = useRef<HTMLInputElement>(null)

  // View mode + columns are client-only prefs. Sort + export are server-side
  // (URL params), so they cover the whole filtered set, not just this page.
  const [viewMode, setViewMode] = useState<"cards" | "table">("table")
  const [visibleCols, setVisibleCols] = useState<string[]>(DEFAULT_SURGERY_COLS)
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const colMenuRef = useRef<HTMLDivElement>(null)
  const [exportOpen, setExportOpen] = useState(false)

  const sortKey = searchParams.get("sort") ?? ""
  const sortDir: "asc" | "desc" = searchParams.get("dir") === "asc" ? "asc" : "desc"

  // Persist view prefs across navigation (loaded after mount to avoid hydration mismatch).
  useEffect(() => {
    try {
      const v = localStorage.getItem("surgeryViewMode")
      if (v === "cards" || v === "table") setViewMode(v)
      const c = localStorage.getItem("surgeryCols")
      if (c) { const arr = JSON.parse(c); if (Array.isArray(arr) && arr.length) setVisibleCols(arr) }
    } catch {}
  }, [])
  useEffect(() => { try { localStorage.setItem("surgeryViewMode", viewMode) } catch {} }, [viewMode])
  useEffect(() => { try { localStorage.setItem("surgeryCols", JSON.stringify(visibleCols)) } catch {} }, [visibleCols])

  const allPageChecked = cases.length > 0 && cases.every((c) => selected.has(c.id))
  const someChecked = selected.size > 0 && !allPageChecked
  const showSelectAllBanner = allPageChecked && !allPagesSelected && total > cases.length

  useEffect(() => {
    if (headerCheckRef.current) headerCheckRef.current.indeterminate = someChecked
  }, [someChecked])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setColMenuOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  function toggleAll() {
    if (allPageChecked) { setSelected(new Set()); setAllPagesSelected(false) }
    else { setSelected(new Set(cases.map((c) => c.id))); setAllPagesSelected(false) }
  }
  function selectAllPages() { setSelected(new Set(allMatchingIds)); setAllPagesSelected(true) }
  function clearSelection() { setSelected(new Set()); setAllPagesSelected(false) }
  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function bulkSetStatus(status: string) {
    startTransition(async () => {
      await bulkUpdateSurgeryCases(Array.from(selected), status)
      clearSelection(); setMenuOpen(false); router.refresh()
    })
  }
  function bulkDelete() {
    if (!confirm(`Delete ${selected.size} case${selected.size !== 1 ? "s" : ""}? This cannot be undone.`)) return
    startTransition(async () => {
      await bulkDeleteSurgeryCases(Array.from(selected))
      clearSelection(); router.refresh()
    })
  }

  const cols = SURGERY_COLUMNS.filter((c) => visibleCols.includes(c.key))
  const toggleCol = (key: string) =>
    setVisibleCols((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))

  // Server-side sort: update the URL (resetting to page 1) so it covers all pages.
  function toggleSort(key: "patient" | "status" | "surgeryDate") {
    const params = new URLSearchParams(searchParams.toString())
    const nextDir = sortKey === key && sortDir === "desc" ? "asc" : "desc"
    params.set("sort", key)
    params.set("dir", nextDir)
    params.set("page", "1")
    router.push(`${pathname}?${params.toString()}`)
  }

  // Server-side export: hit the route with the current filters + sort (all matching rows).
  const exportParams = new URLSearchParams()
  for (const k of ["search", "statusMode", "from", "to", "sort", "dir"]) {
    const v = searchParams.get(k)
    if (v) exportParams.set(k, v)
  }
  searchParams.getAll("status").forEach((s) => exportParams.append("status", s))
  const exportHref = `/api/surgery/export${exportParams.toString() ? `?${exportParams.toString()}` : ""}`

  // Rows render in the server-provided order.
  const sorted = cases

  // One table/card cell's content for a given column.
  function renderCell(c: SurgeryCase, key: string): React.ReactNode {
    switch (key) {
      case "patient":
        return (
          <Link href={`/surgery/${c.id}`} className="font-medium text-slate-900 hover:text-blue-600 transition-colors">
            {c.patientName}
          </Link>
        )
      case "mrn": return <span className="text-slate-500">{c.mrn ?? "—"}</span>
      case "status":
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_COLORS[c.status] ?? "bg-zinc-100 text-zinc-700"}`}>
            {SURGERY_STATUS_LABELS[c.status] ?? c.status}
          </span>
        )
      case "surgeryDate": return <span className="text-slate-600">{fmt(c.surgeryDate)}</span>
      case "language":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-violet-50 text-violet-700">
            {LANGUAGE_LABELS[c.language ?? "EN"] ?? "English"}
          </span>
        )
      case "procedure": return <span className="text-slate-600">{c.procedure ?? "—"}</span>
      case "facility": return <span className="text-slate-600">{c.facility ?? "—"}</span>
      case "orderingProvider": return <span className="text-slate-600">{c.orderingProvider ?? "—"}</span>
      case "diagnosis": return <span className="text-slate-600">{c.diagnosis ?? "—"}</span>
      case "expires": return <span className="text-slate-600">{fmt(c.expires)}</span>
      case "calls":
        return c._count.callAttempts > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600"><Phone className="h-3 w-3" />{c._count.callAttempts}/4</span>
        ) : <span className="text-slate-300 text-xs">—</span>
      case "docs":
        return c._count.documents > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600"><FileText className="h-3 w-3" />{c._count.documents}</span>
        ) : <span className="text-slate-300 text-xs">—</span>
      default: return null
    }
  }

  const colSpan = cols.length + 1

  return (
    <>
      {/* Toolbar: view toggle + columns + export */}
      <div className="flex items-center justify-end gap-2">
        <div className="inline-flex items-center rounded-lg border border-zinc-200 bg-white p-0.5">
          <button onClick={() => setViewMode("table")} title="Table view"
            className={`inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors ${viewMode === "table" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-800"}`}>
            <Table2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setViewMode("cards")} title="Card view"
            className={`inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors ${viewMode === "cards" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-800"}`}>
            <LayoutList className="h-3.5 w-3.5" />
          </button>
        </div>

        {viewMode === "table" && (
          <div className="relative" ref={colMenuRef}>
            <button onClick={() => setColMenuOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-600 hover:border-zinc-400 transition-colors">
              <Columns3 className="h-3.5 w-3.5" /> Columns
              <ChevronDown className="h-3 w-3 opacity-50" />
            </button>
            {colMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 z-50 w-52 bg-white border border-zinc-200 rounded-xl shadow-xl overflow-hidden py-1">
                {SURGERY_COLUMNS.map((col) => (
                  <button key={col.key} onClick={() => toggleCol(col.key)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-zinc-50 transition-colors text-left">
                    <span className={cn("shrink-0 w-[14px] h-[14px] rounded border flex items-center justify-center transition-all", visibleCols.includes(col.key) ? "bg-zinc-900 border-zinc-900" : "border-zinc-300")}>
                      {visibleCols.includes(col.key) && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                    </span>
                    <span className="text-zinc-700">{col.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button onClick={() => setExportOpen(true)} disabled={cases.length === 0} title="Export current view to CSV"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-600 hover:border-zinc-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          <Download className="h-3.5 w-3.5" /> Export
        </button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-zinc-900 text-white rounded-xl text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenuOpen(!menuOpen)} disabled={isPending}
              className="inline-flex items-center gap-1.5 h-7 px-3 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors">
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Change Status
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>
            {menuOpen && (
              <div className="absolute top-full mt-1.5 left-0 z-50 bg-white border border-zinc-200 rounded-xl shadow-xl overflow-hidden min-w-[180px]">
                {STATUS_OPTIONS.map((s) => (
                  <button key={s.id} onClick={() => bulkSetStatus(s.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-800 hover:bg-zinc-50 transition-colors text-left">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_COLORS[s.id] ?? "bg-zinc-100 text-zinc-700"}`}>{s.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={bulkDelete} disabled={isPending}
            className="inline-flex items-center gap-1.5 h-7 px-3 bg-red-500 hover:bg-red-600 rounded-lg text-sm font-medium transition-colors">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
          <button onClick={clearSelection} className="ml-auto text-white/60 hover:text-white text-xs transition-colors">Clear</button>
        </div>
      )}

      {/* Select-all-pages banner (shared between views) */}
      {(showSelectAllBanner || allPagesSelected) && (
        <div className="px-4 py-2.5 bg-blue-50 border border-blue-100 rounded-xl text-center text-sm text-blue-800">
          {allPagesSelected ? (
            <>All <span className="font-semibold">{total}</span> records are selected.{" "}
              <button onClick={clearSelection} className="underline font-medium hover:text-blue-600">Clear selection</button></>
          ) : (
            <>All <span className="font-semibold">{cases.length}</span> records on this page are selected.{" "}
              <button onClick={selectAllPages} className="underline font-medium hover:text-blue-600">Select all {total} records</button></>
          )}
        </div>
      )}

      {cases.length === 0 ? (
        <div className="bg-white border rounded-xl py-16 text-center text-slate-400">No cases match the current filters.</div>
      ) : viewMode === "table" ? (
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 w-10">
                    <input ref={headerCheckRef} type="checkbox" checked={allPageChecked} onChange={toggleAll} className="rounded border-slate-300 cursor-pointer" />
                  </th>
                  {cols.map((col) => (
                    <th key={col.key} className="text-left px-4 py-3 font-semibold">
                      {col.sortable ? (
                        <button onClick={() => toggleSort(col.key as "patient" | "status" | "surgeryDate")} className="inline-flex items-center gap-1 hover:text-slate-800">
                          {col.label}
                          {sortKey === col.key && (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                        </button>
                      ) : col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => (
                  <tr key={c.id} className={`border-b transition-colors ${selected.has(c.id) ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleRow(c.id)} className="rounded border-slate-300 cursor-pointer" />
                    </td>
                    {cols.map((col) => (
                      <td key={col.key} className={cn("px-4 py-3", col.key === "diagnosis" && "max-w-[200px] truncate")}>{renderCell(c, col.key)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sorted.map((c) => (
            <div key={c.id} className={cn("bg-white border rounded-xl p-4 space-y-2.5 transition-colors", selected.has(c.id) ? "border-blue-300 bg-blue-50/40" : "border-slate-200 hover:border-slate-300")}>
              <div className="flex items-start gap-2.5">
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleRow(c.id)} className="mt-1 rounded border-slate-300 cursor-pointer" />
                <div className="flex-1 min-w-0">
                  <Link href={`/surgery/${c.id}`} className="font-semibold text-slate-900 hover:text-blue-600 transition-colors block truncate">{c.patientName}</Link>
                  <p className="text-xs text-slate-400">{c.mrn ? `MRN ${c.mrn}` : "No MRN"}</p>
                </div>
                <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_COLORS[c.status] ?? "bg-zinc-100 text-zinc-700"}`}>
                  {SURGERY_STATUS_LABELS[c.status] ?? c.status}
                </span>
              </div>
              <div className="space-y-1 text-sm text-slate-600">
                {c.procedure && <p className="truncate"><Stethoscope className="inline h-3.5 w-3.5 mr-1 text-slate-400" />{c.procedure}</p>}
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Surgery: <span className="text-slate-700 font-medium">{fmt(c.surgeryDate)}</span></span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 font-medium">{LANGUAGE_LABELS[c.language ?? "EN"] ?? "English"}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 pt-0.5">
                  {c._count.callAttempts > 0 && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{c._count.callAttempts}/4</span>}
                  {c._count.documents > 0 && <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" />{c._count.documents}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        subject="surgery cases"
        defaultName={`surgery-cases-${new Date().toISOString().slice(0, 10)}`}
        href={exportHref}
      />
    </>
  )
}
