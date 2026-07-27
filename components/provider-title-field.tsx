"use client"

import { useState, useRef, useEffect } from "react"
import { ChevronDown } from "lucide-react"
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
  const [customMode, setCustomMode] = useState(!!value && !PROVIDER_TITLE_OPTIONS.includes(value))
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [open])

  const pick = (t: string) => { onChange(t); setCustomMode(false); setOpen(false) }

  return (
    <div className="space-y-1.5" ref={ref}>
      <div className="relative">
        <button type="button" onClick={() => setOpen((o) => !o)}
          className={cn("w-full flex items-center justify-between rounded-md border border-input bg-white px-3 py-2 text-sm text-left hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-ring", className)}>
          <span className={value || customMode ? "text-slate-800" : "text-slate-400"}>{customMode ? "Custom…" : (value || placeholder)}</span>
          <ChevronDown className={cn("h-4 w-4 text-slate-400 shrink-0 transition-transform", open && "rotate-180")} />
        </button>
        {open && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-56 overflow-y-auto py-1">
            <button type="button" onClick={() => pick("")} className="w-full text-left px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-50">{placeholder}</button>
            {PROVIDER_TITLE_OPTIONS.map((t) => (
              <button key={t} type="button" onClick={() => pick(t)}
                className={cn("w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50", value === t && !customMode && "bg-blue-50 text-blue-700 font-medium")}>{t}</button>
            ))}
            <button type="button" onClick={() => { setCustomMode(true); onChange(""); setOpen(false) }}
              className={cn("w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 border-t border-slate-100", customMode && "bg-blue-50 text-blue-700 font-medium")}>Custom…</button>
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
