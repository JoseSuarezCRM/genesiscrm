"use client"

import { useCallback, useRef, useState } from "react"
import { cn } from "@/lib/utils"

// Reusable column resizing for any <table>. Store widths per column key; drop a
// <colgroup> using colWidth(key), and put a <ColResizer> in each header cell.
export function useColumnResize(storageKey?: string) {
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    if (storageKey && typeof window !== "undefined") {
      try { return JSON.parse(localStorage.getItem(storageKey) || "{}") } catch {}
    }
    return {}
  })
  const drag = useRef<{ key: string; startX: number; startW: number } | null>(null)

  const startResize = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const th = (e.currentTarget as HTMLElement).closest("th") as HTMLElement | null
    const startW = th?.getBoundingClientRect().width ?? 150
    drag.current = { key, startX: e.clientX, startW }
    const move = (ev: MouseEvent) => {
      if (!drag.current) return
      const w = Math.max(64, Math.round(drag.current.startW + (ev.clientX - drag.current.startX)))
      setWidths((prev) => ({ ...prev, [drag.current!.key]: w }))
    }
    const up = () => {
      document.removeEventListener("mousemove", move)
      document.removeEventListener("mouseup", up)
      drag.current = null
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      if (storageKey) setWidths((prev) => { try { localStorage.setItem(storageKey, JSON.stringify(prev)) } catch {}; return prev })
    }
    document.addEventListener("mousemove", move)
    document.addEventListener("mouseup", up)
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }, [storageKey])

  const colWidth = useCallback((key: string): number | undefined => widths[key], [widths])

  return { widths, colWidth, startResize }
}

// The drag handle to place (absolutely) at the right edge of a header cell.
// The parent <th> must be `relative` (and ideally `group/th`).
export function ColResizer({ onMouseDown, className }: { onMouseDown: (e: React.MouseEvent) => void; className?: string }) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize select-none touch-none",
        "hover:bg-blue-400 active:bg-blue-500 transition-colors",
        className,
      )}
    />
  )
}
