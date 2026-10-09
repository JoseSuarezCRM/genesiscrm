"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Search } from "lucide-react"
import { NAV_ICONS, NAV_ICON_NAMES, navIcon } from "@/lib/nav-icons"
import { cn } from "@/lib/utils"

const PANEL_W = 312
const PANEL_H = 340

/**
 * A searchable grid of the curated menu icons (lib/nav-icons.tsx). The trigger
 * shows the current icon; the panel renders in a portal so a card's overflow
 * never clips it.
 */
export default function IconPicker({ value, onChange, size = "md", title = "Change icon" }: {
  value: string
  onChange: (name: string) => void
  size?: "sm" | "md"
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const Current = navIcon(value)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const below = r.bottom + 6 + PANEL_H <= window.innerHeight
    setPos({
      top: below ? r.bottom + 6 : Math.max(8, r.top - 6 - PANEL_H),
      left: Math.min(Math.max(8, r.left), window.innerWidth - PANEL_W - 8),
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!panelRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    const onScroll = (e: Event) => { if (!panelRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    window.addEventListener("scroll", onScroll, true)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("scroll", onScroll, true)
    }
  }, [open])

  const names = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return NAV_ICON_NAMES
    return NAV_ICON_NAMES.filter((n) => n.toLowerCase().includes(q) || NAV_ICONS[n].keywords.includes(q))
  }, [query])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={title}
        onClick={() => { setOpen((o) => !o); setQuery("") }}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50",
          size === "sm" ? "h-8 w-8" : "h-9 w-9",
          open && "border-zinc-400",
        )}
      >
        <Current className="h-4 w-4" />
      </button>
      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{ top: pos.top, left: pos.left, width: PANEL_W, height: PANEL_H }}
          className="fixed z-[100] flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl"
        >
          <div className="border-b border-zinc-100 p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search icons…"
                className="h-8 w-full rounded-lg border border-zinc-200 pl-8 pr-2 text-sm focus:border-zinc-400 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {names.length === 0 ? (
              <p className="py-8 text-center text-xs text-zinc-400">No icons match “{query}”.</p>
            ) : (
              <div className="grid grid-cols-8 gap-1">
                {names.map((n) => {
                  const Icon = NAV_ICONS[n].Icon
                  const selected = n === value
                  return (
                    <button
                      key={n}
                      type="button"
                      title={n}
                      onClick={() => { onChange(n); setOpen(false) }}
                      className={cn(
                        "inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                        selected ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
