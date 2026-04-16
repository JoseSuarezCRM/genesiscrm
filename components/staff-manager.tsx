"use client"

import { useState, useTransition } from "react"
import { StaffRole, SchedDay } from "@prisma/client"
import { cn } from "@/lib/utils"
import {
  createStaffMember, updateStaffMember, deleteStaffMember, setAvailability,
} from "@/app/actions/scheduler"
import { Plus, Pencil, Trash2, X, Check } from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

interface StaffAvailability {
  day: SchedDay
  type: string
}

interface StaffMember {
  id: string
  name: string
  primaryRole: StaffRole
  isLastResort: boolean
  isActive: boolean
  availability: StaffAvailability[]
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

// ── Main Component ─────────────────────────────────────────────────────────────

export default function StaffManager({ staff }: { staff: StaffMember[] }) {
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
      {/* Header */}
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
        <StaffForm
          onSave={() => setAdding(false)}
          onCancel={() => setAdding(false)}
        />
      )}

      {/* Table */}
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
    </div>
  )
}
