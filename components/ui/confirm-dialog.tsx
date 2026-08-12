"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

export type ConfirmOptions = {
  title?: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button. Auto-inferred from the message verb when omitted. */
  destructive?: boolean
}

let openFn: ((opts: ConfirmOptions) => Promise<boolean>) | null = null

// Leading action verb of a message → used to label the confirm button and pick
// the tone (destructive vs. neutral) without per-call configuration.
const ACTION_VERB = /^(delete|remove|revoke|deactivate|clear|disable|cancel|discard|archive|deauthorize|unlink|reset|merge|continue|run)\b/i
const NEUTRAL_VERB = /^(continue|run|merge)$/i

// Imperative styled confirm — a drop-in for window.confirm. Pass a message string
// (the confirm label + tone are inferred from its leading verb) or an options
// object. Resolves true on confirm, false on cancel. Falls back to the native
// confirm if the host isn't mounted yet.
export function confirmDialog(input: string | ConfirmOptions): Promise<boolean> {
  const opts: ConfirmOptions = typeof input === "string" ? { description: input } : input
  if (!openFn) {
    if (typeof window === "undefined") return Promise.resolve(false)
    return Promise.resolve(window.confirm(opts.description ?? opts.title ?? "Are you sure?"))
  }
  return openFn(opts)
}

// Mount once (e.g. in the dashboard layout). Renders the active confirm modal.
export function ConfirmDialogHost() {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null)

  useEffect(() => {
    openFn = (opts) => new Promise<boolean>((resolve) => setState({ opts, resolve }))
    return () => { openFn = null }
  }, [])

  useEffect(() => {
    if (!state) return
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") { state!.resolve(false); setState(null) } }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [state])

  if (!state || typeof document === "undefined") return null
  const { opts, resolve } = state
  const close = (v: boolean) => { resolve(v); setState(null) }

  const desc = opts.description ?? ""
  const verb = desc.match(ACTION_VERB)?.[0] ?? ""
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
  const destructive = opts.destructive ?? (verb ? !NEUTRAL_VERB.test(verb) : true)
  const confirmLabel = opts.confirmLabel ?? (verb ? cap(verb) : "Confirm")
  const title = opts.title ?? "Are you sure?"

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/40" onClick={() => close(false)} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-5">
        <div className="flex items-start gap-3">
          <div className={cn("shrink-0 h-9 w-9 rounded-full flex items-center justify-center", destructive ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600")}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {desc && <p className="mt-1 text-sm text-slate-600 whitespace-pre-line">{desc}</p>}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => close(false)} className="px-3.5 py-2 text-sm font-medium text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
            {opts.cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => close(true)}
            className={cn("px-3.5 py-2 text-sm font-medium text-white rounded-lg transition-colors", destructive ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700")}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
