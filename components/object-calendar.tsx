"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Loader2, CalendarDays } from "lucide-react"
import { getObjectCalendarData, type CalendarEvent } from "@/app/actions/object-calendar"
import StyledSelect from "@/components/ui/styled-select"
import { hexToChipStyle } from "@/lib/option-colors"
import type { CalendarConfig } from "@/lib/object-views"
import type { ObjectProperty } from "@/lib/object-columns"
import { cn } from "@/lib/utils"

// Month / week / day grid for a custom object.
//
// Every date here is a plain "yyyy-mm-dd" STRING. The grid is built by whole-day
// arithmetic on those strings, and an event's day is compared as text — no calendar
// value is ever rebuilt as a Date, which is what shifts events a day off.

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const MAX_PER_DAY = 3

function ymd(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}
function todayYmd(): string {
  const n = new Date()
  return ymd(n.getFullYear(), n.getMonth() + 1, n.getDate())
}
/** Day number for "yyyy-mm-dd" — arithmetic only, never rendered. */
function toDayNum(s: string): number {
  return Math.floor(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) / 864e5)
}
function fromDayNum(n: number): string {
  const d = new Date(n * 864e5)
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}
function addDays(s: string, n: number): string {
  return fromDayNum(toDayNum(s) + n)
}
function dowOf(s: string): number {
  return new Date(toDayNum(s) * 864e5).getUTCDay()
}
function addMonths(s: string, n: number): string {
  let y = Number(s.slice(0, 4)), m = Number(s.slice(5, 7)) + n
  y += Math.floor((m - 1) / 12)
  m = ((m - 1) % 12 + 12) % 12 + 1
  // Clamp to the target month's length so "Jan 31 + 1 month" is Feb 28, not Mar 3.
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return ymd(y, m, Math.min(Number(s.slice(8, 10)), last))
}

/** The inclusive [from, to] the current range covers, plus its heading. */
function rangeOf(anchor: string, range: CalendarConfig["range"]): { from: string; to: string; title: string; days: string[] } {
  if (range === "day") {
    return { from: anchor, to: anchor, title: prettyDay(anchor), days: [anchor] }
  }
  if (range === "week") {
    const start = addDays(anchor, -dowOf(anchor))
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
    return { from: days[0], to: days[6], title: `${prettyDay(days[0])} – ${prettyDay(days[6])}`, days }
  }
  const y = Number(anchor.slice(0, 4)), m = Number(anchor.slice(5, 7))
  const first = ymd(y, m, 1)
  const start = addDays(first, -dowOf(first))
  // 6 rows always, so the grid height doesn't jump between months.
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  return { from: days[0], to: days[41], title: `${MONTHS[m - 1]} ${y}`, days }
}

function prettyDay(s: string): string {
  return `${MONTHS[Number(s.slice(5, 7)) - 1].slice(0, 3)} ${Number(s.slice(8, 10))}, ${s.slice(0, 4)}`
}

export default function ObjectCalendar({ objectKey, hrefBase, config, properties, pipelineId, onConfigChange }: {
  objectKey: string
  hrefBase: string
  config: CalendarConfig
  properties: ObjectProperty[]
  pipelineId: string | null
  onConfigChange: (next: CalendarConfig) => void
}) {
  const [anchor, setAnchor] = useState<string>(todayYmd())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedDay, setExpandedDay] = useState<string | null>(null)

  const { from, to, title, days } = useMemo(() => rangeOf(anchor, config.range), [anchor, config.range])
  const colorProp = config.colorBy !== "stage" ? properties.find((p) => p.id === config.colorBy) : undefined

  useEffect(() => {
    if (!config.datePropertyId) { setEvents([]); setError("Pick a date property in Calendar settings."); return }
    let cancelled = false
    setLoading(true); setError(null)
    getObjectCalendarData(objectKey, {
      datePropertyId: config.datePropertyId,
      titlePropertyId: config.titlePropertyId,
      colorByPropertyId: config.colorBy !== "stage" ? config.colorBy : null,
      pipelineId,
      from, to,
    })
      .then((res) => {
        if (cancelled) return
        setEvents(res.events)
        setError(res.error ?? (res.truncated ? "Too many records in this range to show them all." : null))
      })
      .catch(() => { if (!cancelled) setError("Couldn't load the calendar.") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [objectKey, config.datePropertyId, config.titlePropertyId, config.colorBy, pipelineId, from, to])

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>()
    for (const e of events) { const a = m.get(e.day) ?? []; a.push(e); m.set(e.day, a) }
    return m
  }, [events])

  const today = todayYmd()
  const anchorMonth = anchor.slice(0, 7)

  function step(dir: -1 | 1) {
    setAnchor((a) => config.range === "month" ? addMonths(a, dir) : addDays(a, dir * (config.range === "week" ? 7 : 1)))
  }

  function eventStyle(e: CalendarEvent) {
    if (config.colorBy === "stage") {
      return e.stageColor ? hexToChipStyle(e.stageColor) : undefined
    }
    const colors = (colorProp as any)?.optionColors as Record<string, string> | undefined
    const hex = e.colorValue ? colors?.[String(e.colorValue)] : undefined
    return hex ? hexToChipStyle(hex) : undefined
  }

  const EventBar = ({ e }: { e: CalendarEvent }) => (
    <Link href={`${hrefBase}/${e.id}`} title={`${e.time ? `${e.time} · ` : ""}${e.title}${e.stageName ? ` · ${e.stageName}` : ""}`}
      style={eventStyle(e)}
      className="block truncate rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[11px] text-zinc-700 hover:border-zinc-400">
      {e.time && <span className="font-semibold">{e.time} </span>}{e.title}
    </Link>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-lg font-semibold text-zinc-900">{title}</h2>
        <StyledSelect value={config.range} onChange={(e) => onConfigChange({ ...config, range: e.target.value as CalendarConfig["range"] })}
          className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-sm">
          <option value="month">Month</option>
          <option value="week">Week</option>
          <option value="day">Day</option>
        </StyledSelect>
        <div className="flex items-center gap-1">
          <button onClick={() => step(-1)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white hover:border-zinc-400"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => setAnchor(todayYmd())} className="h-8 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 hover:border-zinc-400">Today</button>
          <button onClick={() => step(1)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white hover:border-zinc-400"><ChevronRight className="h-4 w-4" /></button>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
        {!loading && <span className="text-xs text-zinc-400">{events.length} in view</span>}
      </div>

      {error && (
        <p className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <CalendarDays className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {config.range !== "day" && (
          <div className="grid border-b border-zinc-200 bg-zinc-50" style={{ gridTemplateColumns: `repeat(${days.length === 42 ? 7 : days.length}, minmax(0, 1fr))` }}>
            {(days.length === 42 ? DOW : days.map((d) => DOW[dowOf(d)])).map((d, i) => (
              <div key={i} className="px-2 py-1.5 text-center text-xs font-semibold text-zinc-500">{d}</div>
            ))}
          </div>
        )}

        <div className={cn("grid", config.range === "day" && "grid-cols-1")}
          style={config.range === "day" ? undefined : { gridTemplateColumns: `repeat(${days.length === 42 ? 7 : days.length}, minmax(0, 1fr))` }}>
          {days.map((d) => {
            const list = byDay.get(d) ?? []
            const outside = config.range === "month" && d.slice(0, 7) !== anchorMonth
            const isToday = d === today
            const show = expandedDay === d ? list : list.slice(0, MAX_PER_DAY)
            return (
              <div key={d} className={cn("min-h-[110px] border-b border-r border-zinc-100 p-1.5 last:border-r-0", outside && "bg-zinc-50/60")}>
                <div className="mb-1 flex items-center justify-between">
                  <span className={cn(
                    "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-xs",
                    isToday ? "bg-blue-600 font-semibold text-white" : outside ? "text-zinc-300" : "text-zinc-500",
                  )}>
                    {Number(d.slice(8, 10))}
                  </span>
                </div>
                <div className="space-y-1">
                  {show.map((e) => <EventBar key={e.id} e={e} />)}
                  {list.length > MAX_PER_DAY && (
                    <button onClick={() => setExpandedDay(expandedDay === d ? null : d)}
                      className="text-[11px] font-medium text-blue-600 hover:underline">
                      {expandedDay === d ? "Show less" : `+${list.length - MAX_PER_DAY} more`}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
