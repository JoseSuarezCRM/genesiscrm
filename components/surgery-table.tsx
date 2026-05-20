"use client"

import { useState, useTransition, useEffect, useRef } from "react"
import Link from "next/link"
import { Phone, FileText, ChevronDown, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { bulkUpdateSurgeryCases } from "@/app/actions/surgery"
import { SURGERY_STATUS_LABELS } from "@/lib/surgery-constants"

const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-zinc-100 text-zinc-700",
  SCHEDULED: "bg-blue-100 text-blue-700",
  PENDING_CONFIRMATION: "bg-amber-100 text-amber-700",
  PENDING_CLEARANCE: "bg-orange-100 text-orange-700",
  CANCELED: "bg-red-100 text-red-700",
  COMPLETED: "bg-green-100 text-green-700",
}

const STATUS_OPTIONS = Object.entries(SURGERY_STATUS_LABELS).map(([id, label]) => ({ id, label }))

interface SurgeryCase {
  id: string
  patientName: string
  mrn: string | null
  status: string
  surgeryDate: string | Date | null
  diagnosis: string | null
  expires: string | Date | null
  _count: { callAttempts: number; documents: number }
}

interface Props {
  cases: SurgeryCase[]
  total: number
  allMatchingIds: string[]
}

export default function SurgeryTable({ cases, total, allMatchingIds }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [allPagesSelected, setAllPagesSelected] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const menuRef = useRef<HTMLDivElement>(null)
  const headerCheckRef = useRef<HTMLInputElement>(null)

  const allPageChecked = cases.length > 0 && cases.every((c) => selected.has(c.id))
  const someChecked = selected.size > 0 && !allPageChecked
  const showSelectAllBanner = allPageChecked && !allPagesSelected && total > cases.length

  useEffect(() => {
    if (headerCheckRef.current) {
      headerCheckRef.current.indeterminate = someChecked
    }
  }, [someChecked])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    if (menuOpen) document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [menuOpen])

  function toggleAll() {
    if (allPageChecked) {
      setSelected(new Set())
      setAllPagesSelected(false)
    } else {
      setSelected(new Set(cases.map((c) => c.id)))
      setAllPagesSelected(false)
    }
  }

  function selectAllPages() {
    setSelected(new Set(allMatchingIds))
    setAllPagesSelected(true)
  }

  function clearSelection() {
    setSelected(new Set())
    setAllPagesSelected(false)
  }

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
      clearSelection()
      setMenuOpen(false)
      router.refresh()
    })
  }

  function fmt(d: string | Date | null | undefined) {
    if (!d) return "—"
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  }

  const colSpan = 9

  return (
    <>
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-zinc-900 text-white rounded-xl text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 h-7 px-3 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors"
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Change Status
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>
            {menuOpen && (
              <div className="absolute top-full mt-1.5 left-0 z-50 bg-white border border-zinc-200 rounded-xl shadow-xl overflow-hidden min-w-[180px]">
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => bulkSetStatus(s.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-800 hover:bg-zinc-50 transition-colors text-left"
                  >
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_COLORS[s.id] ?? "bg-zinc-100 text-zinc-700"}`}>
                      {s.label}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={clearSelection} className="ml-auto text-white/60 hover:text-white text-xs transition-colors">
            Clear
          </button>
        </div>
      )}

      <div className="bg-white border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <th className="px-4 py-3 w-10">
                <input
                  ref={headerCheckRef}
                  type="checkbox"
                  checked={allPageChecked}
                  onChange={toggleAll}
                  className="rounded border-slate-300 cursor-pointer"
                />
              </th>
              <th className="text-left px-4 py-3 font-semibold">Patient</th>
              <th className="text-left px-4 py-3 font-semibold">MRN</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Surgery Date</th>
              <th className="text-left px-4 py-3 font-semibold">Diagnosis</th>
              <th className="text-left px-4 py-3 font-semibold">Expires</th>
              <th className="text-left px-4 py-3 font-semibold">Calls</th>
              <th className="text-left px-4 py-3 font-semibold">Docs</th>
            </tr>
          </thead>
          <tbody>
            {/* Select-all-pages banner */}
            {(showSelectAllBanner || allPagesSelected) && (
              <tr>
                <td colSpan={colSpan} className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 text-center text-sm text-blue-800">
                  {allPagesSelected ? (
                    <>
                      All <span className="font-semibold">{total}</span> records are selected.{" "}
                      <button onClick={clearSelection} className="underline font-medium hover:text-blue-600">
                        Clear selection
                      </button>
                    </>
                  ) : (
                    <>
                      All <span className="font-semibold">{cases.length}</span> records on this page are selected.{" "}
                      <button onClick={selectAllPages} className="underline font-medium hover:text-blue-600">
                        Select all {total} records
                      </button>
                    </>
                  )}
                </td>
              </tr>
            )}

            {cases.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-6 py-16 text-center text-slate-400">
                  No cases match the current filters.
                </td>
              </tr>
            ) : (
              cases.map((c) => (
                <tr
                  key={c.id}
                  className={`border-b transition-colors ${selected.has(c.id) ? "bg-blue-50" : "hover:bg-slate-50"}`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggleRow(c.id)}
                      className="rounded border-slate-300 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/surgery/${c.id}`} className="font-medium text-slate-900 hover:text-blue-600 transition-colors">
                      {c.patientName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{c.mrn ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_COLORS[c.status] ?? "bg-zinc-100 text-zinc-700"}`}>
                      {SURGERY_STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{fmt(c.surgeryDate)}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">{c.diagnosis ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{fmt(c.expires)}</td>
                  <td className="px-4 py-3">
                    {c._count.callAttempts > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                        <Phone className="h-3 w-3" />
                        {c._count.callAttempts}/4
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {c._count.documents > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                        <FileText className="h-3 w-3" />
                        {c._count.documents}
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
