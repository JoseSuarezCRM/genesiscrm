"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

// Styled calendar picker — a drop-in for native <input type="date">/<input
// type="datetime-local"> that matches the app's dropdown design (portaled panel,
// zinc/slate palette, blue accent). Mirrors MultiSelectField's contract so the
// record-card FieldRow can swap it in: onCommit fires the native-format string
// ("yyyy-mm-dd" or "yyyy-mm-ddThh:mm"), onCancel closes without saving.
interface Props {
  value: any
  withTime?: boolean
  onCommit: (v: string) => void
  onCancel: () => void
  /** Open the calendar as soon as it mounts (inline click-to-edit). Default true. */
  autoOpen?: boolean
}

const pad = (n: number) => String(n).padStart(2, "0")
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

// Parse the stored value into a local Date. Date-only values are kept as UTC
// midnight in the DB, so read the calendar day from the string (not new Date(),
// which would shift a day in negative timezones); datetime is a real instant.
function parseValue(value: any, withTime?: boolean): Date | null {
  if (value === null || value === undefined || value === "") return null
  if (!withTime && typeof value === "string") {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  }
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

export default function DatePicker({ value, withTime, onCommit, onCancel, autoOpen = true }: Props) {
  const initial = parseValue(value, withTime)
  const [selected, setSelected] = useState<Date | null>(initial)
  const [time, setTime] = useState<string>(initial && withTime ? `${pad(initial.getHours())}:${pad(initial.getMinutes())}` : "09:00")
  const [view, setView] = useState(() => { const b = initial ?? new Date(); return { y: b.getFullYear(), m: b.getMonth() } })
  const [open, setOpen] = useState(autoOpen)
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number }>({ left: 0 })

  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const selRef = useRef(selected); selRef.current = selected
  const timeRef = useRef(time); timeRef.current = time
  const PANEL_W = 288

  function place() {
    const r = triggerRef.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom
    const above = r.top
    const panelH = withTime ? 400 : 356
    const openUp = below < panelH && above > below
    const left = Math.max(8, Math.min(r.left, window.innerWidth - PANEL_W - 8))
    setPos(openUp ? { left, bottom: window.innerHeight - r.top + 4 } : { left, top: r.bottom + 4 })
  }

  function emit(d: Date) { onCommit(withTime ? `${toDateStr(d)}T${timeRef.current || "00:00"}` : toDateStr(d)) }

  useEffect(() => { place() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return
      // Click-away: datetime commits the current selection (like the other inline
      // editors); date-only already committed on the day click, so just close.
      if (withTime && selRef.current) emit(selRef.current)
      else onCancel()
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onCancel() }
    function onMove() { place() }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    window.addEventListener("resize", onMove)
    window.addEventListener("scroll", onMove, true)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("resize", onMove)
      window.removeEventListener("scroll", onMove, true)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const today = new Date()
  const firstWeekday = new Date(view.y, view.m, 1).getDay()
  const gridStart = new Date(view.y, view.m, 1 - firstWeekday)
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d })

  function pickDay(d: Date) {
    setSelected(d)
    if (withTime) setView({ y: d.getFullYear(), m: d.getMonth() })
    else emit(d) // date-only: choosing a day commits immediately
  }
  function goToday() {
    const t = new Date()
    setSelected(t); setView({ y: t.getFullYear(), m: t.getMonth() })
    if (!withTime) emit(t)
  }
  const step = (delta: number) => setView((v) => { const d = new Date(v.y, v.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() } })

  const triggerLabel = selected
    ? selected.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + (withTime ? `, ${time}` : "")
    : (withTime ? "mm/dd/yyyy, --:--" : "mm/dd/yyyy")

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { if (!open) place(); setOpen((o) => !o) }}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm text-left hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span className={cn("flex-1 truncate", selected ? "text-slate-800" : "text-slate-400")}>{triggerLabel}</span>
        <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          data-select-menu-open=""
          onPointerDown={(e) => e.stopPropagation()}
          className="fixed z-[999] bg-white border border-slate-200 rounded-xl shadow-lg p-3"
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: PANEL_W, pointerEvents: "auto" }}
        >
          {/* Month nav */}
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-sm font-semibold text-slate-800">{MONTHS[view.m]} {view.y}</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => step(-1)} className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100" title="Previous month"><ChevronLeft className="h-4 w-4" /></button>
              <button type="button" onClick={() => step(1)} className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100" title="Next month"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((w) => <div key={w} className="h-7 flex items-center justify-center text-[11px] font-medium text-slate-400">{w}</div>)}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              const inMonth = d.getMonth() === view.m
              const isSel = selected && sameDay(d, selected)
              const isToday = sameDay(d, today)
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickDay(d)}
                  className={cn(
                    "h-8 w-full flex items-center justify-center rounded-lg text-sm transition-colors",
                    isSel ? "bg-blue-600 text-white font-semibold hover:bg-blue-600"
                      : inMonth ? "text-slate-700 hover:bg-slate-100" : "text-slate-300 hover:bg-slate-50",
                    !isSel && isToday && "ring-1 ring-inset ring-blue-300 font-semibold text-blue-600",
                  )}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>

          {/* Time (datetime only) */}
          {withTime && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Time</span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-zinc-400"
              />
            </div>
          )}

          {/* Footer */}
          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
            <button type="button" onClick={() => onCommit("")} className="text-xs font-medium text-slate-500 hover:text-slate-700">Clear</button>
            <div className="flex items-center gap-3">
              <button type="button" onClick={goToday} className="text-xs font-medium text-blue-600 hover:text-blue-700">Today</button>
              {withTime && <button type="button" onClick={() => selected && emit(selected)} disabled={!selected} className="text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-40">Apply</button>}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
