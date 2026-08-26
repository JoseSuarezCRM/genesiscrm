"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { useCardReorder } from "@/components/use-card-reorder"
import StyledSelect from "@/components/ui/styled-select"
import { Search, X, GripVertical, Lock } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

export interface ChooserColumn { key: string; label: string; group?: string }

// Group the catalog: ungrouped ("own") fields first, then one section per group.
function groupCatalog(cols: ChooserColumn[]): [string, ChooserColumn[]][] {
  const order: string[] = []
  const map = new Map<string, ChooserColumn[]>()
  for (const c of cols) {
    const g = c.group ?? ""
    if (!map.has(g)) { map.set(g, []); order.push(g) }
    map.get(g)!.push(c)
  }
  // keep ungrouped ("") first, groups after in first-seen order
  order.sort((a, b) => (a === "" ? -1 : b === "" ? 1 : 0))
  return order.map((g) => [g, map.get(g)!])
}

interface Props {
  open: boolean
  onClose: () => void
  /** Every choosable column (the catalog). */
  columns: ChooserColumn[]
  /** Currently selected column keys, in display order (excluding `required`). */
  selected: string[]
  /** Always-on, non-removable leading columns (e.g. the primary name). */
  required?: string[]
  frozen: number
  maxFrozen?: number
  onApply: (selected: string[], frozen: number) => void
  /** Optional "create a property" link shown under the left list. */
  createHref?: string
}

// HubSpot-style "Choose which columns you see" modal: searchable catalog on the
// left, a drag-reorderable + removable "Selected columns" list on the right, a
// frozen-columns count, and Apply / Cancel / Remove all.
export default function ColumnChooserModal({ open, onClose, columns, selected, required = [], frozen, maxFrozen, onApply, createHref }: Props) {
  const reqSet = new Set(required)
  const labelOf = (k: string) => columns.find((c) => c.key === k)?.label ?? k

  // Working state (non-required selected, ordered) — reseeded each time it opens.
  const [nonReq, setNonReq] = useState<string[]>(selected.filter((k) => !reqSet.has(k)))
  const [fr, setFr] = useState<number>(frozen)
  const [q, setQ] = useState("")
  useEffect(() => {
    if (open) { setNonReq(selected.filter((k) => !reqSet.has(k))); setFr(frozen); setQ("") }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const reorder = useCardReorder(nonReq, (k) => k, (ids) => setNonReq(ids))

  const query = q.trim().toLowerCase()
  const shownCatalog = query ? columns.filter((c) => c.label.toLowerCase().includes(query)) : columns
  const isSelected = (k: string) => reqSet.has(k) || nonReq.includes(k)
  const toggle = (k: string) => {
    if (reqSet.has(k)) return
    setNonReq((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))
  }

  const totalSelected = required.length + nonReq.length
  const frozenMax = Math.min(maxFrozen ?? totalSelected, totalSelected)
  const frozenOptions = Array.from({ length: frozenMax + 1 }, (_, i) => i)

  const apply = () => { onApply([...required, ...reorder.order], Math.min(fr, totalSelected)); onClose() }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Choose which columns you see</h2>
        </div>

        <div className="grid grid-cols-2 divide-x divide-slate-100">
          {/* Left: searchable catalog */}
          <div className="p-4 flex flex-col min-h-[420px] max-h-[60vh]">
            <div className="relative shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search columns..."
                className="w-full h-10 pl-9 pr-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-zinc-400" />
            </div>
            <div className="mt-3 flex-1 overflow-y-auto -mx-1 px-1">
              {shownCatalog.length === 0 ? (
                <p className="px-2 py-3 text-sm text-slate-400">No matches</p>
              ) : groupCatalog(shownCatalog).map(([group, items]) => (
                <div key={group || "__ungrouped"}>
                  {group && <p className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{group}</p>}
                  {items.map((c) => (
                    <label key={c.key} className={cn("flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm cursor-pointer hover:bg-slate-50", reqSet.has(c.key) && "opacity-60 cursor-not-allowed")}>
                      <input type="checkbox" checked={isSelected(c.key)} disabled={reqSet.has(c.key)} onChange={() => toggle(c.key)}
                        className="h-4 w-4 rounded border-slate-300 accent-blue-600" />
                      <span className="text-slate-700 truncate">{c.label}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
            {createHref && (
              <p className="shrink-0 pt-3 mt-1 border-t border-slate-100 text-xs text-slate-500">
                Don't see the property you're looking for?{" "}
                <Link href={createHref} className="text-blue-600 font-medium hover:underline">Create a property</Link>
              </p>
            )}
          </div>

          {/* Right: selected columns */}
          <div className="p-4 flex flex-col min-h-[420px] max-h-[60vh]">
            <div className="shrink-0 flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected columns ({totalSelected})</span>
              <label className="flex items-center gap-2 text-xs text-slate-500">
                Frozen columns
                <StyledSelect value={String(fr)} onChange={(e) => setFr(Number(e.target.value))} className="w-16">
                  {frozenOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                </StyledSelect>
              </label>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5 -mx-1 px-1">
              {required.map((k) => (
                <div key={k} className="flex items-center gap-2 px-3 h-11 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600">
                  <Lock className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                  <span className="flex-1 truncate">{labelOf(k)}</span>
                </div>
              ))}
              {reorder.order.map((k) => (
                <div key={k}
                  {...reorder.cardProps(k)}
                  className={cn("flex items-center gap-2 pl-2 pr-2 h-11 rounded-lg border border-slate-200 bg-white text-sm text-slate-800", reorder.dragging === k && "opacity-50")}>
                  <span {...reorder.handleProps(k)} className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500"><GripVertical className="h-4 w-4" /></span>
                  <span className="flex-1 truncate">{labelOf(k)}</span>
                  <button type="button" onClick={() => setNonReq((prev) => prev.filter((x) => x !== k))} className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              {totalSelected === 0 && <p className="px-2 py-3 text-sm text-slate-400">No columns selected.</p>}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center gap-3">
          <button type="button" onClick={apply} className="h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">Apply</button>
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={() => { setNonReq([]); setFr(Math.min(fr, required.length)) }} className="ml-auto text-sm text-slate-500 hover:text-slate-700 font-medium">Remove all columns</button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
