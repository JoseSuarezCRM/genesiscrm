"use client"

import { useState, useTransition } from "react"
import { cn } from "@/lib/utils"

type StaffRole = "XR_TECH" | "MA" | "FD"
type SchedDay  = "MON" | "TUE" | "WED" | "THU" | "FRI"
import {
  createStaffMember, updateStaffMember, deleteStaffMember, setAvailability, setStaffLocations,
  createLocation, updateLocation, deleteLocation,
} from "@/app/actions/scheduler"
import { Plus, Pencil, Trash2, X, Check, MapPin, Zap, UserCheck } from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

interface StaffAvailability {
  day: SchedDay
  type: string
}

interface StaffLocationAssignment {
  locationId: string
}

interface StaffMember {
  id: string
  name: string
  primaryRole: StaffRole
  isLastResort: boolean
  isActive: boolean
  availability: StaffAvailability[]
  locationAssignments: StaffLocationAssignment[]
}

interface RoleRequirement {
  role: StaffRole
  count: number
}

interface Location {
  id: string
  code: string
  name: string
  openDays: string[]
  order: number
  requirements: RoleRequirement[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS: SchedDay[] = ["MON", "TUE", "WED", "THU", "FRI"]
const DAY_LABELS: Record<SchedDay, string> = { MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri" }

const ROLE_OPTIONS: { value: StaffRole; label: string }[] = [
  { value: "XR_TECH", label: "XR Tech" },
  { value: "MA", label: "MA" },
  { value: "FD", label: "FD" },
]

const ROLE_COLORS: Record<StaffRole, string> = {
  XR_TECH: "bg-blue-100 text-blue-800",
  MA:      "bg-green-100 text-green-800",
  FD:      "bg-orange-100 text-orange-800",
}

const AVAIL_CYCLE: Record<string, string> = {
  AVAILABLE:   "LAST_RESORT",
  LAST_RESORT: "UNAVAILABLE",
  UNAVAILABLE: "AVAILABLE",
}

const AVAIL_DISPLAY: Record<string, { label: string; classes: string }> = {
  AVAILABLE:   { label: "✓", classes: "bg-green-100 text-green-700 border-green-300 hover:bg-green-200" },
  LAST_RESORT: { label: "⚑", classes: "bg-yellow-100 text-yellow-700 border-yellow-300 hover:bg-yellow-200" },
  UNAVAILABLE: { label: "✕", classes: "bg-red-100 text-red-600 border-red-300 hover:bg-red-200" },
}

// ── Staff Form ─────────────────────────────────────────────────────────────────

function StaffForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: StaffMember
  onSave: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [role, setRole] = useState<StaffRole>(initial?.primaryRole ?? "MA")
  const [lastResort, setLastResort] = useState(initial?.isLastResort ?? false)
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError("Name is required."); return }
    setError("")
    startTransition(async () => {
      if (initial) {
        const res = await updateStaffMember(initial.id, { name: name.trim(), primaryRole: role, isLastResort: lastResort, isActive })
        if (!res.success) { setError(res.error ?? "Failed."); return }
      } else {
        const res = await createStaffMember({ name: name.trim(), primaryRole: role, isLastResort: lastResort })
        if (!res.success) { setError(res.error ?? "Failed."); return }
      }
      onSave()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">{initial ? "Edit Staff Member" : "Add Staff Member"}</h3>
        <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Full name"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Primary Role</label>
          <select
            value={role}
            onChange={e => setRole(e.target.value as StaffRole)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {ROLE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={lastResort}
            onChange={e => setLastResort(e.target.checked)}
            className="rounded"
          />
          Last resort (only fill gaps)
        </label>
        {initial && (
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
              className="rounded"
            />
            Active
          </label>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
        >
          <Check className="h-3.5 w-3.5" />
          {initial ? "Save" : "Add"}
        </button>
      </div>
    </form>
  )
}

// ── Availability Row ───────────────────────────────────────────────────────────

function AvailabilityRow({ member }: { member: StaffMember }) {
  const [pending, startTransition] = useTransition()

  function getType(day: SchedDay): string {
    return member.availability.find(a => a.day === day)?.type ?? "AVAILABLE"
  }

  function cycle(day: SchedDay) {
    const current = getType(day)
    const next = AVAIL_CYCLE[current] ?? "AVAILABLE"
    startTransition(async () => {
      await setAvailability(member.id, day, next as any)
    })
  }

  return (
    <div className="flex items-center gap-1">
      {DAYS.map(day => {
        const type = getType(day)
        const d = AVAIL_DISPLAY[type] ?? AVAIL_DISPLAY.AVAILABLE
        return (
          <button
            key={day}
            onClick={() => cycle(day)}
            disabled={pending}
            title={`${DAY_LABELS[day]}: ${type}`}
            className={cn(
              "w-8 h-7 rounded border text-xs font-semibold transition-colors disabled:opacity-50",
              d.classes
            )}
          >
            {d.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Location card (collapsed + expanded) ──────────────────────────────────────

const ALL_DAYS: SchedDay[] = ["MON", "TUE", "WED", "THU", "FRI"]
const DAY_SHORT: Record<SchedDay, string> = { MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri" }
const ROLE_COLORS_LOC: Record<StaffRole, { bg: string; text: string; dot: string }> = {
  XR_TECH: { bg: "bg-blue-600",   text: "text-white", dot: "bg-blue-300"   },
  MA:      { bg: "bg-green-600",  text: "text-white", dot: "bg-green-300"  },
  FD:      { bg: "bg-orange-500", text: "text-white", dot: "bg-orange-300" },
}
const ROLE_LABEL: Record<StaffRole, string> = { XR_TECH: "XR Tech", MA: "MA", FD: "FD" }
const ROLE_ORDER_LOC: StaffRole[] = ["XR_TECH", "MA", "FD"]

function LocationCard({
  loc, staff, assignmentMap, onDelete,
}: {
  loc: Location
  staff: StaffMember[]
  assignmentMap: Map<string, Set<string>>
  onDelete: (id: string) => void
}) {
  const [open, setOpen] = useState(false)

  // ── local editable state (mirrors DB, saved on change) ──
  const [code, setCode] = useState(loc.code)
  const [name, setName] = useState(loc.name)
  const [openDays, setOpenDays] = useState<string[]>(
    loc.openDays.length > 0 ? loc.openDays : ALL_DAYS
  )
  const [reqs, setReqs] = useState<{ role: StaffRole; count: number }[]>(() => {
    const existing = new Map(loc.requirements.map(r => [r.role as StaffRole, r.count]))
    return ROLE_ORDER_LOC.map(role => ({ role, count: existing.get(role) ?? 0 }))
  })

  const [staffPending, startStaffTransition] = useTransition()
  const [savePending, startSaveTransition] = useTransition()
  const [error, setError] = useState("")

  const assigned = assignmentMap.get(loc.id) ?? new Set()

  function toggleDay(day: string) {
    setOpenDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])
  }

  function setCount(role: StaffRole, delta: number) {
    setReqs(prev => prev.map(r => r.role === role ? { ...r, count: Math.max(0, r.count + delta) } : r))
  }

  function toggleRole(role: StaffRole) {
    setReqs(prev => prev.map(r => r.role === role ? { ...r, count: r.count > 0 ? 0 : 1 } : r))
  }

  function save() {
    setError("")
    startSaveTransition(async () => {
      const days = openDays.length === ALL_DAYS.length ? [] : openDays
      const res = await updateLocation(loc.id, {
        code: code.trim().toUpperCase(),
        name: name.trim() || code.trim().toUpperCase(),
        openDays: days,
        requirements: reqs.filter(r => r.count > 0),
      })
      if (!res.success) setError(res.error ?? "Failed.")
    })
  }

  function toggleStaff(staffId: string) {
    const next = new Set(assigned)
    next.has(staffId) ? next.delete(staffId) : next.add(staffId)
    startStaffTransition(async () => {
      await setStaffLocations(staffId,
        Array.from(assignmentMap.entries())
          .filter(([locId, members]) => (locId === loc.id ? next : members).has(staffId))
          .map(([locId]) => locId)
      )
    })
  }

  const displayDays = loc.openDays.length === 0 ? "All days" : loc.openDays.map(d => DAY_SHORT[d as SchedDay]).join(", ")
  const displayReqs = loc.requirements.filter(r => r.count > 0)

  return (
    <div className={cn("bg-white border rounded-xl overflow-hidden transition-shadow", open ? "border-blue-300 shadow-md col-span-full" : "border-slate-200 hover:border-slate-300 cursor-pointer")}>

      {/* ── Collapsed header (always visible) ── */}
      <div
        className="px-4 py-3 flex items-center gap-3"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800 text-sm">{loc.code}</span>
            {loc.name !== loc.code && <span className="text-xs text-slate-400">{loc.name}</span>}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs text-slate-400">{displayDays}</span>
            {displayReqs.map(r => (
              <span key={r.role} className={cn("inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded font-medium",
                r.role === "XR_TECH" ? "bg-blue-50 text-blue-700" :
                r.role === "MA"      ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-700"
              )}>
                {r.count}× {ROLE_LABEL[r.role as StaffRole]}
              </span>
            ))}
            <span className="text-xs text-slate-400">· {assigned.size} staff</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={() => onDelete(loc.id)} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Expanded editor ── */}
      {open && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-5">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{error}</p>}

          {/* Name / code */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Code</label>
              <input value={code} onChange={e => setCode(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Display name</label>
              <input value={name} onChange={e => setName(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Days open */}
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">Days open</p>
            <div className="flex gap-1.5">
              {ALL_DAYS.map(day => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                    openDays.includes(day)
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-400 border-slate-200 hover:border-slate-400"
                  )}
                >
                  {DAY_SHORT[day]}
                </button>
              ))}
            </div>
          </div>

          {/* Role requirements */}
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">Staff needed per day</p>
            <div className="flex gap-3 flex-wrap">
              {reqs.map(({ role, count }) => {
                const active = count > 0
                const colors = ROLE_COLORS_LOC[role]
                return (
                  <div key={role} className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors",
                    active ? "border-transparent " + colors.bg : "border-slate-200 bg-white"
                  )}>
                    <button
                      type="button"
                      onClick={() => toggleRole(role)}
                      className={cn("text-xs font-semibold", active ? colors.text : "text-slate-500")}
                    >
                      {ROLE_LABEL[role]}
                    </button>
                    {active && (
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => setCount(role, -1)}
                          className="w-5 h-5 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center font-bold text-sm leading-none">−</button>
                        <span className={cn("text-sm font-bold w-4 text-center", colors.text)}>{count}</span>
                        <button type="button" onClick={() => setCount(role, +1)}
                          className="w-5 h-5 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center font-bold text-sm leading-none">+</button>
                      </div>
                    )}
                    {!active && (
                      <button type="button" onClick={() => toggleRole(role)}
                        className="text-xs text-slate-400 hover:text-slate-600">+ Add</button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Staff assignment */}
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">Assigned staff <span className="text-slate-400 font-normal">(click to toggle · dashed = float)</span></p>
            <div className="flex flex-wrap gap-1.5">
              {staff.length === 0 && <span className="text-xs text-slate-400 italic">No staff yet</span>}
              {staff
                .slice()
                .sort((a, b) => ROLE_ORDER_LOC.indexOf(a.primaryRole) - ROLE_ORDER_LOC.indexOf(b.primaryRole) || a.name.localeCompare(b.name))
                .map(member => {
                  const isAssigned = assigned.has(member.id)
                  const isFloat = member.locationAssignments.length === 0
                  return (
                    <button
                      key={member.id}
                      onClick={() => !isFloat && toggleStaff(member.id)}
                      disabled={staffPending || isFloat}
                      title={isFloat ? `${member.name} is a float` : undefined}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors",
                        isFloat
                          ? "border-dashed border-slate-200 text-slate-400 bg-slate-50 cursor-default"
                          : isAssigned
                            ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                            : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600"
                      )}
                    >
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0",
                        member.primaryRole === "XR_TECH" ? "bg-blue-400" :
                        member.primaryRole === "MA" ? "bg-green-400" : "bg-orange-400"
                      )} />
                      {member.name}
                    </button>
                  )
                })}
            </div>
          </div>

          {/* Save */}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setOpen(false)}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
              Close
            </button>
            <button type="button" onClick={save} disabled={savePending}
              className="text-xs px-4 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
              <Check className="h-3.5 w-3.5" />Save changes
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Add location form ──────────────────────────────────────────────────────────

function AddLocationForm({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [openDays, setOpenDays] = useState<string[]>(ALL_DAYS)
  const [reqs, setReqs] = useState<{ role: StaffRole; count: number }[]>([
    { role: "XR_TECH", count: 1 }, { role: "MA", count: 1 }, { role: "FD", count: 1 },
  ])
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  function toggleDay(day: string) {
    setOpenDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])
  }
  function setCount(role: StaffRole, delta: number) {
    setReqs(prev => prev.map(r => r.role === role ? { ...r, count: Math.max(0, r.count + delta) } : r))
  }
  function toggleRole(role: StaffRole) {
    setReqs(prev => prev.map(r => r.role === role ? { ...r, count: r.count > 0 ? 0 : 1 } : r))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) { setError("Code is required."); return }
    setError("")
    startTransition(async () => {
      const days = openDays.length === ALL_DAYS.length ? [] : openDays
      const res = await createLocation({
        code: code.trim().toUpperCase(),
        name: name.trim() || code.trim().toUpperCase(),
        openDays: days,
        requirements: reqs.filter(r => r.count > 0),
      })
      if (!res.success) { setError(res.error ?? "Failed."); return }
      onSave()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4 col-span-full">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Add Location</h3>
        <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
      </div>
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Code</label>
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. STC"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Display name <span className="text-slate-400">(optional)</span></label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Defaults to code"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-slate-600 mb-2">Days open</p>
        <div className="flex gap-1.5">
          {ALL_DAYS.map(day => (
            <button key={day} type="button" onClick={() => toggleDay(day)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                openDays.includes(day) ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-400 border-slate-200 hover:border-slate-400"
              )}>
              {DAY_SHORT[day]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-slate-600 mb-2">Staff needed per day</p>
        <div className="flex gap-3 flex-wrap">
          {reqs.map(({ role, count }) => {
            const active = count > 0
            const colors = ROLE_COLORS_LOC[role]
            return (
              <div key={role} className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors",
                active ? "border-transparent " + colors.bg : "border-slate-200 bg-white"
              )}>
                <button type="button" onClick={() => toggleRole(role)}
                  className={cn("text-xs font-semibold", active ? colors.text : "text-slate-500")}>
                  {ROLE_LABEL[role]}
                </button>
                {active && (
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setCount(role, -1)}
                      className="w-5 h-5 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center font-bold text-sm leading-none">−</button>
                    <span className={cn("text-sm font-bold w-4 text-center", colors.text)}>{count}</span>
                    <button type="button" onClick={() => setCount(role, +1)}
                      className="w-5 h-5 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center font-bold text-sm leading-none">+</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100">Cancel</button>
        <button type="submit" disabled={isPending} className="text-xs px-4 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
          <Check className="h-3.5 w-3.5" />Add
        </button>
      </div>
    </form>
  )
}

// ── Locations tab ──────────────────────────────────────────────────────────────

function LocationsTab({ locations, staff }: { locations: Location[]; staff: StaffMember[] }) {
  const [adding, setAdding] = useState(false)
  const [isPending, startTransition] = useTransition()

  const assignmentMap = new Map<string, Set<string>>()
  for (const loc of locations) assignmentMap.set(loc.id, new Set())
  for (const member of staff) {
    for (const a of member.locationAssignments) {
      assignmentMap.get(a.locationId)?.add(member.id)
    }
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this location? All schedule entries for it will also be removed.")) return
    startTransition(async () => { await deleteLocation(id) })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{locations.length} locations · click a card to edit</p>
        <button onClick={() => setAdding(v => !v)}
          className="flex items-center gap-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg">
          <Plus className="h-3.5 w-3.5" />Add Location
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {adding && (
          <AddLocationForm onSave={() => setAdding(false)} onCancel={() => setAdding(false)} />
        )}
        {locations.map(loc => (
          <LocationCard key={loc.id} loc={loc} staff={staff} assignmentMap={assignmentMap} onDelete={handleDelete} />
        ))}
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function StaffManager({ staff, locations }: { staff: StaffMember[]; locations: Location[] }) {
  const [tab, setTab] = useState<"staff" | "locations">("staff")
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [filterRole, setFilterRole] = useState<StaffRole | "ALL">("ALL")

  function handleDelete(id: string, name: string) {
    if (!confirm(`Deactivate ${name}?`)) return
    startTransition(async () => { await deleteStaffMember(id) })
  }

  const filtered = staff
    .filter(s => filterRole === "ALL" || s.primaryRole === filterRole)
    .sort((a, b) => {
      if (a.primaryRole !== b.primaryRole) {
        const order: StaffRole[] = ["XR_TECH", "MA", "FD"]
        return order.indexOf(a.primaryRole) - order.indexOf(b.primaryRole)
      }
      return a.name.localeCompare(b.name)
    })

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab("staff")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            tab === "staff" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          Staff Roster
        </button>
        <button
          onClick={() => setTab("locations")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            tab === "locations" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          <MapPin className="h-4 w-4" />
          Locations
        </button>
      </div>

      {/* ── Staff tab ── */}
      {tab === "staff" && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">{staff.length} active staff</span>
              <div className="flex items-center gap-1 ml-2">
                {(["ALL", "XR_TECH", "MA", "FD"] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setFilterRole(r)}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-lg border transition-colors",
                      filterRole === r
                        ? "bg-slate-800 text-white border-slate-800"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    {r === "ALL" ? "All" : r === "XR_TECH" ? "XR Tech" : r}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => { setAdding(true); setEditingId(null) }}
              className="flex items-center gap-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Staff
            </button>
          </div>

          {adding && (
            <StaffForm onSave={() => setAdding(false)} onCancel={() => setAdding(false)} />
          )}

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Role</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">
                    <div className="flex items-center gap-1">
                      Availability
                      <span className="text-xs font-normal text-slate-400 ml-1">
                        (click to cycle: ✓ available · ⚑ last resort · ✕ unavailable)
                      </span>
                    </div>
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center text-slate-400 text-xs py-8 italic">
                      No staff members found.
                    </td>
                  </tr>
                )}
                {filtered.map(member => (
                  editingId === member.id ? (
                    <tr key={member.id}>
                      <td colSpan={4} className="px-4 py-3">
                        <StaffForm
                          initial={member}
                          onSave={() => setEditingId(null)}
                          onCancel={() => setEditingId(null)}
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr key={member.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {member.name}
                        {member.isLastResort && (
                          <span className="ml-1.5 text-xs text-slate-400" title="Last resort">⚑</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex px-2 py-0.5 rounded text-xs font-semibold", ROLE_COLORS[member.primaryRole])}>
                          {ROLE_OPTIONS.find(r => r.value === member.primaryRole)?.label ?? member.primaryRole}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <AvailabilityRow member={member} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => { setEditingId(member.id); setAdding(false) }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(member.id, member.name)}
                            disabled={isPending}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                            title="Deactivate"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-400 text-center">
            ⚑ = last resort · ✕ = unavailable · changes save instantly
          </p>
        </>
      )}

      {/* ── Locations tab ── */}
      {tab === "locations" && (
        <LocationsTab locations={locations} staff={staff} />
      )}
    </div>
  )
}
