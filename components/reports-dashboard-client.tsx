"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ChevronLeft,
  LayoutDashboard,
  Pin,
  Trash2,
  ExternalLink,
  BookmarkX,
  PlusCircle,
} from "lucide-react"
import {
  deleteSavedReport,
  togglePinSavedReport,
  renameSavedReport,
  type SavedReport,
  type SavedReportConfig,
} from "@/app/actions/saved-reports"

const GROUP_LABELS: Record<string, string> = {
  practice: "Practice",
  pipeline: "Pipeline",
  status: "Status",
  provider: "Provider",
  insurance: "Insurance",
  month: "Time",
}

const RANGE_LABELS: Record<string, string> = {
  last_6m: "Last 6 months",
  this_month: "This month",
  last_month: "Last month",
  last_3m: "Last 3 months",
  last_year: "Last 12 months",
  all: "All time",
  custom: "Custom range",
}

function buildBuilderUrl(cfg: SavedReportConfig): string {
  const p = new URLSearchParams()
  p.set("groupBy", cfg.groupBy)
  if (cfg.groupBy === "month") p.set("granularity", cfg.granularity)
  if (cfg.from && cfg.to) {
    p.set("from", cfg.from)
    p.set("to", cfg.to)
    p.set("range", "custom")
  } else {
    p.set("range", cfg.range)
  }
  cfg.practiceIds?.forEach((id) => p.append("practiceId", id))
  cfg.pipelineIds?.forEach((id) => p.append("pipelineId", id))
  return `/reports/builder?${p.toString()}`
}

function ReportCard({ report }: { report: SavedReport }) {
  const router = useRouter()
  const [deleting, startDelete] = useTransition()
  const [pinning, startPin] = useTransition()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(report.name)
  const [renaming, startRename] = useTransition()

  const cfg = report.config as SavedReportConfig
  const href = buildBuilderUrl(cfg)

  function handleDelete() {
    startDelete(async () => {
      await deleteSavedReport(report.id)
      router.refresh()
    })
  }

  function handleTogglePin() {
    startPin(async () => {
      await togglePinSavedReport(report.id, !report.isPinned)
      router.refresh()
    })
  }

  function handleRename() {
    if (!name.trim() || name.trim() === report.name) { setEditing(false); return }
    startRename(async () => {
      await renameSavedReport(report.id, name.trim())
      setEditing(false)
      router.refresh()
    })
  }

  const filterCount = (cfg.practiceIds?.length ?? 0) + (cfg.pipelineIds?.length ?? 0)

  return (
    <div className={`bg-white border rounded-xl p-5 flex flex-col gap-3 hover:border-zinc-300 transition-all ${deleting ? "opacity-50" : ""}`}>
      {/* Card header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") { setName(report.name); setEditing(false) } }}
              className="w-full text-sm font-semibold border-b border-zinc-300 focus:outline-none focus:border-zinc-700 bg-transparent pb-0.5"
            />
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="text-sm font-semibold text-slate-900 hover:text-zinc-600 text-left truncate max-w-full block"
              title="Click to rename"
            >
              {report.name}
            </button>
          )}
          <p className="text-xs text-slate-400 mt-0.5">
            {new Date(report.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleTogglePin}
            disabled={pinning}
            className={`p-1.5 rounded-lg transition-all ${report.isPinned ? "text-amber-400 bg-amber-50 hover:bg-amber-100" : "text-zinc-300 hover:text-amber-400 hover:bg-amber-50"}`}
            title={report.isPinned ? "Unpin" : "Pin"}
          >
            <Pin className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-1.5 rounded-lg text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-all"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Config summary */}
      <div className="flex flex-wrap gap-1.5">
        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700 text-xs font-medium">
          {GROUP_LABELS[cfg.groupBy] ?? cfg.groupBy}
        </span>
        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-xs">
          {RANGE_LABELS[cfg.range] ?? cfg.range}
        </span>
        {cfg.viz && cfg.viz !== "bar" && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 text-xs capitalize">
            {cfg.viz}
          </span>
        )}
        {filterCount > 0 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-xs">
            {filterCount} filter{filterCount > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Open button */}
      <Link
        href={href}
        className="mt-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-700 hover:border-zinc-400 hover:text-zinc-900 transition-all"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Open Report
      </Link>
    </div>
  )
}

export default function ReportsDashboardClient({ savedReports }: { savedReports: SavedReport[] }) {
  const pinned = savedReports.filter((r) => r.isPinned)
  const unpinned = savedReports.filter((r) => !r.isPinned)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/reports" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors">
            <ChevronLeft className="h-4 w-4" />
            Reports
          </Link>
          <span className="text-slate-300">/</span>
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-slate-700" />
            <h1 className="text-2xl font-bold text-slate-900">My Dashboard</h1>
          </div>
        </div>
        <Link
          href="/reports/builder"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-all"
        >
          <PlusCircle className="h-3.5 w-3.5" />
          New Report
        </Link>
      </div>

      {/* Empty state */}
      {savedReports.length === 0 && (
        <div className="bg-white border rounded-xl p-16 text-center space-y-3">
          <BookmarkX className="h-8 w-8 text-slate-300 mx-auto" />
          <p className="text-slate-500 font-medium">No saved reports yet</p>
          <p className="text-slate-400 text-sm">Build a custom report and click <strong>Save Report</strong> to add it here.</p>
          <Link
            href="/reports/builder"
            className="inline-flex items-center gap-1.5 px-4 py-2 mt-2 text-sm font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-all"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Create a Report
          </Link>
        </div>
      )}

      {/* Pinned */}
      {pinned.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Pin className="h-3.5 w-3.5 text-amber-400" />
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pinned</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pinned.map((r) => <ReportCard key={r.id} report={r} />)}
          </div>
        </div>
      )}

      {/* All reports */}
      {unpinned.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {pinned.length > 0 ? "Other Reports" : "All Reports"}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {unpinned.map((r) => <ReportCard key={r.id} report={r} />)}
          </div>
        </div>
      )}
    </div>
  )
}
