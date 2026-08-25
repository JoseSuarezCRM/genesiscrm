"use client"

import { Star, ArrowUp, ArrowDown, LayoutGrid, List, Lock, Globe, Users, UserCog } from "lucide-react"
import { cn } from "@/lib/utils"

// Sharing → label + icon, mirroring the ViewAccessSelector visibility model.
const VIS: Record<string, { label: string; icon: typeof Lock; cls: string }> = {
  PRIVATE:  { label: "Private",  icon: Lock,    cls: "bg-zinc-100 text-zinc-600 border-zinc-200" },
  EVERYONE: { label: "Everyone", icon: Globe,   cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  TEAM:     { label: "Team",     icon: Users,   cls: "bg-blue-50 text-blue-700 border-blue-200" },
  CUSTOM:   { label: "Shared",   icon: UserCog, cls: "bg-violet-50 text-violet-700 border-violet-200" },
}

export function VisibilityBadge({ visibility }: { visibility: string }) {
  const v = VIS[visibility] ?? VIS.PRIVATE
  const Icon = v.icon
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", v.cls)}>
      <Icon className="h-3 w-3" />{v.label}
    </span>
  )
}

export function StarToggle({ pinned, onToggle }: { pinned: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle() }}
      className={cn("p-1 rounded-md transition-colors", pinned ? "text-amber-400 hover:text-amber-500" : "text-zinc-300 hover:text-zinc-500")}
      title={pinned ? "Remove from favorites" : "Add to favorites"}
    >
      <Star className="h-4 w-4" fill={pinned ? "currentColor" : "none"} />
    </button>
  )
}

export type SortDir = "asc" | "desc"

export function SortHeader<K extends string>({ label, col, sortKey, sortDir, onSort, className }: {
  label: string; col: K; sortKey: K; sortDir: SortDir; onSort: (col: K) => void; className?: string
}) {
  const active = sortKey === col
  return (
    <button
      onClick={() => onSort(col)}
      className={cn("group inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-400 hover:text-zinc-600", className)}
    >
      {label}
      {active
        ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
        : <ArrowDown className="h-3 w-3 opacity-0 group-hover:opacity-40" />}
    </button>
  )
}

export function ViewToggle({ mode, onChange }: { mode: "list" | "grid"; onChange: (m: "list" | "grid") => void }) {
  return (
    <div className="inline-flex rounded-lg border border-zinc-200 p-0.5">
      {(["list", "grid"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={cn("flex h-7 w-7 items-center justify-center rounded-md transition-colors", mode === m ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-800")}
          title={m === "list" ? "List view" : "Grid view"}
        >
          {m === "list" ? <List className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
        </button>
      ))}
    </div>
  )
}
