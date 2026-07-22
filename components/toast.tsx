"use client"

import { useEffect, useState } from "react"
import { Check, X } from "lucide-react"

// Minimal global toast. Call showToast() from anywhere; <ToastHost/> (mounted once
// in the dashboard layout) renders them bottom-left, HubSpot-style, with optional Undo.

interface ToastData { id: number; message: string; undo?: () => void }

let counter = 0
export function showToast(message: string, undo?: () => void) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent("gosm-toast", { detail: { id: ++counter, message, undo } }))
}

export default function ToastHost() {
  const [toasts, setToasts] = useState<ToastData[]>([])

  useEffect(() => {
    function onToast(e: Event) {
      const t = (e as CustomEvent).detail as ToastData
      setToasts((prev) => [...prev, t])
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 4000)
    }
    window.addEventListener("gosm-toast", onToast)
    return () => window.removeEventListener("gosm-toast", onToast)
  }, [])

  const dismiss = (id: number) => setToasts((prev) => prev.filter((x) => x.id !== id))

  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-4 left-4 z-[1000] flex flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id}
          className="flex items-center gap-2.5 bg-white border border-slate-200 shadow-lg rounded-xl pl-3 pr-2 py-2.5 text-sm animate-toast-in">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shrink-0"><Check className="h-3.5 w-3.5" /></span>
          <span className="text-slate-800 font-medium">{t.message}</span>
          {t.undo && (
            <button onClick={() => { t.undo!(); dismiss(t.id) }} className="ml-1 text-blue-600 hover:text-blue-700 font-medium underline underline-offset-2">Undo</button>
          )}
          <button onClick={() => dismiss(t.id)} className="ml-1 text-slate-300 hover:text-slate-500"><X className="h-3.5 w-3.5" /></button>
        </div>
      ))}
    </div>
  )
}
