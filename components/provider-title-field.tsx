"use client"

import { useState, useRef, useEffect } from "react"
import { ChevronDown, Search } from "lucide-react"
import { cn } from "@/lib/utils"

// The shared provider title list. "Custom…" lets you type a free-form title.
export const PROVIDER_TITLE_OPTIONS = ["MD", "DO", "NP", "PA-C", "DPM", "DC", "PT", "OT", "RN", "Front Desk", "Manager", "Referral Coordinator"]

// An absolute-positioned dropdown (scrolls with its modal — no portal glitch)
// with a Custom option that reveals a text box. `value` is the final title.
export default function ProviderTitleField({ value, onChange, className, placeholder = "— Select —" }: {
  value: string
  onChange: (v: string) => void
  className?: string
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [customMode, setCustomMode] = useState(!!value && !PROVIDER_TITLE_OPTIONS.includes(value))
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery("") } }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [open])

  const pick = (t: string) => { onChange(t); setCustomMode(false); setOpen(false); setQuery("") }
  const q = query.trim().toLowerCase()
  const filtered = q ? PROVIDER_TITLE_OPTIONS.filter((t) => t.toLowerCase().includes(q)) : PROVIDER_TITLE_OPTIONS

  return (
    <div className="space-y-1.5" ref={ref}>
      <div className="relative">
        <button type="button" onClick={() => { setOpen((o) => !o); setQuery("") }}
          className={cn("w-full flex items-center justify-between rounded-md border border-input bg-white px-3 py-2 text-sm text-left hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-ring", className)}>
          <span className={value || customMode ? "text-slate-800" : "text-slate-400"}>{customMode ? "Custom…" : (value || placeholder)}</span>
          <ChevronDown className={cn("h-4 w-4 text-slate-400 shrink-0 transition-transform", open && "rotate-180")} />
        </button>
        {open && (
          <div className="absolute z-50 w-full mt-1 flex flex-col max-h-64 bg-white border border-slate-200 rounded-md shadow-lg overflow-hidden">
            <div className="p-1.5 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search titles…"
                  className="w-full pl-8 pr-2 py-1.5 text-sm rounded-md focus:outline-none" />
              </div>
            </div>
            <div className="overflow-y-auto py-1">
              {!q && <button type="button" onClick={() => pick("")} className="w-full text-left px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-50">{placeholder}</button>}
              {filtered.map((t) => (
                <button key={t} type="button" onClick={() => pick(t)}
                  className={cn("w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50", value === t && !customMode && "bg-blue-50 text-blue-700 font-medium")}>{t}</button>
              ))}
              {filtered.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">No matching titles</p>}
              <button type="button" onClick={() => { setCustomMode(true); onChange(""); setOpen(false); setQuery("") }}
                className={cn("w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 border-t border-slate-100", customMode && "bg-blue-50 text-blue-700 font-medium")}>Custom…</button>
            </div>
          </div>
        )}
      </div>
      {customMode && (
        <input value={value} onChange={(e) => onChange(e.target.value)} autoFocus placeholder="Type a title (e.g. Director of Care)"
          className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
      )}
    </div>
  )
}
