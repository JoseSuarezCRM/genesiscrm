"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ChevronLeft,
  LayoutDashboard,
  Trash2,
  PlusCircle,
  BookmarkX,
  ChevronRight,
  FileBarChart2,
} from "lucide-react"
import {
  createDashboard,
  deleteDashboard,
  renameDashboard,
  type DashboardSummary,
} from "@/app/actions/dashboards"

function DashboardCard({ dashboard }: { dashboard: DashboardSummary }) {
  const router = useRouter()
  const [deleting, startDelete] = useTransition()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(dashboard.name)
  const [, startRename] = useTransition()

  function handleDelete() {
    startDelete(async () => {
      await deleteDashboard(dashboard.id)
      router.refresh()
    })
  }

  function handleRename() {
    if (!name.trim() || name.trim() === dashboard.name) { setEditing(false); return }
    startRename(async () => {
      await renameDashboard(dashboard.id, name.trim())
      setEditing(false)
      router.refresh()
    })
  }

  return (
    <div className={`bg-white border rounded-xl p-5 flex flex-col gap-4 hover:border-zinc-300 transition-all ${deleting ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename()
                if (e.key === "Escape") { setName(dashboard.name); setEditing(false) }
              }}
              className="w-full text-base font-semibold border-b border-zinc-300 focus:outline-none focus:border-zinc-700 bg-transparent pb-0.5"
            />
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="text-base font-semibold text-slate-900 hover:text-zinc-600 text-left block truncate max-w-full"
              title="Click to rename"
            >
              {dashboard.name}
            </button>
          )}
          <p className="text-xs text-slate-400 mt-0.5">
            {dashboard.reportCount} report{dashboard.reportCount !== 1 ? "s" : ""}
            {" · "}Updated {new Date(dashboard.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </p>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="p-1.5 rounded-lg text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
          title="Delete dashboard"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center justify-between mt-auto">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <FileBarChart2 className="h-3.5 w-3.5" />
          <span>{dashboard.reportCount === 0 ? "Empty" : `${dashboard.reportCount} report${dashboard.reportCount !== 1 ? "s" : ""}`}</span>
        </div>
        <Link
          href={`/reports/dashboard/${dashboard.id}`}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-200 text-sm text-zinc-700 hover:border-zinc-400 hover:text-zinc-900 transition-all"
        >
          Open
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}

export default function DashboardListClient({ dashboards }: { dashboards: DashboardSummary[] }) {
  const router = useRouter()
  const [creating, startCreate] = useTransition()
  const [newName, setNewName] = useState("")
  const [showInput, setShowInput] = useState(false)

  function handleCreate() {
    if (!newName.trim()) return
    startCreate(async () => {
      const { id } = await createDashboard(newName.trim())
      setNewName("")
      setShowInput(false)
      router.push(`/reports/dashboard/${id}`)
    })
  }

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
            <h1 className="text-2xl font-bold text-slate-900">Dashboards</h1>
          </div>
        </div>
        <button
          onClick={() => setShowInput(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-all"
        >
          <PlusCircle className="h-3.5 w-3.5" />
          New Dashboard
        </button>
      </div>

      {/* New dashboard inline input */}
      {showInput && (
        <div className="bg-white border border-zinc-300 rounded-xl p-5 flex items-center gap-3">
          <input
            autoFocus
            type="text"
            placeholder="Dashboard name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate()
              if (e.key === "Escape") { setNewName(""); setShowInput(false) }
            }}
            className="flex-1 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 transition-all"
          >
            {creating ? "Creating…" : "Create"}
          </button>
          <button
            onClick={() => { setNewName(""); setShowInput(false) }}
            className="px-3 py-2 rounded-lg text-sm border border-zinc-200 text-zinc-600 hover:border-zinc-400 transition-all"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Empty state */}
      {dashboards.length === 0 && !showInput && (
        <div className="bg-white border rounded-xl p-16 text-center space-y-3">
          <BookmarkX className="h-8 w-8 text-slate-300 mx-auto" />
          <p className="text-slate-500 font-medium">No dashboards yet</p>
          <p className="text-slate-400 text-sm">Create a dashboard to organize your saved reports.</p>
          <button
            onClick={() => setShowInput(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 mt-2 text-sm font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-all"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Create a Dashboard
          </button>
        </div>
      )}

      {/* Dashboard grid */}
      {dashboards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {dashboards.map((d) => <DashboardCard key={d.id} dashboard={d} />)}
        </div>
      )}
    </div>
  )
}
