"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Trash2, Pencil, FileBarChart2, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  togglePinSavedReport,
  renameSavedReport,
  deleteSavedReport,
  type ReportListItem,
} from "@/app/actions/saved-reports"
import { useReportingSearch } from "@/components/reporting-shell"
import { VisibilityBadge, StarToggle, SortHeader, ViewToggle, type SortDir } from "@/components/reporting-list-shared"

type SortCol = "name" | "ownerName" | "dashboardCount" | "updatedAt"

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export default function ReportsListView({ reports }: { reports: ReportListItem[] }) {
  const router = useRouter()
  const search = useReportingSearch()
  const [rows, setRows] = useState(reports)
  const [tab, setTab] = useState<"all" | "favorites">("all")
  const [mode, setMode] = useState<"list" | "grid">("list")
  const [sortKey, setSortKey] = useState<SortCol>("updatedAt")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [, startAct] = useTransition()

  function onSort(col: SortCol) {
    if (col === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(col); setSortDir(col === "updatedAt" ? "desc" : "asc") }
  }

  function togglePin(r: ReportListItem) {
    const next = !r.isPinned
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, isPinned: next } : x)))
    startAct(() => { togglePinSavedReport(r.id, next).catch(() => {}) })
  }
  function saveRename(id: string) {
    const name = draft.trim()
    setRenamingId(null)
    if (!name) return
    setRows((rs) => rs.map((x) => (x.id === id ? { ...x, name } : x)))
    startAct(() => { renameSavedReport(id, name).catch(() => {}) })
  }
  function remove(id: string) {
    setRows((rs) => rs.filter((x) => x.id !== id))
    startAct(async () => { await deleteSavedReport(id); router.refresh() })
  }

  const visible = useMemo(() => {
    let out = rows
    if (tab === "favorites") out = out.filter((r) => r.isPinned)
    const q = search.trim().toLowerCase()
    if (q) out = out.filter((r) => r.name.toLowerCase().includes(q) || r.ownerName.toLowerCase().includes(q))
    const dir = sortDir === "asc" ? 1 : -1
    return [...out].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (sortKey === "updatedAt") return (new Date(av as any).getTime() - new Date(bv as any).getTime()) * dir
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
  }, [rows, tab, search, sortKey, sortDir])

  const favCount = rows.filter((r) => r.isPinned).length

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 text-sm">
          {([["all", `All reports`], ["favorites", `Favorites (${favCount})`]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={cn("rounded-md px-3 py-1.5 font-medium", tab === k ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900")}>
              {label}
            </button>
          ))}
        </div>
        <ViewToggle mode={mode} onChange={setMode} />
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-16 text-center">
          <FileBarChart2 className="mx-auto h-8 w-8 text-zinc-300" />
          <p className="mt-2 font-medium text-zinc-500">No reports</p>
          <p className="text-sm text-zinc-400">Create a report from the builder to see it here.</p>
        </div>
      ) : mode === "list" ? (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50">
              <tr>
                <th className="w-10 px-3 py-2.5" />
                <th className="px-3 py-2.5 text-left"><SortHeader label="Name" col="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
                <th className="px-3 py-2.5 text-left"><SortHeader label="Owner" col="ownerName" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
                <th className="px-3 py-2.5 text-left"><SortHeader label="Used in" col="dashboardCount" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">Sharing</th>
                <th className="px-3 py-2.5 text-left"><SortHeader label="Last updated" col="updatedAt" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
                <th className="w-20 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {visible.map((r) => (
                <tr key={r.id} className="group hover:bg-zinc-50">
                  <td className="px-3 py-2.5"><StarToggle pinned={r.isPinned} onToggle={() => togglePin(r)} /></td>
                  <td className="px-3 py-2.5">
                    {renamingId === r.id ? (
                      <span className="inline-flex items-center gap-1">
                        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveRename(r.id); if (e.key === "Escape") setRenamingId(null) }}
                          className="w-48 rounded border border-zinc-300 px-1.5 py-0.5 text-sm outline-none focus:border-zinc-500" />
                        <button onClick={() => saveRename(r.id)} className="text-emerald-600"><Check className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setRenamingId(null)} className="text-zinc-400"><X className="h-3.5 w-3.5" /></button>
                      </span>
                    ) : (
                      <Link href={`/reports/view/${r.id}`} className="font-medium text-zinc-900 hover:text-blue-700">{r.name}</Link>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-zinc-600">{r.ownerName}</td>
                  <td className="px-3 py-2.5 text-zinc-600">{r.dashboardCount}</td>
                  <td className="px-3 py-2.5"><VisibilityBadge visibility={r.visibility} /></td>
                  <td className="px-3 py-2.5 text-zinc-500">{fmtDate(r.updatedAt)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button onClick={() => { setRenamingId(r.id); setDraft(r.name) }} className="rounded p-1 text-zinc-400 hover:text-zinc-700" title="Rename"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => remove(r.id)} className="rounded p-1 text-zinc-400 hover:text-red-600" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((r) => (
            <div key={r.id} className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-300">
              <div className="flex items-start justify-between">
                <Link href={`/reports/view/${r.id}`} className="font-semibold text-zinc-900 hover:text-blue-700">{r.name}</Link>
                <StarToggle pinned={r.isPinned} onToggle={() => togglePin(r)} />
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <VisibilityBadge visibility={r.visibility} />
                <span>· {r.dashboardCount} dashboard{r.dashboardCount !== 1 ? "s" : ""}</span>
              </div>
              <p className="mt-auto text-xs text-zinc-400">{r.ownerName} · {fmtDate(r.updatedAt)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
