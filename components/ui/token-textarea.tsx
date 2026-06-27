"use client"

import { useState, useRef } from "react"
import { Braces, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
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
// the same nested-category drill-down look.
export default function TokenTextarea({ value, onChange, tokenGroups, tokens, rows = 4, placeholder, className }: Props) {
  const [open, setOpen] = useState(false)
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)

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

  function close() { setOpen(false); setActiveGroup(null) }

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

  return (
    <div>
      <div className="flex justify-end mb-1">
        <div className="relative">
          <button type="button" onClick={() => (open ? close() : setOpen(true))}
            className={cn(
              "inline-flex items-center gap-1 h-7 px-1.5 rounded-md text-xs font-medium transition-colors",
              open ? "bg-zinc-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
            )}>
            <Braces className="h-3.5 w-3.5" /> Fields <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={close} />
              <div className="absolute right-0 top-8 z-50 w-56 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl py-1">
                {flat || current ? (
                  <>
                    {!flat && (
                      <button type="button" onClick={() => setActiveGroup(null)}
                        className="w-full text-left px-3 py-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 border-b border-slate-100 mb-1">
                        <ChevronLeft className="h-3.5 w-3.5" /> {current!.group}
                      </button>
                    )}
                    {(flat ? groups[0].tokens : current!.tokens).map((t) => (
                      <button key={t.value} type="button" onClick={() => insert(t.value)}
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center justify-between gap-2">
                        <span className="text-sm text-slate-700 truncate">{t.label}</span>
                        <span className="text-xs text-slate-400 font-mono shrink-0">{t.value}</span>
                      </button>
                    ))}
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
