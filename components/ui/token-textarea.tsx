"use client"

import { useState, useRef } from "react"
import { Braces, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export interface TokenItem { label: string; value: string }

interface Props {
  value: string
  onChange: (v: string) => void
  tokens: TokenItem[]
  rows?: number
  placeholder?: string
  className?: string
}

// A textarea with a "{} Fields" dropdown that inserts a personalization token at
// the cursor — the plain-text counterpart to the rich editor's token menu.
export default function TokenTextarea({ value, onChange, tokens, rows = 4, placeholder, className }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  function insert(token: string) {
    const el = ref.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    onChange(value.slice(0, start) + token + value.slice(end))
    setOpen(false)
    requestAnimationFrame(() => {
      if (el) { el.focus(); const p = start + token.length; el.setSelectionRange(p, p) }
    })
  }

  return (
    <div>
      {tokens.length > 0 && (
        <div className="flex justify-end mb-1">
          <div className="relative">
            <button type="button" onClick={() => setOpen((o) => !o)}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 border border-slate-200 rounded-md px-2 py-1 hover:border-slate-400">
              <Braces className="h-3 w-3" /> Fields <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
            {open && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                <div className="absolute right-0 top-8 z-50 w-52 max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl py-1">
                  {tokens.map((t) => (
                    <button key={t.value} type="button" onClick={() => insert(t.value)}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 flex items-center justify-between gap-2">
                      <span className="text-slate-700 truncate">{t.label}</span>
                      <span className="text-[11px] text-slate-400 font-mono shrink-0">{t.value}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
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
