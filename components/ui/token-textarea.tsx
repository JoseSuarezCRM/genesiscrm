"use client"

import { useState, useRef } from "react"
import { Braces, ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react"
import { cn } from "@/lib/utils"

export interface TokenItem { label: string; value: string }
export interface TokenGroup { group: string; tokens: TokenItem[] }

interface Props {
  value: string
  onChange: (v: string) => void
  // Provide grouped tokens (drill-down menu) or a flat list (single menu).
  tokenGroups?: TokenGroup[]
  tokens?: TokenItem[]
  rows?: number
  placeholder?: string
  className?: string
}

// A textarea with a "{} Fields" dropdown that inserts a personalization token at
// the cursor — the plain-text counterpart to the rich editor's token menu, with
// the same searchable, label-only look.
export default function TokenTextarea({ value, onChange, tokenGroups, tokens, rows = 4, placeholder, className }: Props) {
  const [open, setOpen] = useState(false)
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const ref = useRef<HTMLTextAreaElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  // Fixed positioning (computed from the button) so the menu escapes any
  // overflow-clipped container it lives in (e.g. a modal), like the email editor.
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; maxHeight: number }>({ left: 0, top: 0, maxHeight: 288 })

  function openMenu() {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) {
      const below = window.innerHeight - r.bottom
      const above = r.top
      const openUp = below < 260 && above > below
      // Right-align the 256px-wide menu under the button.
      const left = Math.max(8, r.right - 256)
      setPos(openUp
        ? { left, bottom: window.innerHeight - r.top + 4, maxHeight: Math.min(288, above - 16) }
        : { left, top: r.bottom + 4, maxHeight: Math.min(288, below - 16) })
    }
    setOpen(true)
  }

  const groups: TokenGroup[] = tokenGroups && tokenGroups.length > 0
    ? tokenGroups
    : (tokens && tokens.length > 0 ? [{ group: "", tokens }] : [])
  if (groups.length === 0) {
    return (
      <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder}
        className={cn("w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none", className)} />
    )
  }
  const flat = groups.length === 1 && !groups[0].group
  const current = groups.find((g) => g.group === activeGroup)

  const q = query.trim().toLowerCase()
  // Searching flattens every group into one filtered list.
  const searchHits = q
    ? groups.flatMap((g) => g.tokens
        .filter((t) => t.label.toLowerCase().includes(q) || t.value.toLowerCase().includes(q))
        .map((t) => ({ ...t, group: g.group })))
    : []

  function close() { setOpen(false); setActiveGroup(null); setQuery("") }

  function insert(token: string) {
    const el = ref.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    onChange(value.slice(0, start) + token + value.slice(end))
    close()
    requestAnimationFrame(() => {
      if (el) { el.focus(); const p = start + token.length; el.setSelectionRange(p, p) }
    })
  }

  const Row = (t: { label: string; value: string; group?: string }) => (
    <button key={t.value} type="button" onClick={() => insert(t.value)}
      className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2">
      <span className="text-sm text-slate-700 truncate">
        {t.label}{t.group ? <span className="text-slate-400"> · {t.group}</span> : null}
      </span>
    </button>
  )

  return (
    <div>
      <div className="flex justify-end mb-1">
        <div className="relative">
          <button ref={btnRef} type="button" onClick={() => (open ? close() : openMenu())}
            className={cn(
              "inline-flex items-center gap-1 h-7 px-1.5 rounded-md text-xs font-medium transition-colors",
              open ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
            )}>
            <Braces className="h-3.5 w-3.5" /> Fields <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-[998]" onClick={close} />
              <div
                className="fixed z-[999] w-64 flex flex-col bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
                style={{ left: pos.left, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
              >
                <div className="p-1.5 border-b border-slate-100">
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50">
                    <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search fields…"
                      className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none" />
                  </div>
                </div>
                <div className="overflow-y-auto py-1">
                  {q ? (
                    searchHits.length > 0 ? searchHits.map(Row)
                      : <p className="px-3 py-3 text-xs text-slate-400 text-center">No fields match “{query}”.</p>
                  ) : flat || current ? (
                    <>
                      {!flat && (
                        <button type="button" onClick={() => setActiveGroup(null)}
                          className="w-full text-left px-3 py-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 border-b border-slate-100 mb-1 sticky top-0 bg-white">
                          <ChevronLeft className="h-3.5 w-3.5" /> {current!.group}
                        </button>
                      )}
                      {(flat ? groups[0].tokens : current!.tokens).map(Row)}
                    </>
                  ) : (
                    groups.map((g) => (
                      <button key={g.group} type="button" onClick={() => setActiveGroup(g.group)}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between gap-2">
                        <span className="text-sm text-slate-700">{g.group}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={cn("w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none", className)}
      />
    </div>
  )
}
