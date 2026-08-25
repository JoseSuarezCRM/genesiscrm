"use client"

import { useState, useTransition, useEffect } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Plus, Check, Loader2, X, Globe, Users, UserCog } from "lucide-react"
import { createSurgeryView, updateSurgeryView, deleteSurgeryView, type SurgeryViewConfig } from "@/app/actions/surgery-views"
import { reorderViews } from "@/app/actions/view-order"
import { useCardReorder } from "@/components/use-card-reorder"
import { ViewAccessSelector, type ViewAccessValue, type ShareUser, type ShareTeam } from "@/components/view-access-selector"
import { DEFAULT_SURGERY_COLS } from "@/components/surgery-table"
import { cn } from "@/lib/utils"

interface SavedView {
  id: string
  name: string
  config: { query: string; columns: string[]; viewMode: "cards" | "table" }
  visibility?: string
  isOwner?: boolean
}

interface Props {
  views: SavedView[]
  shareUsers: ShareUser[]
  shareTeams: ShareTeam[]
}

// Normalize a query string for comparison / storage: drop `page`, sort keys.
function normalizeQuery(qs: string): string {
  const p = new URLSearchParams(qs)
  p.delete("page")
  const entries = Array.from(p.entries()).sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
  return entries.map(([k, v]) => `${k}=${v}`).join("&")
}

function applyPrefs(columns: string[], viewMode: "cards" | "table", frozen = 0) {
  try {
    localStorage.setItem("surgeryCols", JSON.stringify(columns))
    localStorage.setItem("surgeryViewMode", viewMode)
    localStorage.setItem("surgeryFrozen", String(frozen))
    window.dispatchEvent(new Event("surgery-view-applied"))
  } catch {}
}

function readPrefs(): { columns: string[]; viewMode: "cards" | "table"; frozen: number } {
  let columns = DEFAULT_SURGERY_COLS
  let viewMode: "cards" | "table" = "table"
  let frozen = 0
  try {
    const c = localStorage.getItem("surgeryCols")
    if (c) { const arr = JSON.parse(c); if (Array.isArray(arr) && arr.length) columns = arr }
    const v = localStorage.getItem("surgeryViewMode")
    if (v === "cards" || v === "table") viewMode = v
    const f = localStorage.getItem("surgeryFrozen")
    if (f != null) { const n = Number(f); if (!Number.isNaN(n)) frozen = n }
  } catch {}
  return { columns, viewMode, frozen }
}

export default function SurgeryViewsBar({ views, shareUsers, shareTeams }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [showSaveForm, setShowSaveForm] = useState(false)
  const [newViewName, setNewViewName] = useState("")
  const [newViewAccess, setNewViewAccess] = useState<ViewAccessValue>({ visibility: "PRIVATE", teamId: null, sharedUserIds: [] })
  const [saving, setSaving] = useState(false)

  // Drag to reorder the view tabs (per-user order, persisted).
  const reorder = useCardReorder(views, (v) => v.id, (ids) => startTransition(() => { reorderViews("SURGERY", "", ids) }))

  // Current column/view/frozen prefs (in localStorage, written by the table). Re-read
  // whenever a view is applied or the columns change, so we can offer "Save changes".
  const [prefs, setPrefs] = useState<{ columns: string[]; viewMode: "cards" | "table"; frozen: number }>({ columns: DEFAULT_SURGERY_COLS, viewMode: "table", frozen: 0 })
  useEffect(() => {
    const load = () => setPrefs(readPrefs())
    load()
    window.addEventListener("surgery-view-applied", load)
    window.addEventListener("surgery-prefs-changed", load)
    return () => { window.removeEventListener("surgery-view-applied", load); window.removeEventListener("surgery-prefs-changed", load) }
  }, [])

  const [appliedViewId, setAppliedViewId] = useState<string | null>(null)
  useEffect(() => {
    try { setAppliedViewId(sessionStorage.getItem(`surgery-view:${pathname}`)) } catch {}
  }, [pathname])
  function setApplied(id: string | null) {
    setAppliedViewId(id)
    try { if (id) sessionStorage.setItem(`surgery-view:${pathname}`, id); else sessionStorage.removeItem(`surgery-view:${pathname}`) } catch {}
  }

  const currentQuery = normalizeQuery(params.toString())
  const matchedView = views.find((v) => normalizeQuery(v.config.query) === currentQuery)
  const activeView = (appliedViewId ? views.find((v) => v.id === appliedViewId) : undefined) ?? matchedView
  const activeViewId = activeView?.id ?? (currentQuery === "" && !appliedViewId ? "__default__" : null)
  const sameOrder = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every((x, i) => x === b[i])
  const viewDirty = !!activeView && (
    normalizeQuery(activeView.config.query) !== currentQuery ||
    !sameOrder(activeView.config.columns ?? DEFAULT_SURGERY_COLS, prefs.columns) ||
    (activeView.config.viewMode ?? "table") !== prefs.viewMode ||
    ((activeView.config as any).frozen ?? 0) !== prefs.frozen
  )

  function handleUpdateView() {
    if (!activeView) return
    setSaving(true)
    const config: SurgeryViewConfig = { query: currentQuery, columns: prefs.columns, viewMode: prefs.viewMode, frozen: prefs.frozen }
    startTransition(async () => {
      await updateSurgeryView(activeView.id, config)
      setSaving(false)
      router.refresh()
    })
  }

  function applyView(view: SavedView) {
    setApplied(view.id)
    applyPrefs(view.config.columns ?? DEFAULT_SURGERY_COLS, view.config.viewMode ?? "table", (view.config as any).frozen ?? 0)
    router.push(`${pathname}${view.config.query ? `?${view.config.query}` : ""}`)
  }

  function applyDefault() {
    setApplied(null)
    applyPrefs(DEFAULT_SURGERY_COLS, "table")
    router.push(pathname)
  }

  function handleSave() {
    if (!newViewName.trim()) return
    setSaving(true)
    const prefs = readPrefs()
    const p = new URLSearchParams(params.toString())
    p.delete("page")
    const config: SurgeryViewConfig = { query: p.toString(), columns: prefs.columns, viewMode: prefs.viewMode, frozen: prefs.frozen }
    startTransition(async () => {
      await createSurgeryView(newViewName.trim(), config, newViewAccess)
      setSaving(false)
      setShowSaveForm(false)
      setNewViewName("")
      setNewViewAccess({ visibility: "PRIVATE", teamId: null, sharedUserIds: [] })
      router.refresh()
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => { await deleteSurgeryView(id); router.refresh() })
  }

  const pill = "inline-flex items-center gap-1 h-8 rounded-lg border text-sm font-medium transition-all overflow-hidden"
  const activeCls = "bg-blue-600 text-white border-blue-600"
  const idleCls = "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={applyDefault} className={cn(pill, "px-3", activeViewId === "__default__" ? activeCls : idleCls)}>
        Default
      </button>

      {reorder.order.map((view) => (
        <div key={view.id}
          {...reorder.handleProps(view.id)}
          {...reorder.cardProps(view.id)}
          className={cn(pill, "cursor-grab active:cursor-grabbing", reorder.dragging === view.id && "opacity-50", activeViewId === view.id ? activeCls : idleCls)}>
          <button className={cn("pl-3 h-full", view.isOwner === false ? "pr-3" : "pr-1.5")} onClick={() => applyView(view)}>
            {view.name}
            {view.isOwner === false && view.visibility && view.visibility !== "PRIVATE" && (
              <span className="ml-1.5 opacity-60" title={view.visibility === "EVERYONE" ? "Shared with everyone" : view.visibility === "TEAM" ? "Shared with team" : "Shared with specific people"}>
                {view.visibility === "EVERYONE" ? <Globe className="inline h-3 w-3" /> : view.visibility === "TEAM" ? <Users className="inline h-3 w-3" /> : <UserCog className="inline h-3 w-3" />}
              </span>
            )}
          </button>
          {view.isOwner !== false && (
            <button onClick={() => handleDelete(view.id)} title="Delete view"
              className={cn("pr-2 pl-0.5 h-full transition-colors", activeViewId === view.id ? "hover:text-zinc-300" : "hover:text-red-500")}>
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}

      {viewDirty && (
        <button onClick={handleUpdateView} disabled={saving || isPending}
          className="h-8 px-3 rounded-lg text-sm font-medium border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 flex items-center gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save changes
        </button>
      )}

      <div className="relative">
        <button onClick={() => setShowSaveForm((v) => !v)}
          className="h-8 px-3 rounded-lg text-sm border border-dashed border-zinc-300 text-zinc-400 hover:border-zinc-500 hover:text-zinc-600 transition-all flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" /> {viewDirty ? "Save as new" : "Save view"}
        </button>
        {showSaveForm && (
          <div className="absolute left-0 top-full mt-2 z-50 w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-3 space-y-3">
            <p className="text-xs text-slate-500">Saves the current filters, sort, and columns as a reusable view.</p>
            <input autoFocus value={newViewName} onChange={(e) => setNewViewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setShowSaveForm(false) }}
              placeholder="View name..."
              className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg outline-none focus:border-slate-400" />
            <ViewAccessSelector value={newViewAccess} onChange={setNewViewAccess} users={shareUsers} teams={shareTeams} />
            <div className="flex gap-2 pt-1">
              <button onClick={handleSave} disabled={saving || isPending || !newViewName.trim()}
                className="flex-1 h-9 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save view
              </button>
              <button onClick={() => { setShowSaveForm(false); setNewViewName("") }}
                className="h-9 px-3 text-sm text-zinc-500 hover:text-zinc-800 border border-zinc-200 rounded-lg">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
