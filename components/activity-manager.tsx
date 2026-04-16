"use client"

import { useState, useTransition, useMemo } from "react"
import { createActivity, updateActivity, deleteActivity } from "@/app/actions/activities"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import {
  Plus, Loader2, Trash2, Pencil, Search, X, CalendarDays,
  Building2, MapPin, User, ChevronDown, Tag,
} from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Practice {
  id: string; name: string
  locations: Location[]; doctors: Doctor[]
}
interface Location { id: string; name: string; address: string | null; practiceId: string }
interface Doctor { id: string; name: string; title: string | null; practiceId: string; practiceName: string }

interface ActivityRow {
  id: string; date: string; tags: string[]
  practice: { id: string; name: string } | null
  location: { id: string; name: string; address: string | null } | null
  providers: { doctor: { id: string; name: string; title: string | null } }[]
  nextStep: string | null; frontDesk: string | null; flyer: string | null; notes: string | null
  createdBy: { name: string | null; email: string }
}

interface Props {
  activities: ActivityRow[]
  practices: Practice[]
  allDoctors: Doctor[]
  allTags: string[]
  currentUserId: string
}

// ─── Tag colors (cycles through a palette) ────────────────────────────────────

const TAG_PALETTE = [
  "bg-blue-100 text-blue-700 border-blue-200",
  "bg-purple-100 text-purple-700 border-purple-200",
  "bg-green-100 text-green-700 border-green-200",
  "bg-orange-100 text-orange-700 border-orange-200",
  "bg-pink-100 text-pink-700 border-pink-200",
  "bg-teal-100 text-teal-700 border-teal-200",
  "bg-yellow-100 text-yellow-700 border-yellow-200",
  "bg-red-100 text-red-700 border-red-200",
]

function tagColor(tag: string) {
  let hash = 0
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash)
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length]
}

// ─── Tag chip ─────────────────────────────────────────────────────────────────

function TagChip({ tag, onRemove, onClick, active }: {
  tag: string; onRemove?: () => void; onClick?: () => void; active?: boolean
}) {
  return (
    <span
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors",
        tagColor(tag),
        onClick && "cursor-pointer hover:opacity-80",
        active && "ring-2 ring-offset-1 ring-blue-400"
      )}
    >
      {tag}
      {onRemove && (
        <button type="button" onClick={e => { e.stopPropagation(); onRemove() }} className="hover:opacity-70 ml-0.5">
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  )
}

// ─── Tag input ────────────────────────────────────────────────────────────────

function TagInput({ tags, onChange, suggestions }: {
  tags: string[]; onChange: (v: string[]) => void; suggestions: string[]
}) {
  const [input, setInput] = useState("")
  const [focused, setFocused] = useState(false)

  const filtered = suggestions.filter(
    s => s.toLowerCase().includes(input.toLowerCase()) && !tags.includes(s)
  )

  function addTag(tag: string) {
    const t = tag.trim().toLowerCase()
    if (t && !tags.includes(t)) onChange([...tags, t])
    setInput("")
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault(); addTag(input)
    }
    if (e.key === "Backspace" && !input && tags.length) {
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <div className="relative">
      <div
        className={cn(
          "min-h-[38px] flex flex-wrap gap-1 px-2 py-1.5 border border-slate-200 rounded-md bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent"
        )}
      >
        {tags.map(t => (
          <TagChip key={t} tag={t} onRemove={() => onChange(tags.filter(x => x !== t))} />
        ))}
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={tags.length === 0 ? "Add tags (Enter or comma to add)…" : ""}
          className="flex-1 min-w-24 text-sm outline-none bg-transparent placeholder:text-slate-400"
        />
      </div>
      {focused && (input || filtered.length > 0) && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg">
          {input.trim() && !tags.includes(input.trim().toLowerCase()) && (
            <button
              type="button"
              onMouseDown={() => addTag(input)}
              className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-2"
            >
              <Plus className="h-3.5 w-3.5" />
              Create tag "{input.trim().toLowerCase()}"
            </button>
          )}
          {filtered.map(s => (
            <button
              key={s}
              type="button"
              onMouseDown={() => addTag(s)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
            >
              <Tag className="h-3 w-3 text-slate-400" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Searchable single-select picker ─────────────────────────────────────────

function Picker({ placeholder, value, options, onSelect, onClear }: {
  placeholder: string; value: string
  options: { id: string; label: string; sub?: string }[]
  onSelect: (id: string) => void; onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(q.toLowerCase()) ||
    (o.sub && o.sub.toLowerCase().includes(q.toLowerCase()))
  )
  const selected = options.find(o => o.id === value)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-md bg-white text-sm text-left hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <span className={`flex-1 truncate ${selected ? "text-slate-800" : "text-slate-400"}`}>
          {selected ? selected.label : placeholder}
        </span>
        {selected
          ? <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 shrink-0" onClick={e => { e.stopPropagation(); onClear(); setOpen(false) }} />
          : <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        }
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg">
          <div className="p-2 border-b border-slate-100">
            <Input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search..." className="h-8 text-sm" />
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0
              ? <li className="px-3 py-2 text-xs text-slate-400">No results</li>
              : filtered.map(o => (
                <li key={o.id} onClick={() => { onSelect(o.id); setOpen(false); setQ("") }}
                  className="px-3 py-2 cursor-pointer hover:bg-slate-50 text-sm">
                  <p className="font-medium text-slate-800">{o.label}</p>
                  {o.sub && <p className="text-xs text-slate-400">{o.sub}</p>}
                </li>
              ))
            }
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Multi-select provider picker ────────────────────────────────────────────

function ProviderPicker({ options, selected, onToggle }: {
  options: { id: string; label: string; sub?: string }[]
  selected: string[]; onToggle: (id: string) => void
}) {
  const [q, setQ] = useState("")
  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(q.toLowerCase()) ||
    (o.sub && o.sub.toLowerCase().includes(q.toLowerCase()))
  )

  return (
    <div className="border border-slate-200 rounded-md bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
        <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search providers..."
          className="flex-1 text-sm outline-none bg-transparent placeholder:text-slate-400" />
      </div>
      <ul className="max-h-40 overflow-y-auto py-1">
        {filtered.length === 0
          ? <li className="px-3 py-2 text-xs text-slate-400">No providers found</li>
          : filtered.map(o => {
            const isSelected = selected.includes(o.id)
            return (
              <li key={o.id} onClick={() => onToggle(o.id)}
                className={`px-3 py-2 cursor-pointer text-sm flex items-center gap-2 hover:bg-slate-50 ${isSelected ? "bg-blue-50" : ""}`}>
                <div className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${isSelected ? "bg-blue-600 border-blue-600" : "border-slate-300"}`}>
                  {isSelected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8"><path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-slate-800 truncate">{o.label}</p>
                  {o.sub && <p className="text-xs text-slate-400 truncate">{o.sub}</p>}
                </div>
              </li>
            )
          })
        }
      </ul>
    </div>
  )
}

// ─── Form helpers ─────────────────────────────────────────────────────────────

function emptyForm() {
  return {
    practiceId: "", locationId: "", providerIds: [] as string[],
    nextStep: "", date: format(new Date(), "yyyy-MM-dd"),
    frontDesk: "", flyer: "", notes: "", tags: [] as string[],
  }
}

const FLYER_OPTIONS = [
  "Genesis Ortho General", "Hip & Knee Replacement", "Sports Medicine",
  "Spine Care", "Foot & Ankle", "Hand & Wrist", "Physical Therapy", "Other",
]

// ─── Main component ───────────────────────────────────────────────────────────

export default function ActivityManager({ activities, practices, allDoctors, allTags }: Props) {
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Filters
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [activeTags, setActiveTags] = useState<string[]>([])

  // All unique tags across all activities (for filter bar + suggestions)
  const knownTags = useMemo(() => {
    return Array.from(new Set([...allTags, ...activities.flatMap(a => a.tags)]))
  }, [allTags, activities])

  // Filter locations by selected practice
  const locationOptions = useMemo(() => {
    if (!form.practiceId) return practices.flatMap(p => p.locations.map(l => ({ id: l.id, label: l.name, sub: p.name + (l.address ? ` · ${l.address}` : "") })))
    const p = practices.find(p => p.id === form.practiceId)
    return (p?.locations ?? []).map(l => ({ id: l.id, label: l.name, sub: l.address ?? undefined }))
  }, [form.practiceId, practices])

  const doctorOptions = useMemo(() => {
    if (!form.practiceId) return allDoctors.map(d => ({ id: d.id, label: d.name + (d.title ? `, ${d.title}` : ""), sub: d.practiceName }))
    const p = practices.find(p => p.id === form.practiceId)
    return (p?.doctors ?? []).map(d => ({ id: d.id, label: d.name + (d.title ? `, ${d.title}` : ""), sub: d.practiceName }))
  }, [form.practiceId, practices, allDoctors])

  const practiceOptions = practices.map(p => ({ id: p.id, label: p.name }))

  function openNew() { setForm(emptyForm()); setEditId(null); setError(null); setOpen(true) }

  function openEdit(a: ActivityRow) {
    setForm({
      practiceId: a.practice?.id ?? "", locationId: a.location?.id ?? "",
      providerIds: a.providers.map(p => p.doctor.id),
      nextStep: a.nextStep ?? "", date: format(new Date(a.date), "yyyy-MM-dd"),
      frontDesk: a.frontDesk ?? "", flyer: a.flyer ?? "",
      notes: a.notes ?? "", tags: a.tags ?? [],
    })
    setEditId(a.id); setError(null); setOpen(true)
  }

  function set(field: string, value: string | string[]) {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      if (field === "practiceId") next.locationId = ""
      return next
    })
  }

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const result = editId ? await updateActivity(editId, form) : await createActivity(form)
      if (result.error) {
        setError(typeof result.error === "string" ? result.error : "Error saving activity.")
      } else {
        setOpen(false)
      }
    })
  }

  function toggleTagFilter(tag: string) {
    setActiveTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  const filtered = useMemo(() => {
    return activities.filter(a => {
      const q = search.toLowerCase()
      if (q && !(
        a.practice?.name.toLowerCase().includes(q) ||
        a.location?.name.toLowerCase().includes(q) ||
        a.providers.some(p => p.doctor.name.toLowerCase().includes(q)) ||
        a.notes?.toLowerCase().includes(q) ||
        a.nextStep?.toLowerCase().includes(q) ||
        a.tags.some(t => t.toLowerCase().includes(q))
      )) return false

      if (dateFrom) {
        if (new Date(a.date) < new Date(dateFrom + "T00:00:00")) return false
      }
      if (dateTo) {
        if (new Date(a.date) > new Date(dateTo + "T23:59:59")) return false
      }

      if (activeTags.length > 0) {
        if (!activeTags.every(t => a.tags.includes(t))) return false
      }

      return true
    })
  }, [activities, search, dateFrom, dateTo, activeTags])

  const hasFilters = search || dateFrom || dateTo || activeTags.length > 0

  return (
    <>
      {/* ── Filter bar ── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search activities..." className="pl-9" />
          </div>

          {/* Date from */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-slate-500 whitespace-nowrap">From</label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36 text-sm" />
          </div>

          {/* Date to */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-slate-500 whitespace-nowrap">To</label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36 text-sm" />
          </div>

          {/* Clear filters */}
          {hasFilters && (
            <button
              onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); setActiveTags([]) }}
              className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-slate-100"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}

          <Button onClick={openNew} className="ml-auto">
            <Plus className="h-4 w-4 mr-2" />New Activity
          </Button>
        </div>

        {/* Tag filter chips */}
        {knownTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Tag className="h-3 w-3" /> Filter by tag:
            </span>
            {knownTags.map(tag => (
              <button key={tag} onClick={() => toggleTagFilter(tag)}>
                <TagChip tag={tag} active={activeTags.includes(tag)} />
              </button>
            ))}
          </div>
        )}

        {/* Active filter summary */}
        {hasFilters && (
          <p className="text-xs text-slate-500">
            Showing {filtered.length} of {activities.length} activities
          </p>
        )}
      </div>

      {/* ── List ── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border border-dashed border-slate-200 rounded-xl bg-slate-50 text-center">
          <CalendarDays className="h-10 w-10 text-slate-300 mb-3" />
          <p className="font-medium text-slate-600">{hasFilters ? "No activities match your filters" : "No activities yet"}</p>
          <p className="text-sm text-slate-400 mt-1">{hasFilters ? "Try adjusting the date range or tags." : "Log a visit or call to a referring practice."}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(a => (
            <div key={a.id} className="flex items-start gap-4 p-4 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors">
              {/* Date column */}
              <div className="shrink-0 w-16 text-center">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">{format(new Date(a.date), "MMM")}</p>
                <p className="text-2xl font-bold text-slate-800 leading-none">{format(new Date(a.date), "d")}</p>
                <p className="text-xs text-slate-400">{format(new Date(a.date), "yyyy")}</p>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {a.practice && (
                    <span className="flex items-center gap-1 text-sm font-semibold text-slate-800">
                      <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />{a.practice.name}
                    </span>
                  )}
                  {a.location && (
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <MapPin className="h-3 w-3 shrink-0" />{a.location.name}
                    </span>
                  )}
                </div>

                {a.providers.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {a.providers.map(p => (
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

                {/* Tags */}
                {a.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {a.tags.map(tag => (
                      <button key={tag} onClick={() => toggleTagFilter(tag)}>
                        <TagChip tag={tag} active={activeTags.includes(tag)} />
                      </button>
                    ))}
                  </div>
                )}

                {a.notes && <p className="text-sm text-slate-600 line-clamp-2">{a.notes}</p>}
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

      {/* ── New / Edit Dialog ── */}
      <Dialog open={open} onOpenChange={v => !isPending && setOpen(v)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Activity" : "New Activity"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-2">
            {/* Account */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Account <span className="text-slate-400 font-normal">(Organization)</span></label>
              <Picker placeholder="Search Account..." value={form.practiceId} options={practiceOptions}
                onSelect={id => set("practiceId", id)} onClear={() => set("practiceId", "")} />
            </div>

            {/* Clinic Location */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Clinic Location</label>
              <Picker placeholder="Search Locations..." value={form.locationId} options={locationOptions}
                onSelect={id => set("locationId", id)} onClear={() => set("locationId", "")} />
            </div>

            {/* Providers */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Providers</label>
              <ProviderPicker options={doctorOptions} selected={form.providerIds}
                onToggle={id => set("providerIds", form.providerIds.includes(id)
                  ? form.providerIds.filter(x => x !== id) : [...form.providerIds, id]
                )} />
            </div>

            {/* Selected Providers */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Selected Providers</label>
              <div className="min-h-[60px] border border-slate-200 rounded-md bg-slate-50 px-3 py-2 flex flex-wrap gap-1.5 content-start">
                {form.providerIds.length === 0
                  ? <p className="text-xs text-slate-400 self-center">None selected</p>
                  : form.providerIds.map(id => {
                    const d = allDoctors.find(x => x.id === id)
                    return d ? (
                      <Badge key={id} variant="secondary" className="text-xs flex items-center gap-1">
                        {d.name}{d.title ? `, ${d.title}` : ""}
                        <button onClick={() => set("providerIds", form.providerIds.filter(x => x !== id))}>
                          <X className="h-2.5 w-2.5 ml-0.5 hover:text-red-500" />
                        </button>
                      </Badge>
                    ) : null
                  })
                }
              </div>
            </div>

            {/* Next Step */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Next Step</label>
              <Input value={form.nextStep} onChange={e => set("nextStep", e.target.value)} placeholder="e.g. Follow up in 2 weeks" />
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Date</label>
              <Input type="date" value={form.date} onChange={e => set("date", e.target.value)} />
            </div>

            {/* Front Desk Staff */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Front Desk Staff <span className="ml-1 text-slate-400 text-xs font-normal" title="Name of the front desk contact you spoke with">ⓘ</span>
              </label>
              <Input value={form.frontDesk} onChange={e => set("frontDesk", e.target.value)} placeholder="e.g. Maria" />
            </div>

            {/* Flyer */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Flyer</label>
              <select value={form.flyer} onChange={e => set("flyer", e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Select Flyer —</option>
                {FLYER_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>

            {/* Tags */}
            <div className="col-span-2 space-y-1.5">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5 text-slate-400" /> Tags
              </label>
              <TagInput tags={form.tags} onChange={v => set("tags", v)} suggestions={knownTags.filter(t => !form.tags.includes(t))} />
            </div>

            {/* Notes */}
            <div className="col-span-2 space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Notes</label>
              <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Enter notes here..." rows={4} />
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editId ? "Save Changes" : "Log Activity"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ── */}
      <Dialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Activity</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500">This activity log will be permanently deleted.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={isPending}
              onClick={() => startTransition(async () => { if (deleteId) await deleteActivity(deleteId); setDeleteId(null) })}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
