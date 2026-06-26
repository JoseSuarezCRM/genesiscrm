"use client"

import React, { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, Check } from "lucide-react"
import { cn } from "@/lib/utils"

// Drop-in replacement for native <select> with the app's dropdown panel design.
// Accepts <option> children like a native select and calls onChange with an
// event-shaped object so existing `e.target.value` handlers keep working.
// The dropdown panel renders in a portal (fixed-positioned) so it is never
// clipped by a scrollable/overflow-hidden ancestor (e.g. a modal).
interface Props {
  value: string | number | undefined
  onChange: (e: { target: { value: string } }) => void
  children: React.ReactNode
  className?: string
  disabled?: boolean
}

type Option = { value: string; label: string }

function collectOptions(children: React.ReactNode, out: Option[]) {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    if (child.type === "option") {
      const p = child.props as any
      const label = React.Children.toArray(p.children)
        .map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : ""))
        .join("")
      out.push({ value: String(p.value ?? label), label })
    } else if ((child.props as any)?.children) {
      collectOptions((child.props as any).children, out)
    }
  })
}

export default function StyledSelect({ value, onChange, children, className, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Layout classes (width/flex/grid) belong on the wrapper; the rest style the trigger
  const classes = (className ?? "").split(/\s+/).filter(Boolean)
  const layoutClasses = classes.filter((c) =>
    /^(w-|flex-1|flex-auto|flex-none|grow|shrink|basis|col-span|row-span|self-|min-w|max-w|h-full|m[trblxy]?-)/.test(c)
  )
  const triggerClasses = classes.filter((c) => !layoutClasses.includes(c))

  const options: Option[] = []
  collectOptions(children, options)

  const current = options.find((o) => o.value === String(value ?? ""))
  const display = current ?? options[0]

  const openMenu = () => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 4, left: r.left, width: r.width })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    // Reposition is hard while scrolling — just close to avoid a detached panel.
    function onScrollOrResize() { setOpen(false) }
    document.addEventListener("mousedown", onMouseDown)
    document.addEventListener("keydown", onKeyDown)
    window.addEventListener("scroll", onScrollOrResize, true)
    window.addEventListener("resize", onScrollOrResize)
    return () => {
      document.removeEventListener("mousedown", onMouseDown)
      document.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("scroll", onScrollOrResize, true)
      window.removeEventListener("resize", onScrollOrResize)
    }
  }, [open])

  return (
    <div className={cn("relative", layoutClasses)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-3 py-2 border border-slate-200 rounded-md bg-white text-sm text-left hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed",
          triggerClasses
        )}
      >
        <span className={cn("flex-1 truncate", display?.label ? "text-slate-800" : "text-slate-400")}>
          {display?.label || "Select..."}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: pos.width }}
          className="z-[200] bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto py-1"
        >
          {options.map((o, i) => {
            const isSelected = current ? o.value === current.value : i === 0
            return (
              <button
                key={`${o.value}-${i}`}
                type="button"
                onClick={() => { onChange({ target: { value: o.value } }); setOpen(false) }}
                className={cn(
                  "w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50 transition-colors",
                  isSelected ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-800"
                )}
              >
                <span className="truncate">{o.label || "—"}</span>
                {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </div>
  )
}
