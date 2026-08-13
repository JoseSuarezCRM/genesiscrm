"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { CLINIC_TZ, zonedParts, clinicDatetimeLocalToISO } from "@/lib/tz"

// Styled calendar picker — a drop-in for native <input type="date">/<input
// type="datetime-local"> that matches the app's dropdown design (portaled panel,
// zinc/slate palette, blue accent). Mirrors MultiSelectField's contract so the
// record-card FieldRow can swap it in. onCommit fires the final STORAGE value: a
// UTC-midnight ISO for date-only, and (for datetime) the UTC ISO of the picked
// CLINIC (Chicago) wall time — so datetime editing matches the Chicago display
// no matter the editor's own browser timezone. "" clears; onCancel is a no-save close.
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

// Parse the stored value into a Date whose LOCAL parts are the ones to show in
// the grid/time box. Date-only values are UTC midnight in the DB, so read the
// calendar day from the string (not new Date(), which would shift a day in a
// negative timezone). Datetime is a real instant → show its CLINIC (Chicago)
// wall parts, so the calendar day + time match how the value displays.
function parseValue(value: any, withTime?: boolean): Date | null {
  if (value === null || value === undefined || value === "") return null
  if (!withTime && typeof value === "string") {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  }
  const d = new Date(value)
  if (isNaN(d.getTime())) return null
  if (!withTime) return d
  const p = zonedParts(d, CLINIC_TZ)
  return new Date(p.year, p.month, p.day, p.hour, p.minute)
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

// mm/dd/yyyy string for the typable input.
function fmtDateInput(d: Date | null): string {
  return d ? `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}` : ""
}
// Parse a typed "m/d/yyyy" (2-digit years pivot at 50 → 1950–2049). Rejects
// invalid/overflow dates (e.g. 02/31/2020) so garbage is never committed.
function parseTypedDate(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!m) return null
  const month = Number(m[1]), day = Number(m[2])
  let year = Number(m[3])
  if (m[3].length <= 2) year = year >= 50 ? 1900 + year : 2000 + year
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return d
}

export default function DatePicker({ value, withTime, onCommit, onCancel, autoOpen = true }: Props) {
  const initial = parseValue(value, withTime)
  const [selected, setSelected] = useState<Date | null>(initial)
  const [time, setTime] = useState<string>(initial && withTime ? `${pad(initial.getHours())}:${pad(initial.getMinutes())}` : "09:00")
  const [view, setView] = useState(() => { const b = initial ?? new Date(); return { y: b.getFullYear(), m: b.getMonth() } })
  const [open, setOpen] = useState(autoOpen)
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number }>({ left: 0 })

  const triggerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const selRef = useRef(selected); selRef.current = selected
  const timeRef = useRef(time); timeRef.current = time
  const [typed, setTyped] = useState<string>(fmtDateInput(initial))
  const typedRef = useRef(typed); typedRef.current = typed
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

  // Emit the storage ISO. Date-only → UTC midnight of the picked day. Datetime →
  // interpret the picked day + time as CLINIC (Chicago) wall time, stored as UTC.
  function emit(d: Date) {
    if (!withTime) onCommit(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString())
    else onCommit(clinicDatetimeLocalToISO(`${toDateStr(d)}T${timeRef.current || "00:00"}`) ?? "")
    setOpen(false) // close our own panel (matters when mounted persistently, e.g. a form field)
  }
  function cancel() { onCancel(); setOpen(false) }

  // Commit whatever is in the typed box (empty clears; invalid just closes so the
  // prior value is kept). Used on click-away and Enter.
  function commitTyped() {
    const s = typedRef.current.trim()
    if (!s) { onCommit(""); setSelected(null); setOpen(false); return }
    const d = parseTypedDate(s)
    if (d) emit(d)
    else setOpen(false)
  }

  // Digits-only mask → mm/dd/yyyy; keeps `selected`/view in sync while typing.
  function onType(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 8)
    const out = digits.length > 4 ? `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
      : digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
    setTyped(out)
    const d = parseTypedDate(out)
    if (d) { setSelected(d); setView({ y: d.getFullYear(), m: d.getMonth() }) }
  }

  // Focus the text box on mount so you can type immediately (e.g. a DOB) without
  // navigating the calendar.
  useEffect(() => { place(); if (autoOpen) inputRef.current?.focus() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return
      commitTyped() // click-away commits the typed/selected value
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") cancel() }
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

  // "Today" highlight = the clinic's (Chicago) current calendar day.
  const tp = zonedParts(new Date(), CLINIC_TZ)
  const today = new Date(tp.year, tp.month, tp.day)
  const firstWeekday = new Date(view.y, view.m, 1).getDay()
  const gridStart = new Date(view.y, view.m, 1 - firstWeekday)
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d })

  function pickDay(d: Date) {
    setSelected(d); setTyped(fmtDateInput(d))
    if (withTime) setView({ y: d.getFullYear(), m: d.getMonth() })
    else emit(d) // date-only: choosing a day commits immediately
  }
  function goToday() {
    // For datetime, "today/now" means the clinic's (Chicago) current wall time.
    const p = zonedParts(new Date(), CLINIC_TZ)
    const t = withTime ? new Date(p.year, p.month, p.day, p.hour, p.minute) : new Date()
    if (withTime) setTime(`${pad(t.getHours())}:${pad(t.getMinutes())}`)
    setSelected(t); setTyped(fmtDateInput(t)); setView({ y: t.getFullYear(), m: t.getMonth() })
    if (!withTime) emit(t)
  }
  const step = (delta: number) => setView((v) => { const d = new Date(v.y, v.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() } })

  return (
    <>
      <div
        ref={triggerRef}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500"
      >
        <input
          ref={inputRef}
          value={typed}
          onChange={(e) => onType(e.target.value)}
          onFocus={() => { if (!open) { place(); setOpen(true) } }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitTyped() } }}
          placeholder="mm/dd/yyyy"
          inputMode="numeric"
          className="flex-1 min-w-0 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
        />
        {withTime && (
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="shrink-0 w-[7.5rem] bg-transparent text-sm text-slate-800 focus:outline-none border-l border-slate-200 pl-2"
          />
        )}
        <button type="button" tabIndex={-1} onClick={() => { if (!open) { place(); setOpen(true) } else setOpen(false) }}
          className="shrink-0 p-0.5 text-slate-400 hover:text-slate-600" title="Open calendar">
          <Calendar className="h-3.5 w-3.5" />
        </button>
      </div>

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
            <button type="button" onClick={() => { onCommit(""); setSelected(null); setTyped(""); setOpen(false) }} className="text-xs font-medium text-slate-500 hover:text-slate-700">Clear</button>
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
