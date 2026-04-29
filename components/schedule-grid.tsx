"use client"

import { useState, useTransition, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { StaffRole, SchedDay } from "@prisma/client"
import { cn } from "@/lib/utils"
import {
  assignStaff, removeEntry, autoGenerate, clearSchedule,
} from "@/app/actions/scheduler"
import { ChevronLeft, ChevronRight, Zap, Trash2, X, Plus, AlertCircle, CheckCircle2, ImageDown } from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

interface Location {
  id: string
  code: string
  order: number
  requirements: { role: StaffRole; count: number }[]
}

interface Staff {
  id: string; name: string; primaryRole: StaffRole; roles: StaffRole[]; isLastResort: boolean
  availability: { day: SchedDay; type: string }[]
}

interface Entry {
  id: string; locationId: string; staffId: string; assignedRole: StaffRole; day: SchedDay
  staff: { id: string; name: string; primaryRole: StaffRole; isLastResort: boolean }
}

interface Schedule { id: string; weekOf: string; notes: string | null; entries: Entry[] }

interface Props {
  schedule: Schedule
  locations: Location[]
  staff: Staff[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS: SchedDay[] = ["MON", "TUE", "WED", "THU", "FRI"]

const DAY_LABELS: Record<SchedDay, string> = {
  MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri",
}

const ROLE_LABELS: Record<StaffRole, string> = {
  XR_TECH: "XR", MA: "MA", FD: "FD",
}

const ROLE_COLORS: Record<StaffRole, string> = {
  XR_TECH: "bg-blue-50 text-blue-700 border-blue-200",
  MA:      "bg-green-50 text-green-700 border-green-200",
  FD:      "bg-orange-50 text-orange-700 border-orange-200",
}

const ROLE_CHIP: Record<StaffRole, string> = {
  XR_TECH: "bg-blue-100 text-blue-800",
  MA:      "bg-green-100 text-green-800",
  FD:      "bg-orange-100 text-orange-800",
}

const ROLE_ORDER: StaffRole[] = ["XR_TECH", "MA", "FD"]

function getRoles(loc: Location): StaffRole[] {
  const active = new Set(loc.requirements.filter(r => r.count > 0).map(r => r.role))
  return ROLE_ORDER.filter(r => active.has(r))
}

// Staff eligible for a given role slot
function eligibleStaff(role: StaffRole, staff: Staff[]): Staff[] {
  return staff.filter(s => (s.roles?.length ? s.roles : [s.primaryRole]).includes(role))
}

function isAvailable(staff: Staff, day: SchedDay): boolean {
  const a = staff.availability.find(av => av.day === day)
  return !a || a.type !== "UNAVAILABLE"
}

// ── Week helpers ──────────────────────────────────────────────────────────────

function getMondayOf(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function toISO(date: Date): string {
  return date.toISOString().split("T")[0]
}

function addWeeks(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n * 7)
  return d
}

function formatWeek(weekOf: string): string {
  const d = new Date(weekOf + "T00:00:00")
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function getDayDate(weekOf: string, day: SchedDay): string {
  const base = new Date(weekOf + "T00:00:00")
  const offset = DAYS.indexOf(day)
  const d = new Date(base)
  d.setDate(d.getDate() + offset)
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" })
}

// ── Cell popover ──────────────────────────────────────────────────────────────

function CellPopover({
  location, role, day, entries, staff, scheduleId, onClose,
}: {
  location: Location; role: StaffRole; day: SchedDay
  entries: Entry[]; staff: Staff[]; scheduleId: string; onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [onClose])

  const assigned = entries.filter(e => e.locationId === location.id && e.assignedRole === role && e.day === day)
  const assignedIds = new Set(assigned.map(e => e.staffId))

  const eligible = eligibleStaff(role, staff)
    .filter(s => isAvailable(s, day))
    .sort((a, b) => {
      if (a.isLastResort !== b.isLastResort) return a.isLastResort ? 1 : -1
      return a.name.localeCompare(b.name)
    })

  return (
    <div
      ref={ref}
      className="absolute z-50 top-full left-0 mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
    >
      <div className={cn("px-3 py-2 text-xs font-semibold border-b", ROLE_COLORS[role])}>
        {location.code} · {ROLE_LABELS[role]} · {DAY_LABELS[day]}
      </div>
      <div className="max-h-52 overflow-y-auto">
        {eligible.length === 0 ? (
          <p className="text-xs text-slate-400 px-3 py-3 italic">No eligible staff available.</p>
        ) : eligible.map((s) => {
          const isOn = assignedIds.has(s.id)
          const entry = assigned.find(e => e.staffId === s.id)
          return (
            <button
              key={s.id}
              disabled={isPending}
              onClick={() => {
                startTransition(async () => {
                  if (isOn && entry) {
                    await removeEntry(entry.id)
                  } else {
                    await assignStaff(scheduleId, location.id, s.id, role, day)
                  }
                })
              }}
              className={cn(
                "w-full text-left flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 transition-colors",
                isOn && "bg-blue-50"
              )}
            >
              <span className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0",
                isOn ? "bg-blue-600 border-blue-600" : "border-slate-300"
              )}>
                {isOn && <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 text-white fill-current"><path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>}
              </span>
              <span className="flex-1 truncate">{s.name}</span>
              {s.isLastResort && <span className="text-slate-400 shrink-0">⚑</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ScheduleGrid({ schedule: initialSchedule, locations, staff }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [activeCell, setActiveCell] = useState<{ locationId: string; role: StaffRole; day: SchedDay } | null>(null)
  const [flash, setFlash] = useState<{ msg: string; ok: boolean } | null>(null)
  const [entries, setEntries] = useState<Entry[]>(initialSchedule.entries)
  const [exporting, setExporting] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const weekOf = toISO(getMondayOf(new Date(initialSchedule.weekOf + "T00:00:00")))

  // Poll for real-time updates every 30 seconds
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 30_000)
    return () => clearInterval(t)
  }, [router])

  // Sync entries when server refreshes
  useEffect(() => {
    setEntries(initialSchedule.entries)
  }, [initialSchedule.entries])

  function showFlash(msg: string, ok = true) {
    setFlash({ msg, ok })
    setTimeout(() => setFlash(null), 3000)
  }

  function navigate(delta: number) {
    const next = toISO(addWeeks(new Date(weekOf + "T00:00:00"), delta))
    router.push(`/scheduler?week=${next}`)
  }

  function handleAutoGenerate() {
    startTransition(async () => {
      const res = await autoGenerate(initialSchedule.id)
      if (res.success) { showFlash("Schedule generated!"); router.refresh() }
      else showFlash(res.error ?? "Failed.", false)
    })
  }

  function handleClear() {
    if (!confirm("Clear all assignments for this week?")) return
    startTransition(async () => {
      await clearSchedule(initialSchedule.id)
      showFlash("Schedule cleared.")
      router.refresh()
    })
  }

  async function handleExport() {
    if (!gridRef.current || exporting) return
    setExporting(true)
    try {
      const el = gridRef.current

      // Hide interactive UI (+ add buttons, × remove buttons) during capture
      const hideEls = el.querySelectorAll<HTMLElement>("[data-export-hide]")
      hideEls.forEach(n => { n.style.display = "none" })

      const html2canvas = (await import("html2canvas")).default
      const gridCanvas = await html2canvas(el, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
      })

      hideEls.forEach(n => { n.style.display = "" })

      // Compose: title banner + grid
      const S = 2
      const padX = 32 * S
      const padY = 20 * S
      const headerH = 56 * S

      const out = document.createElement("canvas")
      out.width = gridCanvas.width + padX * 2
      out.height = gridCanvas.height + padY * 2 + headerH
      const ctx = out.getContext("2d")!

      // Slate-100 background
      ctx.fillStyle = "#f1f5f9"
      ctx.fillRect(0, 0, out.width, out.height)

      // White card for grid
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(padX, padY + headerH, gridCanvas.width, gridCanvas.height)
      ctx.drawImage(gridCanvas, padX, padY + headerH)

      // Title
      ctx.fillStyle = "#0f172a"
      ctx.font = `bold ${18 * S}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
      ctx.fillText("Genesis Ortho", padX, padY + 22 * S)

      // Subtitle
      ctx.fillStyle = "#475569"
      ctx.font = `${11 * S}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
      ctx.fillText(`Staff Schedule — Week of ${formatWeek(weekOf)}`, padX, padY + 42 * S)

      const link = document.createElement("a")
      link.download = `schedule-${weekOf}.png`
      link.href = out.toDataURL("image/png")
      link.click()
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-slate-800 min-w-36 text-center">
            Week of {formatWeek(weekOf)}
          </span>
          <button onClick={() => navigate(1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => router.push(`/scheduler?week=${toISO(getMondayOf(new Date()))}`)}
            className="text-xs text-blue-600 hover:underline ml-1"
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-2">
          {flash && (
            <div className={cn(
              "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border",
              flash.ok ? "text-green-700 bg-green-50 border-green-200" : "text-red-700 bg-red-50 border-red-200"
            )}>
              {flash.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
              {flash.msg}
            </div>
          )}
          <button
            onClick={handleAutoGenerate}
            disabled={isPending}
            className="flex items-center gap-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg disabled:opacity-50"
          >
            <Zap className="h-3.5 w-3.5" />
            Auto-generate
          </button>
          <button
            onClick={handleClear}
            disabled={isPending}
            className="flex items-center gap-1.5 text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 px-3 py-2 rounded-lg disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 px-3 py-2 rounded-lg disabled:opacity-50"
          >
            <ImageDown className="h-3.5 w-3.5" />
            {exporting ? "Exporting…" : "Export"}
          </button>
        </div>
      </div>

      {/* Grid */}
      <div ref={gridRef} className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-3 py-2.5 font-semibold text-slate-600 w-14 border-r border-slate-200">Loc</th>
              <th className="text-center px-2 py-2.5 font-semibold text-slate-500 w-10 border-r border-slate-200">Role</th>
              {DAYS.map(d => (
                <th key={d} className="text-center px-2 py-2.5 font-semibold text-slate-600 border-r border-slate-100 last:border-r-0">
                  <div>{DAY_LABELS[d]}</div>
                  <div className="text-slate-400 font-normal">{getDayDate(weekOf, d)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {locations.map((loc) => {
              const roles = getRoles(loc)
              return roles.map((role, ri) => (
                <tr
                  key={`${loc.id}-${role}`}
                  className={cn(
                    "border-b border-slate-100",
                    ri === roles.length - 1 && "border-b-2 border-slate-200",
                    ri === 0 && "border-t border-slate-200"
                  )}
                >
                  {/* Location label — only on first role row */}
                  {ri === 0 && (
                    <td
                      rowSpan={roles.length}
                      className="px-3 py-2 font-bold text-slate-800 text-sm border-r border-slate-200 align-middle bg-slate-50/60 w-14"
                    >
                      {loc.code}
                    </td>
                  )}

                  {/* Role label */}
                  <td className="px-2 py-1.5 border-r border-slate-200 align-middle">
                    <span className={cn("inline-flex px-1.5 py-0.5 rounded text-xs font-semibold border", ROLE_COLORS[role])}>
                      {ROLE_LABELS[role]}
                    </span>
                  </td>

                  {/* Day cells */}
                  {DAYS.map(day => {
                    const cellEntries = entries.filter(
                      e => e.locationId === loc.id && e.assignedRole === role && e.day === day
                    )
                    const isOpen = activeCell?.locationId === loc.id && activeCell.role === role && activeCell.day === day

                    return (
                      <td key={day} className="px-2 py-1.5 border-r border-slate-100 last:border-r-0 align-middle min-w-28">
                        <div className="flex flex-wrap gap-1 items-start relative">
                          {cellEntries.map(entry => (
                            <span
                              key={entry.id}
                              className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-medium leading-none", ROLE_CHIP[role])}
                            >
                              {entry.staff.isLastResort && <span className="text-slate-400">⚑</span>}
                              <span>{entry.staff.name.split(" ")[0]}</span>
                              <button
                                data-export-hide=""
                                onClick={() => startTransition(async () => { await removeEntry(entry.id); router.refresh() })}
                                className="hover:text-red-600 ml-0.5 opacity-60 hover:opacity-100"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </span>
                          ))}

                          {/* Add button */}
                          <div data-export-hide="" className="relative">
                            <button
                              onClick={() => setActiveCell(isOpen ? null : { locationId: loc.id, role, day })}
                              className="inline-flex items-center justify-center h-5 w-5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            >
                              <Plus className="h-3 w-3" />
                            </button>

                            {isOpen && (
                              <CellPopover
                                location={loc}
                                role={role}
                                day={day}
                                entries={entries}
                                staff={staff}
                                scheduleId={initialSchedule.id}
                                onClose={() => setActiveCell(null)}
                              />
                            )}
                          </div>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400 text-center">
        ⚑ = last resort · updates save instantly · refreshes every 30 s for shared editing
      </p>
    </div>
  )
}
