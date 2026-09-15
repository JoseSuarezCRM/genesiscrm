"use client"

import { createContext, useCallback, useContext, useRef, useState } from "react"

// The planner's own toast, matching the v10 dashboard's toast() (its four tones
// carry meaning — a refused drag is a warning, a saved move is a success). The
// CRM's global showToast has no tones, so the planner keeps this local one and
// the styles that came with it.

export type ToastTone = "success" | "error" | "info" | "warn"

interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}

const ToastCtx = createContext<((message: string, tone?: ToastTone) => void) | null>(null)

/** Fire a planner toast. Safe to call from any planner component. */
export function usePlannerToast() {
  const fn = useContext(ToastCtx)
  if (!fn) throw new Error("usePlannerToast must be used within PlannerToastHost")
  return fn
}

const DURATION_MS = 3600

export function PlannerToastHost({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const toast = useCallback((message: string, tone: ToastTone = "info") => {
    const id = nextId.current++
    setItems((prev) => [...prev, { id, message, tone }])
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), DURATION_MS)
  }, [])

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toast-container">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>{t.message}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
