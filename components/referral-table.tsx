"use client"

import { useState, useTransition, useEffect, useRef } from "react"
import Link from "next/link"
import { Phone, ChevronDown, ChevronUp, Loader2 } from "lucide-react"
import BulkActionBar, { bulkBtn } from "@/components/ui/bulk-action-bar"
import { useColumnResize, ColResizer } from "@/components/ui/use-column-resize"
import { StatusBadge } from "@/components/status-badge"
import { formatDate, formatPhone } from "@/lib/utils"
import { moveReferralsToPipeline, bulkUpdateStatus } from "@/app/actions/referrals"
import { bulkAddTag, bulkRemoveTag } from "@/app/actions/tags"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Tag as TagIcon } from "lucide-react"

interface Pipeline {
  id: string
  name: string
  color: string
}

interface Tag {
  id: string
  name: string
  color: string
}

interface Referral {
  id: string
  patientFirstName: string
  patientLastName: string
  patientPhone: string | null
  referringPractice: { name: string } | null
  tags: { tag: Tag }[]
  referralDate: string | Date
  appointmentDate: string | Date | null
  status: string
  _count: { callAttempts: number }
}

interface Props {
  referrals: Referral[]
  pipelines: Pipeline[]
  allTags: Tag[]
  listUrl: string
  total: number
  allMatchingIds: string[]
}

export default function ReferralTable({ referrals, pipelines, allTags, listUrl, total, allMatchingIds }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [allPagesSelected, setAllPagesSelected] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [tagAddOpen, setTagAddOpen] = useState(false)
  const [tagRemoveOpen, setTagRemoveOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const menuRef = useRef<HTMLDivElement>(null)
  const tagAddRef = useRef<HTMLDivElement>(null)
  const tagRemoveRef = useRef<HTMLDivElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  const headerCheckRef = useRef<HTMLInputElement>(null)
  const { colWidth, startResize } = useColumnResize("referralColWidths")
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const sortKey = searchParams.get("sort") ?? "referralDate"
  const sortDir: "asc" | "desc" = searchParams.get("dir") === "asc" ? "asc" : "desc"
  // Server-side sort: update the URL (reset to page 1) so it covers all pages.
  function toggleSort(key: string) {
    const params = new URLSearchParams(searchParams.toString())
    const nextDir = sortKey === key && sortDir === "desc" ? "asc" : "desc"
    params.set("sort", key); params.set("dir", nextDir); params.set("page", "1")
    router.push(`${pathname}?${params.toString()}`)
  }

  const allPageChecked = referrals.length > 0 && referrals.every((r) => selected.has(r.id))
  const allChecked = allPageChecked
  const someChecked = selected.size > 0 && !allPageChecked
  const showSelectAllBanner = allPageChecked && !allPagesSelected && total > referrals.length

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

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (tagAddRef.current && !tagAddRef.current.contains(e.target as Node)) setTagAddOpen(false)
    }
    if (tagAddOpen) document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [tagAddOpen])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (tagRemoveRef.current && !tagRemoveRef.current.contains(e.target as Node)) setTagRemoveOpen(false)
    }
    if (tagRemoveOpen) document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [tagRemoveOpen])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false)
    }
    if (statusOpen) document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [statusOpen])

  function toggleAll() {
    if (allPageChecked) {
      setSelected(new Set())
      setAllPagesSelected(false)
    } else {
      setSelected(new Set(referrals.map((r) => r.id)))
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

  function moveTo(pipelineId: string | null) {
    startTransition(async () => {
      await moveReferralsToPipeline(Array.from(selected), pipelineId)
      clearSelection()
      setMenuOpen(false)
      router.refresh()
    })
  }

  function addTag(tagId: string) {
    startTransition(async () => {
      await bulkAddTag(Array.from(selected), tagId)
      setTagAddOpen(false)
      router.refresh()
    })
  }

  function removeTag(tagId: string) {
    startTransition(async () => {
      await bulkRemoveTag(Array.from(selected), tagId)
      setTagRemoveOpen(false)
      router.refresh()
    })
  }

  function changeStatus(status: string) {
    startTransition(async () => {
      await bulkUpdateStatus(Array.from(selected), status as any)
      setStatusOpen(false)
      clearSelection()
      router.refresh()
    })
  }

  return (
    <>
      {/* Bulk action bar */}
      <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              disabled={isPending}
              className={bulkBtn}
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  Move to pipeline
                  <ChevronDown className="h-3.5 w-3.5" />
                </>
              )}
            </button>

            {menuOpen && (
              <div className="absolute top-full mt-2 left-0 z-50 bg-white text-slate-900 rounded-xl shadow-xl border border-zinc-200 min-w-48 overflow-hidden">
                {pipelines.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => moveTo(p.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-slate-50 text-left transition-colors"
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                    {p.name}
                  </button>
                ))}
                {pipelines.length > 0 && <div className="border-t border-zinc-100" />}
                <button
                  onClick={() => moveTo(null)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-slate-50 text-left text-slate-400 transition-colors"
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-slate-300" />
                  Remove from pipeline
                </button>
              </div>
            )}
          </div>

          {allTags.length > 0 && (
            <>
              <span className="w-px h-5 bg-slate-200 mx-0.5" />

              {/* Add tag */}
              <div className="relative" ref={tagAddRef}>
                <button
                  onClick={() => { setTagAddOpen((v) => !v); setTagRemoveOpen(false) }}
                  disabled={isPending}
                  className={bulkBtn}
                >
                  <TagIcon className="h-3.5 w-3.5" />
                  Add tag
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                {tagAddOpen && (
                  <div className="absolute top-full mt-2 left-0 z-50 bg-white text-slate-900 rounded-xl shadow-xl border border-zinc-200 min-w-48 overflow-hidden">
                    <p className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide border-b border-zinc-100">Add tag to selected</p>
                    {allTags.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => addTag(t.id)}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-slate-50 text-left transition-colors"
                      >
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Remove tag */}
              <div className="relative" ref={tagRemoveRef}>
                <button
                  onClick={() => { setTagRemoveOpen((v) => !v); setTagAddOpen(false) }}
                  disabled={isPending}
                  className={bulkBtn}
                >
                  <TagIcon className="h-3.5 w-3.5" />
                  Remove tag
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                {tagRemoveOpen && (
                  <div className="absolute top-full mt-2 left-0 z-50 bg-white text-slate-900 rounded-xl shadow-xl border border-zinc-200 min-w-48 overflow-hidden">
                    <p className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide border-b border-zinc-100">Remove tag from selected</p>
                    {allTags.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => removeTag(t.id)}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-slate-50 text-left transition-colors"
                      >
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          <span className="w-px h-5 bg-slate-200 mx-0.5" />

          {/* Change status */}
          <div className="relative" ref={statusRef}>
            <button
              onClick={() => { setStatusOpen((v) => !v); setMenuOpen(false); setTagAddOpen(false); setTagRemoveOpen(false) }}
              disabled={isPending}
              className={bulkBtn}
            >
              Change status
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {statusOpen && (
              <div className="absolute top-full mt-2 left-0 z-50 bg-white text-slate-900 rounded-xl shadow-xl border border-zinc-200 min-w-48 overflow-hidden">
                <p className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide border-b border-zinc-100">Set status for selected</p>
                {[
                  { value: "NEW", label: "New" },
                  { value: "READY_FOR_CALL", label: "Ready for Call" },
                  { value: "CONTACTED", label: "Contacted" },
                  { value: "SCHEDULED", label: "Scheduled" },
                  { value: "COMPLETED", label: "Completed" },
                  { value: "NO_SHOW", label: "No Show" },
                ].map((s) => (
                  <button
                    key={s.value}
                    onClick={() => changeStatus(s.value)}
                    className="w-full flex items-center px-3 py-2.5 text-sm hover:bg-slate-50 text-left transition-colors"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

      </BulkActionBar>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <colgroup>
            <col style={{ width: 40 }} />
            {["patient", "phone", "practice", "tags", "referralDate", "apptDate", "calls", "status"].map((k) => (
              <col key={k} style={{ width: colWidth(k) }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <th className="px-4 py-3 w-10">
                <input
                  ref={headerCheckRef}
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  className="rounded border-slate-300 cursor-pointer"
                />
              </th>
              {[
                ["patient", "Patient"], ["phone", "Phone"], ["practice", "Referring Practice"],
                ["tags", "Tags"], ["referralDate", "Referral Date"], ["apptDate", "Appt Date"],
                ["calls", "Calls"], ["status", "Status"],
              ].map(([k, label]) => (
                <th key={k} className="text-left px-4 py-3 font-semibold relative">
                  {k === "tags" ? label : (
                    <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-slate-800">
                      {label}
                      {sortKey === k && (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    </button>
                  )}
                  <ColResizer onMouseDown={(e) => startResize(k, e)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Select-all-pages banner */}
            {(showSelectAllBanner || allPagesSelected) && (
              <tr>
                <td colSpan={9} className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 text-center text-sm text-blue-800">
                  {allPagesSelected ? (
                    <>
                      All <span className="font-semibold">{total}</span> records are selected.{" "}
                      <button onClick={clearSelection} className="underline font-medium hover:text-blue-600">
                        Clear selection
                      </button>
                    </>
                  ) : (
                    <>
                      All <span className="font-semibold">{referrals.length}</span> records on this page are selected.{" "}
                      <button onClick={selectAllPages} className="underline font-medium hover:text-blue-600">
                        Select all {total} records
                      </button>
                    </>
                  )}
                </td>
              </tr>
            )}
            {referrals.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-slate-400">
                  No referrals found.{" "}
                  <Link href="/referrals/new" className="text-blue-600 hover:underline">
                    Create one
                  </Link>
                  .
                </td>
              </tr>
            ) : (
              referrals.map((r) => (
                <tr
                  key={r.id}
                  className={`border-b transition-colors ${
                    selected.has(r.id) ? "bg-blue-50" : "hover:bg-slate-50"
                  }`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleRow(r.id)}
                      className="rounded border-slate-300 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/referrals/${r.id}?from=${encodeURIComponent(listUrl)}`}
                      className="font-medium text-slate-900 hover:text-blue-600"
                    >
                      {r.patientFirstName} {r.patientLastName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatPhone(r.patientPhone)}</td>
                  <td className="px-4 py-3 text-slate-600">{r.referringPractice?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    {r.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {r.tags.map(({ tag }) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium text-white"
                            style={{ backgroundColor: tag.color }}
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(r.referralDate)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(r.appointmentDate)}</td>
                  <td className="px-4 py-3">
                    {r._count.callAttempts > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                        <Phone className="h-3 w-3" />
                        {r._count.callAttempts}/3
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status as any} />
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
