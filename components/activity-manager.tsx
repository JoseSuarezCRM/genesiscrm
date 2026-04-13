"use client"

import { useState, useTransition, useMemo } from "react"
import { createActivity, updateActivity, deleteActivity } from "@/app/actions/activities"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import {
  Plus,
  Loader2,
  Trash2,
  Pencil,
  Search,
  X,
  CalendarDays,
  Building2,
  MapPin,
  User,
  ChevronDown,
} from "lucide-react"
import { format } from "date-fns"

// ─── Types ───────────────────────────────────────────────────────────────────

interface Practice {
  id: string
  name: string
  locations: Location[]
  doctors: Doctor[]
}

interface Location {
  id: string
  name: string
  address: string | null
  practiceId: string
}

interface Doctor {
  id: string
  name: string
  title: string | null
  practiceId: string
  practiceName: string
}

interface ActivityRow {
  id: string
  date: string
  practice: { id: string; name: string } | null
  location: { id: string; name: string; address: string | null } | null
  providers: { doctor: { id: string; name: string; title: string | null } }[]
  nextStep: string | null
  frontDesk: string | null
  flyer: string | null
  notes: string | null
  createdBy: { name: string | null; email: string }
}

interface Props {
  activities: ActivityRow[]
  practices: Practice[]
  allDoctors: Doctor[]
  currentUserId: string
}

// ─── Searchable single-select picker ─────────────────────────────────────────

function Picker({
  placeholder,
  value,
  options,
  onSelect,
  onClear,
}: {
  placeholder: string
  value: string
  options: { id: string; label: string; sub?: string }[]
  onSelect: (id: string) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const filtered = options.filter(
    (o) =>
      o.label.toLowerCase().includes(q.toLowerCase()) ||
      (o.sub && o.sub.toLowerCase().includes(q.toLowerCase()))
  )
  const selected = options.find((o) => o.id === value)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-md bg-white text-sm text-left hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <span className={`flex-1 truncate ${selected ? "text-slate-800" : "text-slate-400"}`}>
          {selected ? selected.label : placeholder}
        </span>
        {selected ? (
          <X
            className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 shrink-0"
            onClick={(e) => { e.stopPropagation(); onClear(); setOpen(false) }}
          />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg">
          <div className="p-2 border-b border-slate-100">
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search..."
              className="h-8 text-sm"
            />
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-slate-400">No results</li>
            ) : (
              filtered.map((o) => (
                <li
                  key={o.id}
                  onClick={() => { onSelect(o.id); setOpen(false); setQ("") }}
                  className="px-3 py-2 cursor-pointer hover:bg-slate-50 text-sm"
                >
                  <p className="font-medium text-slate-800">{o.label}</p>
                  {o.sub && <p className="text-xs text-slate-400">{o.sub}</p>}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Multi-select provider picker ────────────────────────────────────────────

function ProviderPicker({
  options,
  selected,
  onToggle,
}: {
  options: { id: string; label: string; sub?: string }[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  const [q, setQ] = useState("")
  const filtered = options.filter(
    (o) =>
      o.label.toLowerCase().includes(q.toLowerCase()) ||
      (o.sub && o.sub.toLowerCase().includes(q.toLowerCase()))
  )

  return (
    <div className="border border-slate-200 rounded-md bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
        <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search providers..."
          className="flex-1 text-sm outline-none bg-transparent placeholder:text-slate-400"
        />
      </div>
      <ul className="max-h-40 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <li className="px-3 py-2 text-xs text-slate-400">No providers found</li>
        ) : (
          filtered.map((o) => {
            const isSelected = selected.includes(o.id)
            return (
              <li
                key={o.id}
                onClick={() => onToggle(o.id)}
                className={`px-3 py-2 cursor-pointer text-sm flex items-center gap-2 hover:bg-slate-50 ${isSelected ? "bg-blue-50" : ""}`}
              >
                <div className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${isSelected ? "bg-blue-600 border-blue-600" : "border-slate-300"}`}>
                  {isSelected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8"><path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-slate-800 truncate">{o.label}</p>
                  {o.sub && <p className="text-xs text-slate-400 truncate">{o.sub}</p>}
                </div>
              </li>
            )
          })
        )}
      </ul>
    </div>
  )
}

// ─── Form state ───────────────────────────────────────────────────────────────

function emptyForm() {
  return {
    practiceId: "",
    locationId: "",
    providerIds: [] as string[],
    nextStep: "",
    date: format(new Date(), "yyyy-MM-dd"),
    frontDesk: "",
    flyer: "",
    notes: "",
  }
}

const FLYER_OPTIONS = [
  "Genesis Ortho General",
  "Hip & Knee Replacement",
  "Sports Medicine",
  "Spine Care",
  "Foot & Ankle",
  "Hand & Wrist",
  "Physical Therapy",
  "Other",
]

// ─── Main component ───────────────────────────────────────────────────────────

export default function ActivityManager({ activities, practices, allDoctors, currentUserId }: Props) {
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Filter locations by selected practice
  const locationOptions = useMemo(() => {
    if (!form.practiceId) {
      return practices.flatMap((p) =>
        p.locations.map((l) => ({ id: l.id, label: l.name, sub: p.name + (l.address ? ` · ${l.address}` : "") }))
      )
    }
    const p = practices.find((p) => p.id === form.practiceId)
    return (p?.locations ?? []).map((l) => ({
      id: l.id,
      label: l.name,
      sub: l.address ?? undefined,
    }))
  }, [form.practiceId, practices])

  const doctorOptions = useMemo(() => {
    if (!form.practiceId) return allDoctors.map((d) => ({ id: d.id, label: d.name + (d.title ? `, ${d.title}` : ""), sub: d.practiceName }))
    const p = practices.find((p) => p.id === form.practiceId)
    return (p?.doctors ?? []).map((d) => ({ id: d.id, label: d.name + (d.title ? `, ${d.title}` : ""), sub: d.practiceName }))
  }, [form.practiceId, practices, allDoctors])

  const practiceOptions = practices.map((p) => ({ id: p.id, label: p.name }))

  function openNew() {
    setForm(emptyForm())
    setEditId(null)
    setError(null)
    setOpen(true)
  }

  function openEdit(a: ActivityRow) {
    setForm({
      practiceId: a.practice?.id ?? "",
      locationId: a.location?.id ?? "",
      providerIds: a.providers.map((p) => p.doctor.id),
      nextStep: a.nextStep ?? "",
      date: format(new Date(a.date), "yyyy-MM-dd"),
      frontDesk: a.frontDesk ?? "",
      flyer: a.flyer ?? "",
      notes: a.notes ?? "",
    })
    setEditId(a.id)
    setError(null)
    setOpen(true)
  }

  function set(field: string, value: string | string[]) {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      // Clear location if practice changes
      if (field === "practiceId") next.locationId = ""
      return next
    })
  }

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const result = editId
        ? await updateActivity(editId, form)
        : await createActivity(form)
      if (result.error) {
        setError(typeof result.error === "string" ? result.error : "Error saving activity.")
      } else {
        setOpen(false)
      }
    })
  }

  const filtered = activities.filter((a) => {
    const q = search.toLowerCase()
    return (
      !q ||
      a.practice?.name.toLowerCase().includes(q) ||
      a.location?.name.toLowerCase().includes(q) ||
      a.providers.some((p) => p.doctor.name.toLowerCase().includes(q)) ||
      a.notes?.toLowerCase().includes(q) ||
      a.nextStep?.toLowerCase().includes(q)
    )
  })

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search activities..."
            className="pl-9"
          />
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" />
          New Activity
        </Button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border border-dashed border-slate-200 rounded-xl bg-slate-50 text-center">
          <CalendarDays className="h-10 w-10 text-slate-300 mb-3" />
          <p className="font-medium text-slate-600">No activities yet</p>
          <p className="text-sm text-slate-400 mt-1">Log a visit or call to a referring practice.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => (
            <div key={a.id} className="flex items-start gap-4 p-4 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors">
              {/* Date column */}
              <div className="shrink-0 w-16 text-center">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
                  {format(new Date(a.date), "MMM")}
                </p>
                <p className="text-2xl font-bold text-slate-800 leading-none">
                  {format(new Date(a.date), "d")}
                </p>
                <p className="text-xs text-slate-400">{format(new Date(a.date), "yyyy")}</p>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {a.practice && (
                    <span className="flex items-center gap-1 text-sm font-semibold text-slate-800">
                      <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      {a.practice.name}
                    </span>
                  )}
                  {a.location && (
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {a.location.name}
                    </span>
                  )}
                </div>

                {a.providers.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {a.providers.map((p) => (
                      <Badge key={p.doctor.id} variant="secondary" className="text-xs">
                        <User className="h-3 w-3 mr-1" />
                        {p.doctor.name}{p.doctor.title ? `, ${p.doctor.title}` : ""}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                  {a.nextStep && <span><span className="font-medium text-slate-600">Next:</span> {a.nextStep}</span>}
                  {a.frontDesk && <span><span className="font-medium text-slate-600">Front desk:</span> {a.frontDesk}</span>}
                  {a.flyer && <span><span className="font-medium text-slate-600">Flyer:</span> {a.flyer}</span>}
                </div>

                {a.notes && (
                  <p className="text-sm text-slate-600 line-clamp-2">{a.notes}</p>
                )}

                <p className="text-xs text-slate-400">Logged by {a.createdBy.name ?? a.createdBy.email}</p>
              </div>

              {/* Actions */}
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(a)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => setDeleteId(a.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New / Edit Dialog */}
      <Dialog open={open} onOpenChange={(v) => !isPending && setOpen(v)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Activity" : "New Activity"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-2">
            {/* Account */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Account <span className="text-slate-400 font-normal">(Organization)</span>
              </label>
              <Picker
                placeholder="Search Account..."
                value={form.practiceId}
                options={practiceOptions}
                onSelect={(id) => set("practiceId", id)}
                onClear={() => set("practiceId", "")}
              />
            </div>

            {/* Clinic Location */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Clinic Location</label>
              <Picker
                placeholder="Search Locations..."
                value={form.locationId}
                options={locationOptions}
                onSelect={(id) => set("locationId", id)}
                onClear={() => set("locationId", "")}
              />
            </div>

            {/* Providers */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Providers</label>
              <ProviderPicker
                options={doctorOptions}
                selected={form.providerIds}
                onToggle={(id) =>
                  set(
                    "providerIds",
                    form.providerIds.includes(id)
                      ? form.providerIds.filter((x) => x !== id)
                      : [...form.providerIds, id]
                  )
                }
              />
            </div>

            {/* Selected Providers */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Selected Providers</label>
              <div className="min-h-[60px] border border-slate-200 rounded-md bg-slate-50 px-3 py-2 flex flex-wrap gap-1.5 content-start">
                {form.providerIds.length === 0 ? (
                  <p className="text-xs text-slate-400 self-center">None selected</p>
                ) : (
                  form.providerIds.map((id) => {
                    const d = allDoctors.find((x) => x.id === id)
                    return d ? (
                      <Badge key={id} variant="secondary" className="text-xs flex items-center gap-1">
                        {d.name}{d.title ? `, ${d.title}` : ""}
                        <button onClick={() => set("providerIds", form.providerIds.filter((x) => x !== id))}>
                          <X className="h-2.5 w-2.5 ml-0.5 hover:text-red-500" />
                        </button>
                      </Badge>
                    ) : null
                  })
                )}
              </div>
            </div>

            {/* Next Step */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Next Step</label>
              <Input
                value={form.nextStep}
                onChange={(e) => set("nextStep", e.target.value)}
                placeholder="e.g. Follow up in 2 weeks"
              />
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Date</label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </div>

            {/* Front Desk Staff */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Front Desk Staff
                <span className="ml-1 text-slate-400 text-xs font-normal" title="Name of the front desk contact you spoke with">ⓘ</span>
              </label>
              <Input
                value={form.frontDesk}
                onChange={(e) => set("frontDesk", e.target.value)}
                placeholder="e.g. Maria"
              />
            </div>

            {/* Flyer */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Flyer</label>
              <select
                value={form.flyer}
                onChange={(e) => set("flyer", e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Select Flyer —</option>
                {FLYER_OPTIONS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div className="col-span-2 space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Notes</label>
              <Textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Enter notes here..."
                rows={4}
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editId ? "Save Changes" : "Log Activity"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Activity</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500">This activity log will be permanently deleted.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                startTransition(async () => {
                  if (deleteId) await deleteActivity(deleteId)
                  setDeleteId(null)
                })
              }}
              disabled={isPending}
            >
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
