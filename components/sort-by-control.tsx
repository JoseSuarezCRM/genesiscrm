"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowUpDown, Check, Search, ArrowUp, ArrowDown } from "lucide-react"
import { cn } from "@/lib/utils"

// The toolbar's "Sort by" popover. Writes the same { key, dir } the table headers do,
// so clicking a header and picking here stay in sync.

export default function SortByControl({ options, value, onChange, open: openProp, onOpenChange }: {
  options: { key: string; label: string }[]
  value: { key: string; dir: "asc" | "desc" }
  onChange: (next: { key: string; dir: "asc" | "desc" }) => void
  /** Controlled open — lets the View settings panel's "Sort by" row drive it. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [openState, setOpenState] = useState(false)
  const controlled = openProp !== undefined
  const open = controlled ? openProp : openState
  const setOpen = (next: boolean | ((o: boolean) => boolean)) => {
    const v = typeof next === "function" ? next(open) : next
    if (!controlled) setOpenState(v)
    onOpenChange?.(v)
  }
  const [q, setQ] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) { setQ(""); return }
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  const active = options.find((o) => o.key === value.key)
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900">
        <ArrowUpDown className="h-3.5 w-3.5" /> Sort by
        {active && <span className="text-slate-400">· {active.label}</span>}
      </button>

      {open && (
        <div className="absolute left-0 top-10 z-50 flex max-h-80 w-64 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="relative border-b border-slate-100 p-2">
            <Search className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search properties…"
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-slate-400" />
          </div>
          <div className="flex gap-1 border-b border-slate-100 p-2">
            {(["asc", "desc"] as const).map((d) => (
              <button key={d} onClick={() => onChange({ ...value, dir: d })}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium",
                  value.dir === d ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                )}>
                {d === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                {d === "asc" ? "Ascending" : "Descending"}
              </button>
            ))}
          </div>
          <div className="overflow-y-auto py-1">
            {filtered.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">No properties found</p>}
            {filtered.map((o) => (
              <button key={o.key} onClick={() => { onChange({ ...value, key: o.key }); setOpen(false) }}
                className={cn("flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50", value.key === o.key && "bg-slate-50 font-medium")}>
                <span className="truncate">{o.label}</span>
                {value.key === o.key && <Check className="h-3.5 w-3.5 shrink-0 text-blue-600" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
