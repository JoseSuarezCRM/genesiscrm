"use client"

import React, { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, Check } from "lucide-react"
import { cn } from "@/lib/utils"

// Drop-in replacement for native <select> with the app's dropdown panel design.
// Accepts <option> children like a native select and calls onChange with an
// event-shaped object so existing `e.target.value` handlers keep working.
// The panel is portaled to <body> with fixed positioning so it's never clipped
// by a card's overflow.
interface Props {
  value: string | number | undefined
  onChange: (e: { target: { value: string } }) => void
  children: React.ReactNode
  className?: string
  disabled?: boolean
  /** Open the menu as soon as it mounts (for click-to-edit inline fields). */
  autoOpen?: boolean
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
      // optgroup, fragments, etc.
      collectOptions((child.props as any).children, out)
    }
  })
}

export default function StyledSelect({ value, onChange, children, className, disabled, autoOpen }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number }>({ left: 0, width: 0, maxHeight: 288 })

  // Open on mount when requested (one-click inline editing).
  useEffect(() => { if (autoOpen && !disabled) { place(); setOpen(true) } }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Layout classes (width/flex/grid) belong on the wrapper; the rest style the trigger
  const classes = (className ?? "").split(/\s+/).filter(Boolean)
  const layoutClasses = classes.filter((c) =>
    /^(w-|flex-1|flex-auto|flex-none|grow|shrink|basis|col-span|row-span|self-|min-w|max-w|h-full|m[trblxy]?-)/.test(c)
  )
  const triggerClasses = classes.filter((c) => !layoutClasses.includes(c))

  const options: Option[] = []
  collectOptions(children, options)

  const current = options.find((o) => o.value === String(value ?? ""))
  // Native selects display the first option when the value doesn't match any
  const display = current ?? options[0]

  function place() {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom
    const above = r.top
    const openUp = below < 240 && above > below
    setPos(openUp
      ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4, maxHeight: Math.min(288, above - 12) }
      : { left: r.left, width: r.width, top: r.bottom + 4, maxHeight: Math.min(288, below - 12) })
  }

  function toggle() {
    if (disabled) return
    if (!open) place()
    setOpen((o) => !o)
  }

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node
      if (!ref.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false) }
    function onScrollOrResize() { place() }
    document.addEventListener("mousedown", onMouseDown)
    document.addEventListener("keydown", onKeyDown)
    window.addEventListener("resize", onScrollOrResize)
    window.addEventListener("scroll", onScrollOrResize, true)
    return () => {
      document.removeEventListener("mousedown", onMouseDown)
      document.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("resize", onScrollOrResize)
      window.removeEventListener("scroll", onScrollOrResize, true)
    }
  }, [open])

  return (
    <div ref={ref} className={cn("relative", layoutClasses)}>
      <button
        type="button"
        disabled={disabled}
        onClick={toggle}
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

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          // Portaled to <body>: a Radix modal Dialog disables pointer events outside
          // its content (pointerEvents:auto re-enables them) and dismisses on outside
          // pointerdown (stopPropagation keeps it from closing the parent dialog).
          onPointerDown={(e) => e.stopPropagation()}
          className="fixed z-[999] bg-white border border-slate-200 rounded-md shadow-lg overflow-y-auto py-1"
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxHeight, pointerEvents: "auto" }}
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
