"use client"

import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

// One shared selection bar for every list — HubSpot style: a full-width light
// bar above the table with text-link actions and a clear (X) on the right.
// `embedded` renders it flat (as a header row inside a table card).
export default function BulkActionBar({ count, onClear, children, embedded }: {
  count: number
  onClear: () => void
  children?: React.ReactNode
  embedded?: boolean
}) {
  if (count <= 0) return null
  return (
    <div className={cn(
      "flex flex-wrap items-center gap-0.5 px-3 py-1.5 animate-bar-in",
      embedded ? "border-b border-slate-200 bg-slate-50/70" : "bg-white border border-slate-200 rounded-xl shadow-sm",
    )}>
      <span className="text-sm font-semibold text-slate-700 px-2 whitespace-nowrap">{count} selected</span>
      <span className="w-px h-5 bg-slate-200 mx-1" />
      {children}
      <button onClick={onClear} title="Clear selection" className="ml-auto h-7 w-7 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

// Consistent styling for the action buttons placed inside the bar (text links).
export const bulkBtn = "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
export const bulkDanger = "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
