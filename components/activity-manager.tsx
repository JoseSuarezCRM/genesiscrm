"use client"

import { useState, useTransition, useMemo, useRef, useEffect } from "react"
import { createActivity, updateActivity, deleteActivity } from "@/app/actions/activities"
import { createActivityView, updateActivityView, deleteActivityView } from "@/app/actions/activity-views"
import { ViewAccessSelector, type Visibility, type ViewAccessValue, type ShareUser, type ShareTeam } from "@/components/view-access-selector"
import { upsertActivityTag, updateTagColor } from "@/app/actions/tags"
import { emailActivityReport } from "@/app/actions/activity-report"
import { showToast } from "@/components/toast"
import { createPractice, createLocation, createDoctor } from "@/app/actions/referring-doctors"
import SelectedProvidersCard from "@/components/selected-providers-card"
import ExportDialog from "@/components/ui/export-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import StyledSelect from "@/components/ui/styled-select"
import { PhoneInput } from "@/components/ui/phone-input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import {
  Plus, Loader2, Trash2, Pencil, Search, X, CalendarDays,
  Building2, MapPin, User, ChevronDown, Tag, Check, Save,
  Globe, Users, UserCog, Lock, LayoutList, Table2, Download, Columns3, ChevronUp, Mail, Send,
} from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

interface TagObj { id: string; name: string; color: string }

interface Practice {
  id: string; name: string
  locations: Location[]; doctors: Doctor[]
}
interface Location { id: string; name: string; address: string | null; practiceId: string }
interface Doctor {
  id: string
  name: string
  title: string | null
  npi: string | null
  specialty: string | null
  phone: string | null
  officePhone: string | null
  email: string | null
  practiceId: string
  practiceName: string
}

interface ActivityRow {
  id: string; date: string; tags: TagObj[]
  practice: { id: string; name: string } | null
  location: { id: string; name: string; address: string | null } | null
  providers: { doctor: { id: string; name: string; title: string | null } }[]
  nextStep: string | null; frontDesk: string | null; flyer: string | null; notes: string | null
  createdBy: { name: string | null; email: string }
}

interface SavedView {
  id: string
  name: string
  filters: {
    search: string
    dateFrom: string
    dateTo: string
    activeTagIds: string[]
    filterPracticeIds: string[]
    filterPracticeMode: "any" | "none"
    filterLocationIds: string[]
    filterLocationMode: "any" | "none"
    filterProviderIds: string[]
    filterProviderMode: "any" | "none"
  }
  visibility?: Visibility
  teamId?: string | null
  sharedUserIds?: string[]
  isOwner?: boolean
}

interface Props {
  activities: ActivityRow[]
  practices: Practice[]
  allDoctors: Doctor[]
  allTags: TagObj[]
  currentUserId: string
  savedViews: SavedView[]
  shareUsers: ShareUser[]
  shareTeams: ShareTeam[]
}

// ─── Color palette ────────────────────────────────────────────────────────────

const COLOR_OPTIONS = [
  { label: "Blue",   hex: "#3b82f6" },
  { label: "Indigo", hex: "#6366f1" },
  { label: "Purple", hex: "#a855f7" },
  { label: "Pink",   hex: "#ec4899" },
  { label: "Red",    hex: "#ef4444" },
  { label: "Orange", hex: "#f97316" },
  { label: "Yellow", hex: "#eab308" },
  { label: "Green",  hex: "#22c55e" },
  { label: "Teal",   hex: "#14b8a6" },
  { label: "Slate",  hex: "#64748b" },
]

function hexToChipStyle(hex: string) {
  return {
    backgroundColor: hex + "20",
    color: hex,
    borderColor: hex + "50",
  }
}

// ─── Color picker ─────────────────────────────────────────────────────────────

function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 p-2 bg-white border border-slate-200 rounded-lg shadow-sm">
      {COLOR_OPTIONS.map(c => (
        <button
          key={c.hex}
          type="button"
          title={c.label}
          onClick={() => onChange(c.hex)}
          className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center"
          style={{ backgroundColor: c.hex, borderColor: value === c.hex ? "#1e293b" : "transparent" }}
        >
          {value === c.hex && <Check className="w-3 h-3 text-white" />}
        </button>
      ))}
    </div>
  )
}

// ─── Tag chip ─────────────────────────────────────────────────────────────────

function TagChip({ tag, onRemove, onClick, active, onColorChange }: {
  tag: TagObj
  onRemove?: () => void
  onClick?: () => void
  active?: boolean
  onColorChange?: (hex: string) => void
}) {
  const [colorOpen, setColorOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleColorChange(hex: string) {
    setColorOpen(false)
    startTransition(async () => {
      await updateTagColor(tag.id, hex)
    })
  }

  return (
    <span className="relative inline-flex items-center">
      <span
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border transition-all",
          onClick && "cursor-pointer hover:opacity-80",
          active && "ring-2 ring-offset-1 ring-slate-400",
          pending && "opacity-50"
        )}
        style={hexToChipStyle(tag.color)}
      >
        {onColorChange && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setColorOpen(v => !v) }}
            className="w-2.5 h-2.5 rounded-full border border-current opacity-60 hover:opacity-100 shrink-0"
            style={{ backgroundColor: tag.color }}
            title="Change color"
          />
        )}
        {tag.name}
        {onRemove && (
          <button type="button" onClick={e => { e.stopPropagation(); onRemove() }} className="hover:opacity-70 -mr-0.5">
            <X className="h-2.5 w-2.5" />
          </button>
        )}
      </span>
      {colorOpen && (
        <div className="absolute z-50 top-full left-0 mt-1">
          <ColorPicker value={tag.color} onChange={handleColorChange} />
        </div>
      )}
    </span>
  )
}

// ─── Tag input (form) ─────────────────────────────────────────────────────────

function TagInput({ selected, onChange, allTags }: {
  selected: TagObj[]
  onChange: (tags: TagObj[]) => void
  allTags: TagObj[]
}) {
  const [input, setInput] = useState("")
  const [focused, setFocused] = useState(false)
  const [newColor, setNewColor] = useState(COLOR_OPTIONS[0].hex)
  const [creating, startTransition] = useTransition()

  const selectedIds = new Set(selected.map(t => t.id))
  const filtered = allTags.filter(
    t => t.name.toLowerCase().includes(input.toLowerCase()) && !selectedIds.has(t.id)
  )
  const isNew = input.trim() && !allTags.some(t => t.name.toLowerCase() === input.trim().toLowerCase())

  function addExisting(tag: TagObj) {
    onChange([...selected, tag])
    setInput("")
  }

  function createAndAdd() {
    const name = input.trim().toLowerCase()
    if (!name) return
    startTransition(async () => {
      const tag = await upsertActivityTag(name, newColor)
      onChange([...selected, tag])
      setInput("")
      setNewColor(COLOR_OPTIONS[0].hex)
    })
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      if (filtered.length === 1 && !isNew) { addExisting(filtered[0]); return }
      if (isNew) createAndAdd()
    }
    if (e.key === "Backspace" && !input && selected.length) {
      onChange(selected.slice(0, -1))
    }
  }

  return (
    <div className="space-y-2">
      <div className={cn(
        "min-h-[38px] flex flex-wrap gap-1 px-2 py-1.5 border border-slate-200 rounded-md bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent"
      )}>
        {selected.map(t => (
          <TagChip
            key={t.id} tag={t}
            onRemove={() => onChange(selected.filter(x => x.id !== t.id))}
            onColorChange={() => {}}
          />
        ))}
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          placeholder={selected.length === 0 ? "Type a tag name…" : ""}
          className="flex-1 min-w-24 text-sm outline-none bg-transparent placeholder:text-slate-400"
        />
      </div>

      {focused && (
        <div className="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden">
          {/* Existing matches */}
          {filtered.length > 0 && (
            <div className="py-1">
              {filtered.slice(0, 6).map(t => (
                <button
                  key={t.id} type="button" onMouseDown={() => addExisting(t)}
                  className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-slate-50 text-sm"
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                  {t.name}
                </button>
              ))}
            </div>
          )}

          {/* Create new */}
          {isNew && (
            <div className="border-t border-slate-100 p-2 space-y-2">
              <p className="text-xs text-slate-500 px-1">
                Create <strong>"{input.trim().toLowerCase()}"</strong> — pick a color:
              </p>
              <ColorPicker value={newColor} onChange={setNewColor} />
              <button
                type="button" onMouseDown={createAndAdd}
                disabled={creating}
                className="w-full text-xs bg-blue-600 text-white rounded-md py-1.5 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                Add tag
              </button>
            </div>
          )}

          {!isNew && filtered.length === 0 && input && (
            <p className="text-xs text-slate-400 px-3 py-2 italic">No tags found.</p>
          )}
          {!input && filtered.length === 0 && selected.length === allTags.length && (
            <p className="text-xs text-slate-400 px-3 py-2 italic">All tags selected.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Searchable single-select picker ─────────────────────────────────────────

function Picker({ placeholder, value, options, onSelect, onClear, onQuickCreate }: {
  placeholder: string; value: string
  options: { id: string; label: string; sub?: string }[]
  onSelect: (id: string) => void; onClear: () => void
  onQuickCreate?: (name: string) => Promise<{ id: string; label: string } | null>
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [creating, setCreating] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setQ("")
      }
    }
    if (open) document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])
  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(q.toLowerCase()) ||
    (o.sub && o.sub.toLowerCase().includes(q.toLowerCase()))
  )
  const selected = options.find(o => o.id === value)
  const hasExact = filtered.some(o => o.label.toLowerCase() === q.trim().toLowerCase())
  const canCreate = !!onQuickCreate && q.trim().length > 0 && !hasExact

  return (
    <div className="relative" ref={ref}>
      <div className="w-full flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-md bg-white text-sm hover:border-slate-300 focus-within:ring-2 focus-within:ring-blue-500">
        <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <input
          ref={inputRef}
          value={open ? q : (selected ? selected.label : "")}
          onChange={e => { setQ(e.target.value); if (!open) setOpen(true) }}
          onClick={() => { if (!open) { setQ(""); setOpen(true) } }}
          placeholder={selected ? selected.label : placeholder}
          className="flex-1 min-w-0 truncate outline-none bg-transparent text-slate-800 placeholder:text-slate-400"
        />
        {selected
          ? <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 shrink-0 cursor-pointer" onClick={() => { onClear(); setOpen(false); setQ("") }} />
          : <ChevronDown
              className="h-3.5 w-3.5 text-slate-400 shrink-0 cursor-pointer"
              onClick={() => { if (open) { setOpen(false); setQ("") } else inputRef.current?.focus() }}
            />
        }
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg">
          <ul className="max-h-52 overflow-y-auto py-1 bg-white">
            {filtered.length === 0 && !canCreate
              ? <li className="px-3 py-2 text-xs text-slate-400">No results</li>
              : filtered.map(o => (
                <li key={o.id} onClick={() => { onSelect(o.id); setOpen(false); setQ("") }}
                  className="px-3 py-2 cursor-pointer hover:bg-slate-50 text-sm">
                  <p className="font-medium text-slate-800">{o.label}</p>
                  {o.sub && <p className="text-xs text-slate-400">{o.sub}</p>}
                </li>
              ))
            }
            {canCreate && (
              <li className={cn("border-t border-slate-100", filtered.length > 0 ? "mt-1" : "")}>
                <button
                  type="button"
                  disabled={creating}
                  onMouseDown={async (e) => {
                    e.preventDefault()
                    setCreating(true)
                    const result = await onQuickCreate!(q.trim())
                    setCreating(false)
                    if (result) { onSelect(result.id); setOpen(false); setQ("") }
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-2 disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  Create "{q.trim()}"
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Create Provider Modal ────────────────────────────────────────────────────

const PROVIDER_TITLE_OPTIONS = ["MD", "DO", "NP", "PA-C", "DPM", "DC", "PT", "OT", "RN", "Front Desk", "Manager", "Referral Coordinator", "Custom..."]

function InlineCreateProvider({ initialName, practiceId, locations, onCancel, onCreate }: {
  initialName: string
  practiceId: string
  locations: { id: string; name: string }[]
  onCancel: () => void
  onCreate: (provider: { id: string; label: string; name: string; title: string | null }) => void
}) {
  const [name, setName] = useState(initialName)
  const [titleSelect, setTitleSelect] = useState("")
  const [titleCustom, setTitleCustom] = useState("")
  const [npi, setNpi] = useState("")
  const [phone, setPhone] = useState("")
  const [officePhone, setOfficePhone] = useState("")
  const [email, setEmail] = useState("")
  const [locationIds, setLocationIds] = useState<string[]>([])
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState("")

  const isCustomTitle = titleSelect === "Custom..."
  const finalTitle = isCustomTitle ? titleCustom.trim() : titleSelect

  function toggleLoc(id: string) {
    setLocationIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setErr("Name is required"); return }
    startTransition(async () => {
      const res = await createDoctor({ name, title: finalTitle, npi, phone, officePhone, email, practiceId, locationIds })
      if (!res || res.error || !res.id) { setErr("Failed to create provider"); return }
      onCreate({ id: res.id!, label: name + (finalTitle ? `, ${finalTitle}` : ""), name, title: finalTitle || null })
    })
  }

  const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-400 bg-white"
  const labelCls = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1"

  return (
    <div className="border border-blue-200 rounded-xl bg-blue-50/50 p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">New Provider</p>
        <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>
      </div>
      {err && <p className="text-xs text-red-600 bg-red-50 px-2 py-1.5 rounded-lg border border-red-100">{err}</p>}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Name *</label>
          <input value={name} onChange={e => { setName(e.target.value); setErr("") }} className={inputCls} placeholder="Sarah Johnson" />
        </div>
        <div>
          <label className={labelCls}>Title</label>
          <StyledSelect value={titleSelect} onChange={e => setTitleSelect(e.target.value)} className="w-full">
            <option value="">— None —</option>
            {PROVIDER_TITLE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </StyledSelect>
          {isCustomTitle && (
            <input value={titleCustom} onChange={e => setTitleCustom(e.target.value)}
              className={inputCls + " mt-1.5"} placeholder="e.g. Director of Care Coordination" autoFocus />
          )}
        </div>
        <div>
          <label className={labelCls}>NPI</label>
          <input value={npi} onChange={e => setNpi(e.target.value)} className={inputCls} placeholder="1234567890" maxLength={10} />
        </div>
        <div>
          <label className={labelCls}>Phone</label>
          <PhoneInput value={phone} onChange={setPhone} className="h-[38px] text-sm bg-white" />
        </div>
        <div>
          <label className={labelCls}>Office Phone</label>
          <PhoneInput value={officePhone} onChange={setOfficePhone} className="h-[38px] text-sm bg-white" />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} placeholder="dr@clinic.com" />
        </div>
      </div>
      {locations.length > 0 && (
        <div>
          <label className={labelCls}>Locations</label>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {locations.map(l => (
              <button key={l.id} type="button" onClick={() => toggleLoc(l.id)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border transition-colors ${locationIds.includes(l.id) ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"}`}>
                {locationIds.includes(l.id) && <Check className="h-2.5 w-2.5" />}
                {l.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={handleSubmit as any} disabled={isPending}
          className="flex-1 h-8 bg-zinc-900 text-white rounded-lg text-xs font-semibold hover:bg-zinc-800 disabled:opacity-50 flex items-center justify-center gap-1.5">
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Create & Add
        </button>
        <button type="button" onClick={onCancel}
          className="h-8 px-3 text-xs text-zinc-500 hover:text-zinc-800 border border-zinc-200 rounded-lg bg-white transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Multi-select provider picker ────────────────────────────────────────────

function ProviderPicker({ options, selected, onToggle, onOpenCreateForm }: {
  options: { id: string; label: string; sub?: string }[]
  selected: string[]; onToggle: (id: string) => void
  onOpenCreateForm?: (name: string) => void
}) {
  const [q, setQ] = useState("")
  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(q.toLowerCase()) ||
    (o.sub && o.sub.toLowerCase().includes(q.toLowerCase()))
  )
  const hasExact = filtered.some(o => o.label.toLowerCase() === q.trim().toLowerCase())
  const canCreate = !!onOpenCreateForm && q.trim().length > 0 && !hasExact

  return (
    <div className="border border-slate-200 rounded-md bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
        <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search providers..."
          className="flex-1 text-sm outline-none bg-transparent placeholder:text-slate-400" />
      </div>
      <ul className="max-h-40 overflow-y-auto py-1 bg-white">
        {filtered.length === 0 && !canCreate
          ? <li className="px-3 py-2 text-xs text-slate-400">No providers found</li>
          : filtered.map(o => {
            const isSel = selected.includes(o.id)
            return (
              <li key={o.id} onClick={() => onToggle(o.id)}
                className={`px-3 py-2 cursor-pointer text-sm flex items-center gap-2 hover:bg-slate-50 ${isSel ? "bg-blue-50" : ""}`}>
                <div className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${isSel ? "bg-blue-600 border-blue-600" : "border-slate-300"}`}>
                  {isSel && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8"><path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-slate-800 truncate">{o.label}</p>
                  {o.sub && <p className="text-xs text-slate-400 truncate">{o.sub}</p>}
                </div>
              </li>
            )
          })
        }
        {canCreate && (
          <li className={cn("border-t border-slate-100", filtered.length > 0 ? "mt-1" : "")}>
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); onOpenCreateForm!(q.trim()); setQ("") }}
              className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-2"
            >
              <Plus className="h-3 w-3" />
              Create "{q.trim()}"
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}

// ─── Filter dropdown ─────────────────────────────────────────────────────────

function FilterDropdown({ label, options, selected, onToggle, onClear, mode, onModeChange }: {
  label: string
  options: { id: string; label: string }[]
  selected: string[]
  onToggle: (id: string) => void
  onClear: () => void
  mode: "any" | "none"
  onModeChange: (m: "any" | "none") => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const ref = useRef<HTMLDivElement>(null)
  const active = selected.length > 0
  const isExclude = mode === "none"

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQ("") }
    }
    if (open) document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const filtered = q.trim()
    ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase()))
    : options

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm font-medium transition-all select-none ${
          active && isExclude
            ? "bg-rose-600 text-white border-rose-600 hover:bg-rose-700"
            : active
            ? "bg-zinc-900 text-white border-zinc-900 hover:bg-zinc-800"
            : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300 hover:text-zinc-900"
        }`}
      >
        <span>{label}</span>
        {active && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-white/20 text-xs font-bold tabular-nums">
            {isExclude ? "≠" : ""}{selected.length}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full mt-2 left-0 z-50 min-w-[220px] bg-white border border-zinc-200 rounded-xl shadow-xl overflow-hidden">
          {/* Any of / None of */}
          <div className="flex items-center gap-1 p-2 border-b border-zinc-100">
            <button onClick={() => onModeChange("any")}
              className={`flex-1 h-7 text-xs rounded-md font-medium transition-colors ${!isExclude ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-50"}`}>
              Any of
            </button>
            <button onClick={() => onModeChange("none")}
              className={`flex-1 h-7 text-xs rounded-md font-medium transition-colors ${isExclude ? "bg-rose-600 text-white" : "text-zinc-500 hover:bg-zinc-50"}`}>
              None of
            </button>
          </div>
          {options.length > 6 && (
            <div className="px-2 pt-2 pb-1">
              <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}...`}
                className="w-full h-7 px-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-lg outline-none focus:border-zinc-400" />
            </div>
          )}
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.map(opt => (
              <button key={opt.id} onClick={() => onToggle(opt.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-zinc-50 transition-colors text-left">
                <span className={`shrink-0 w-[14px] h-[14px] rounded border flex items-center justify-center transition-all ${
                  selected.includes(opt.id)
                    ? isExclude ? "bg-rose-600 border-rose-600" : "bg-zinc-900 border-zinc-900"
                    : "border-zinc-300"
                }`}>
                  {selected.includes(opt.id) && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                </span>
                <span className="text-zinc-800 truncate">{opt.label}</span>
              </button>
            ))}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-zinc-100 px-3 py-1.5">
              <button onClick={() => { onClear(); setOpen(false) }} className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors">
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Expandable notes ────────────────────────────────────────────────────────

function ExpandableNotes({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const [clamped, setClamped] = useState(false)
  const ref = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const el = ref.current
    if (el) setClamped(el.scrollHeight > el.clientHeight + 1)
  }, [text])

  return (
    <div>
      <p ref={ref} className={`text-sm text-slate-600 whitespace-pre-wrap ${!expanded ? "line-clamp-2" : ""}`}>
        {text}
      </p>
      {(clamped || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="text-xs text-blue-500 hover:text-blue-700 mt-0.5 font-medium transition-colors"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  )
}

// ─── Form helpers ─────────────────────────────────────────────────────────────

function emptyForm() {
  return {
    practiceId: "", locationId: "", providerIds: [] as string[],
    tagIds: [] as string[], selectedTags: [] as TagObj[],
    nextStep: "", date: format(new Date(), "yyyy-MM-dd"),
    frontDesk: "", flyer: "", notes: "",
  }
}

const ACTIVITY_TYPES: { value: string; color: string; bg: string; border: string }[] = [
  { value: "Presentation", color: "text-violet-700", bg: "bg-violet-100", border: "border-violet-300" },
  { value: "Lunch",        color: "text-emerald-700", bg: "bg-emerald-100", border: "border-emerald-300" },
  { value: "Clinic Visit", color: "text-sky-700",     bg: "bg-sky-100",     border: "border-sky-300" },
  { value: "Call",         color: "text-amber-700",   bg: "bg-amber-100",   border: "border-amber-300" },
]

// Activity dates are date-only values stored as UTC midnight; read them in UTC
// so the calendar day doesn't shift back in local timezones
function activityDay(date: string | Date) {
  const d = new Date(date)
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

// Table columns for the activities table view.
const ACTIVITY_COLUMNS: { key: string; label: string; sortable?: boolean }[] = [
  { key: "date",      label: "Date",       sortable: true },
  { key: "account",   label: "Account",    sortable: true },
  { key: "location",  label: "Location" },
  { key: "providers", label: "Providers" },
  { key: "type",      label: "Type" },
  { key: "nextStep",  label: "Next Step" },
  { key: "frontDesk", label: "Front Desk" },
  { key: "tags",      label: "Tags" },
  { key: "notes",     label: "Notes" },
  { key: "loggedBy",  label: "Logged By" },
]
const DEFAULT_ACTIVITY_COLS = ["date", "account", "location", "providers", "type", "nextStep", "tags", "loggedBy"]

// ─── Main component ───────────────────────────────────────────────────────────

export default function ActivityManager({ activities, practices, allDoctors, allTags, savedViews: initialSavedViews, shareUsers, shareTeams, canManage = true }: Props & { canManage?: boolean }) {
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards")
  const [exportOpen, setExportOpen] = useState(false)

  // Email-report dialog
  const [reportOpen, setReportOpen] = useState(false)
  const [reportTo, setReportTo] = useState("")
  const [reportSubject, setReportSubject] = useState("")
  const [reportMessage, setReportMessage] = useState("")
  const [reportPending, startReport] = useTransition()

  // Table view: columns, sort, selection
  const [visibleCols, setVisibleCols] = useState<string[]>(DEFAULT_ACTIVITY_COLS)
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const colMenuRef = useRef<HTMLDivElement>(null)
  const [sortKey, setSortKey] = useState<"date" | "account">("date")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!colMenuOpen) return
    const onDown = (e: MouseEvent) => { if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setColMenuOpen(false) }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [colMenuOpen])

  // Filters
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [filterPracticeIds, setFilterPracticeIds] = useState<string[]>([])
  const [filterPracticeMode, setFilterPracticeMode] = useState<"any" | "none">("any")
  const [filterLocationIds, setFilterLocationIds] = useState<string[]>([])
  const [filterLocationMode, setFilterLocationMode] = useState<"any" | "none">("any")
  const [filterProviderIds, setFilterProviderIds] = useState<string[]>([])
  const [filterProviderMode, setFilterProviderMode] = useState<"any" | "none">("any")
  const [activeTagIds, setActiveTagIds] = useState<string[]>([])

  // Merged tag registry (allTags + any newly created during this session)
  const [tagRegistry, setTagRegistry] = useState<TagObj[]>(allTags)

  // Locally created orgs/locations/doctors (available immediately after inline creation)
  const [extraPractices, setExtraPractices] = useState<{ id: string; name: string }[]>([])
  const [extraLocations, setExtraLocations] = useState<{ id: string; name: string; practiceId: string }[]>([])
  const [extraDoctors, setExtraDoctors] = useState<Doctor[]>([])

  // Create provider modal
  const [createProviderModal, setCreateProviderModal] = useState<{ open: boolean; initialName: string }>({ open: false, initialName: "" })

  // Saved views
  const [savedViews, setSavedViews] = useState<SavedView[]>(initialSavedViews)
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const [savingView, setSavingView] = useState(false)
  const [newViewName, setNewViewName] = useState("")
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [newViewAccess, setNewViewAccess] = useState<ViewAccessValue>({ visibility: "PRIVATE", teamId: null, sharedUserIds: [] })
  const [editAccessId, setEditAccessId] = useState<string | null>(null)
  const [editAccessValue, setEditAccessValue] = useState<ViewAccessValue>({ visibility: "PRIVATE", teamId: null, sharedUserIds: [] })
  const [savingAccess, setSavingAccess] = useState(false)

  // Merge session-created practices, skipping any that already arrived via server props after a refresh
  const allPractices = useMemo(() => {
    const seen = new Set(practices.map(p => p.id))
    const extras = extraPractices.filter(p => {
      if (seen.has(p.id)) return false
      seen.add(p.id)
      return true
    })
    return [...practices, ...extras.map(p => ({ ...p, locations: [], doctors: [] }))]
  }, [practices, extraPractices])

  const practiceOptions = allPractices.map(p => ({ id: p.id, label: p.name }))

  const locationOptions = useMemo(() => {
    const extras = extraLocations.filter(l => !form.practiceId || l.practiceId === form.practiceId)
      .map(l => ({ id: l.id, label: l.name, sub: undefined as string | undefined }))
    let base: { id: string; label: string; sub: string | undefined }[]
    if (!form.practiceId) {
      base = allPractices.flatMap(p => p.locations.map(l => ({ id: l.id, label: l.name, sub: p.name as string | undefined })))
    } else {
      const p = allPractices.find(p => p.id === form.practiceId)
      base = (p?.locations ?? []).map(l => ({ id: l.id, label: l.name, sub: undefined as string | undefined }))
    }
    const baseIds = new Set(base.map(l => l.id))
    return [...base, ...extras.filter(l => !baseIds.has(l.id))]
  }, [form.practiceId, allPractices, extraLocations])

  const combinedDoctors = useMemo(() => {
    const seen = new Set(allDoctors.map(d => d.id))
    return [...allDoctors, ...extraDoctors.filter(d => !seen.has(d.id))]
  }, [allDoctors, extraDoctors])

  const doctorOptions = useMemo(() => {
    if (!form.practiceId) return combinedDoctors.map(d => ({ id: d.id, label: d.name + (d.title ? `, ${d.title}` : ""), sub: d.practiceName }))
    const p = allPractices.find(p => p.id === form.practiceId)
    const baseIds = new Set((p?.doctors ?? []).map(d => d.id))
    const extras = extraDoctors.filter(d => d.practiceId === form.practiceId)
    const base = (p?.doctors ?? []).map(d => ({ id: d.id, label: d.name + (d.title ? `, ${d.title}` : ""), sub: d.practiceName }))
    return [...base, ...extras.filter(d => !baseIds.has(d.id)).map(d => ({ id: d.id, label: d.name + (d.title ? `, ${d.title}` : ""), sub: d.practiceName }))]
  }, [form.practiceId, allPractices, combinedDoctors, extraDoctors])

  // ── Inline create handlers ─────────────────────────────────────────────────

  async function handleCreateOrg(name: string): Promise<{ id: string; label: string } | null> {
    const res = await createPractice({ name, phone: "", fax: "", address: "" })
    if (!res || res.error || !res.id) return null
    setExtraPractices(prev => prev.some(p => p.id === res.id) ? prev : [...prev, { id: res.id!, name }])
    return { id: res.id!, label: name }
  }

  async function handleCreateLocation(name: string): Promise<{ id: string; label: string } | null> {
    if (!form.practiceId) { setError("Select an organization first to create a location."); return null }
    const res = await createLocation({ name, practiceId: form.practiceId, phone: "", fax: "", address: "" })
    if (!res || res.error || !res.id) return null
    setExtraLocations(prev => prev.some(l => l.id === res.id) ? prev : [...prev, { id: res.id!, name, practiceId: form.practiceId }])
    return { id: res.id!, label: name }
  }

  function handleLocationSelect(id: string) {
    // Selecting a location first auto-selects the practice it belongs to
    const owner = allPractices.find(p => p.locations.some(l => l.id === id))
    const extra = extraLocations.find(l => l.id === id)
    const practiceId = owner?.id ?? extra?.practiceId ?? form.practiceId
    setForm(prev => ({ ...prev, locationId: id, practiceId }))
  }

  function handleOpenCreateProvider(name: string) {
    if (!form.practiceId) { setError("Select an organization first to create a provider."); return }
    setCreateProviderModal({ open: true, initialName: name })
  }

  function handleProviderCreated(provider: { id: string; label: string; name: string; title: string | null }) {
    const practiceName = allPractices.find(p => p.id === form.practiceId)?.name ?? ""
    setExtraDoctors(prev => prev.some(d => d.id === provider.id) ? prev : [...prev, {
      id: provider.id,
      name: provider.name,
      title: provider.title,
      npi: null,
      specialty: null,
      phone: null,
      officePhone: null,
      email: null,
      practiceId: form.practiceId,
      practiceName,
    }])
    set("providerIds", [...form.providerIds, provider.id])
    setCreateProviderModal({ open: false, initialName: "" })
  }

  function openNew() {
    setForm(emptyForm()); setEditId(null); setError(null); setOpen(true)
  }

  function openEdit(a: ActivityRow) {
    setForm({
      practiceId: a.practice?.id ?? "", locationId: a.location?.id ?? "",
      providerIds: a.providers.map(p => p.doctor.id),
      tagIds: a.tags.map(t => t.id), selectedTags: a.tags,
      nextStep: a.nextStep ?? "", date: format(activityDay(a.date), "yyyy-MM-dd"),
      frontDesk: a.frontDesk ?? "", flyer: a.flyer ?? "", notes: a.notes ?? "",
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

  function setSelectedTags(tags: TagObj[]) {
    // Merge any new tags into registry
    setTagRegistry(prev => {
      const ids = new Set(prev.map(t => t.id))
      const newOnes = tags.filter(t => !ids.has(t.id))
      return newOnes.length ? [...prev, ...newOnes] : prev
    })
    setForm(prev => ({ ...prev, selectedTags: tags, tagIds: tags.map(t => t.id) }))
  }

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const payload = {
        practiceId: form.practiceId || undefined,
        locationId: form.locationId || undefined,
        providerIds: form.providerIds,
        tagIds: form.tagIds,
        nextStep: form.nextStep || undefined,
        date: form.date,
        frontDesk: form.frontDesk || undefined,
        flyer: form.flyer || undefined,
        notes: form.notes || undefined,
      }
      const result = editId ? await updateActivity(editId, payload) : await createActivity(payload)
      if (result.error) {
        setError(typeof result.error === "string" ? result.error : "Error saving activity.")
      } else {
        setOpen(false)
      }
    })
  }

  function toggleTagFilter(id: string) {
    setActiveTagIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
  }

  function applyView(view: SavedView) {
    const f = view.filters
    setSearch(f.search ?? "")
    setDateFrom(f.dateFrom ?? "")
    setDateTo(f.dateTo ?? "")
    setActiveTagIds(f.activeTagIds ?? [])
    setFilterPracticeIds(f.filterPracticeIds ?? [])
    setFilterPracticeMode(f.filterPracticeMode ?? "any")
    setFilterLocationIds(f.filterLocationIds ?? [])
    setFilterLocationMode(f.filterLocationMode ?? "any")
    setFilterProviderIds(f.filterProviderIds ?? [])
    setFilterProviderMode(f.filterProviderMode ?? "any")
    setActiveViewId(view.id)
  }

  function clearView() {
    setSearch(""); setDateFrom(""); setDateTo(""); setActiveTagIds([])
    setFilterPracticeIds([]); setFilterLocationIds([]); setFilterProviderIds([])
    setFilterPracticeMode("any"); setFilterLocationMode("any"); setFilterProviderMode("any")
    setActiveViewId(null)
  }

  async function handleSaveView() {
    if (!newViewName.trim()) return
    setSavingView(true)
    const filters = {
      search, dateFrom, dateTo, activeTagIds,
      filterPracticeIds, filterPracticeMode,
      filterLocationIds, filterLocationMode,
      filterProviderIds, filterProviderMode,
    }
    const res = await createActivityView(newViewName.trim(), filters, newViewAccess) as any
    if (res?.success) {
      const newView: SavedView = {
        id: res.id, name: newViewName.trim(), filters,
        visibility: newViewAccess.visibility, teamId: newViewAccess.teamId,
        sharedUserIds: newViewAccess.sharedUserIds, isOwner: true,
      }
      setSavedViews(prev => [...prev, newView])
      setActiveViewId(res.id)
    }
    setNewViewName("")
    setNewViewAccess({ visibility: "PRIVATE", teamId: null, sharedUserIds: [] })
    setShowSaveForm(false)
    setSavingView(false)
  }

  // Current filter state, for comparison + saving
  const currentFilters = {
    search, dateFrom, dateTo, activeTagIds,
    filterPracticeIds, filterPracticeMode,
    filterLocationIds, filterLocationMode,
    filterProviderIds, filterProviderMode,
  }

  const editAccessView = savedViews.find(v => v.id === editAccessId) ?? null

  const activeView = savedViews.find(v => v.id === activeViewId)
  const sameSet = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every(x => b.includes(x))
  const viewDirty = !!activeView && activeView.isOwner !== false && (
    activeView.filters.search !== search ||
    activeView.filters.dateFrom !== dateFrom ||
    activeView.filters.dateTo !== dateTo ||
    activeView.filters.filterPracticeMode !== filterPracticeMode ||
    activeView.filters.filterLocationMode !== filterLocationMode ||
    activeView.filters.filterProviderMode !== filterProviderMode ||
    !sameSet(activeView.filters.activeTagIds, activeTagIds) ||
    !sameSet(activeView.filters.filterPracticeIds, filterPracticeIds) ||
    !sameSet(activeView.filters.filterLocationIds, filterLocationIds) ||
    !sameSet(activeView.filters.filterProviderIds, filterProviderIds)
  )

  async function handleUpdateView() {
    if (!activeView) return
    setSavingView(true)
    const res = await updateActivityView(activeView.id, currentFilters) as any
    if (res?.success) {
      setSavedViews(prev => prev.map(v => v.id === activeView.id ? { ...v, filters: currentFilters } : v))
    }
    setSavingView(false)
  }

  function openEditAccess(view: SavedView) {
    setShowSaveForm(false)
    setEditAccessValue({
      visibility: view.visibility ?? "PRIVATE",
      teamId: view.teamId ?? null,
      sharedUserIds: view.sharedUserIds ?? [],
    })
    setEditAccessId(prev => prev === view.id ? null : view.id)
  }

  async function handleSaveAccess(view: SavedView) {
    setSavingAccess(true)
    const res = await updateActivityView(view.id, view.filters, editAccessValue) as any
    if (res?.success) {
      setSavedViews(prev => prev.map(v => v.id === view.id ? {
        ...v,
        visibility: editAccessValue.visibility,
        teamId: editAccessValue.teamId,
        sharedUserIds: editAccessValue.sharedUserIds,
      } : v))
    }
    setSavingAccess(false)
    setEditAccessId(null)
  }

  async function handleDeleteView(id: string) {
    await deleteActivityView(id)
    setSavedViews(prev => prev.filter(v => v.id !== id))
    if (activeViewId === id) clearView()
  }

  // Unique filter options derived from activities
  const filterPracticeOptions = useMemo(() => {
    const map = new Map<string, string>()
    activities.forEach(a => { if (a.practice) map.set(a.practice.id, a.practice.name) })
    return Array.from(map.entries()).map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [activities])

  const filterLocationOptions = useMemo(() => {
    const map = new Map<string, string>()
    activities.forEach(a => { if (a.location) map.set(a.location.id, a.location.name) })
    return Array.from(map.entries()).map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [activities])

  const filterProviderOptions = useMemo(() => {
    const map = new Map<string, string>()
    activities.forEach(a => a.providers.forEach(p => map.set(p.doctor.id, p.doctor.name + (p.doctor.title ? `, ${p.doctor.title}` : ""))))
    return Array.from(map.entries()).map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [activities])

  const filtered = useMemo(() => {
    return activities.filter(a => {
      const q = search.toLowerCase()
      if (q && !(
        a.practice?.name.toLowerCase().includes(q) ||
        a.location?.name.toLowerCase().includes(q) ||
        a.providers.some(p => p.doctor.name.toLowerCase().includes(q)) ||
        a.notes?.toLowerCase().includes(q) ||
        a.nextStep?.toLowerCase().includes(q) ||
        a.tags.some(t => t.name.toLowerCase().includes(q))
      )) return false
      if (dateFrom && activityDay(a.date) < new Date(dateFrom + "T00:00:00")) return false
      if (dateTo && activityDay(a.date) > new Date(dateTo + "T23:59:59")) return false
      if (activeTagIds.length > 0 && !activeTagIds.every(id => a.tags.some(t => t.id === id))) return false
      if (filterPracticeIds.length > 0) {
        const match = a.practice ? filterPracticeIds.includes(a.practice.id) : false
        if (filterPracticeMode === "any" ? !match : match) return false
      }
      if (filterLocationIds.length > 0) {
        const match = a.location ? filterLocationIds.includes(a.location.id) : false
        if (filterLocationMode === "any" ? !match : match) return false
      }
      if (filterProviderIds.length > 0) {
        const match = a.providers.some(p => filterProviderIds.includes(p.doctor.id))
        if (filterProviderMode === "any" ? !match : match) return false
      }
      return true
    })
  }, [activities, search, dateFrom, dateTo, activeTagIds,
      filterPracticeIds, filterPracticeMode, filterLocationIds, filterLocationMode,
      filterProviderIds, filterProviderMode])

  const hasFilters = search || dateFrom || dateTo || activeTagIds.length > 0 ||
    filterPracticeIds.length > 0 || filterLocationIds.length > 0 || filterProviderIds.length > 0

  // Build CSV data (headers + rows) for the currently filtered activities.
  function buildExportData() {
    const headers = ["Date", "Account", "Location", "Providers", "Activity Type", "Next Step", "Front Desk", "Tags", "Notes", "Logged By"]
    const rows = filtered.map(a => [
      format(activityDay(a.date), "yyyy-MM-dd"),
      a.practice?.name ?? "",
      a.location?.name ?? "",
      a.providers.map(p => p.doctor.name + (p.doctor.title ? `, ${p.doctor.title}` : "")).join("; "),
      a.flyer ?? "",
      a.nextStep ?? "",
      a.frontDesk ?? "",
      a.tags.map(t => t.name).join("; "),
      (a.notes ?? "").replace(/\s+/g, " ").trim(),
      a.createdBy.name ?? a.createdBy.email,
    ])
    return { headers, rows }
  }

  // Sorted rows for the table view.
  const sorted = useMemo(() => {
    const rows = [...filtered]
    rows.sort((a, b) => {
      let cmp = 0
      if (sortKey === "date") cmp = activityDay(a.date).getTime() - activityDay(b.date).getTime()
      else cmp = (a.practice?.name ?? "").localeCompare(b.practice?.name ?? "")
      return sortDir === "asc" ? cmp : -cmp
    })
    return rows
  }, [filtered, sortKey, sortDir])

  const cols = ACTIVITY_COLUMNS.filter(c => visibleCols.includes(c.key))
  const toggleCol = (key: string) =>
    setVisibleCols(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  const toggleSort = (key: "date" | "account") => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("desc") }
  }

  const allSelected = sorted.length > 0 && sorted.every(a => selectedIds.has(a.id))
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(sorted.map(a => a.id)))
  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  function bulkDelete() {
    const ids = Array.from(selectedIds)
    if (!ids.length || !confirm(`Delete ${ids.length} activit${ids.length === 1 ? "y" : "ies"}? This cannot be undone.`)) return
    startTransition(async () => {
      for (const id of ids) await deleteActivity(id)
      setSelectedIds(new Set())
    })
  }

  // Email report: reports on the selected rows, or the whole filtered view.
  const reportScoped = selectedIds.size > 0
  const reportIds = reportScoped ? Array.from(selectedIds) : filtered.map((a) => a.id)
  const reportRecipients = reportTo.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)
  function addTeammate(email: string) {
    if (!email) return
    const have = new Set(reportRecipients.map((e) => e.toLowerCase()))
    if (!have.has(email.toLowerCase())) setReportTo((prev) => (prev.trim() ? `${prev.replace(/[,\s]+$/, "")}, ${email}` : email))
  }
  function sendReport() {
    if (reportRecipients.length === 0 || reportIds.length === 0) return
    startReport(async () => {
      const res = await emailActivityReport({ activityIds: reportIds, to: reportRecipients, subject: reportSubject || undefined, message: reportMessage || undefined }) as any
      if (res?.error) { showToast(res.error); return }
      setReportOpen(false); setReportTo(""); setReportSubject(""); setReportMessage("")
      showToast(`Report sent to ${res.recipients} recipient${res.recipients === 1 ? "" : "s"}`)
    })
  }

  // One table cell's content for the given column.
  function renderCell(a: typeof filtered[number], key: string): React.ReactNode {
    switch (key) {
      case "date": return <span className="whitespace-nowrap text-zinc-600">{format(activityDay(a.date), "MMM d, yyyy")}</span>
      case "account": return <span className="font-medium text-zinc-800">{a.practice?.name ?? "—"}</span>
      case "location": return <span className="text-zinc-500">{a.location?.name ?? "—"}</span>
      case "providers": return <span className="text-zinc-600">{a.providers.length ? a.providers.map(p => p.doctor.name + (p.doctor.title ? `, ${p.doctor.title}` : "")).join(", ") : "—"}</span>
      case "type": {
        const t = ACTIVITY_TYPES.find(x => x.value === a.flyer)
        return a.flyer
          ? <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${t ? `${t.bg} ${t.color} ${t.border}` : "bg-zinc-100 text-zinc-600 border-zinc-200"}`}>{a.flyer}</span>
          : <span className="text-zinc-400">—</span>
      }
      case "nextStep": return <span className="text-zinc-500">{a.nextStep || "—"}</span>
      case "frontDesk": return <span className="text-zinc-500">{a.frontDesk || "—"}</span>
      case "tags": return <span className="text-zinc-500">{a.tags.length ? a.tags.map(tg => tg.name).join(", ") : "—"}</span>
      case "notes": return <span className="text-zinc-500">{a.notes ? a.notes.replace(/\s+/g, " ").trim() : "—"}</span>
      case "loggedBy": return <span className="whitespace-nowrap text-zinc-500">{a.createdBy.name ?? a.createdBy.email}</span>
      default: return null
    }
  }

  return (
    <>
      {/* ── Views bar ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={clearView}
          className={`h-8 px-3 rounded-lg text-sm font-medium border transition-all ${
            !activeViewId ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"
          }`}
        >
          All
        </button>
        {savedViews.map(view => (
          <div key={view.id} className={`inline-flex items-center gap-1 h-8 rounded-lg border text-sm font-medium transition-all overflow-hidden ${
            activeViewId === view.id ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"
          }`}>
            <button className={`pl-3 h-full ${view.isOwner === false ? "pr-3" : "pr-1.5"}`} onClick={() => applyView(view)}>
              {view.name}
              {view.isOwner === false && view.visibility && view.visibility !== "PRIVATE" && (
                <span className="ml-1.5 opacity-60" title={view.visibility === "EVERYONE" ? "Shared with everyone" : view.visibility === "TEAM" ? "Shared with team" : "Shared with specific people"}>
                  {view.visibility === "EVERYONE" ? <Globe className="inline h-3 w-3" /> : view.visibility === "TEAM" ? <Users className="inline h-3 w-3" /> : <UserCog className="inline h-3 w-3" />}
                </span>
              )}
            </button>
            {view.isOwner !== false && (
              <button
                onClick={() => handleDeleteView(view.id)}
                title="Delete view"
                className={`pr-2 pl-0.5 h-full transition-colors ${activeViewId === view.id ? "hover:text-zinc-300" : "hover:text-red-500"}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        <div className="relative">
          <button
            onClick={() => { setShowSaveForm(v => !v); setEditAccessId(null) }}
            className="h-8 px-3 rounded-lg text-sm border border-dashed border-zinc-300 text-zinc-400 hover:border-zinc-500 hover:text-zinc-600 transition-all flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> Save view
          </button>
          {showSaveForm && (
            <div className="absolute left-0 top-full mt-2 z-50 w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-3 space-y-3">
              <input
                autoFocus
                value={newViewName}
                onChange={e => setNewViewName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSaveView(); if (e.key === "Escape") setShowSaveForm(false) }}
                placeholder="View name..."
                className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg outline-none focus:border-slate-400"
              />
              <ViewAccessSelector value={newViewAccess} onChange={setNewViewAccess} users={shareUsers} teams={shareTeams} />
              <div className="flex gap-2 pt-1">
                <button onClick={handleSaveView} disabled={savingView || !newViewName.trim()}
                  className="flex-1 h-9 text-sm bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50 flex items-center justify-center gap-1.5">
                  {savingView ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Save view
                </button>
                <button onClick={() => { setShowSaveForm(false); setNewViewName("") }}
                  className="h-9 px-3 text-sm text-zinc-500 hover:text-zinc-800 border border-zinc-200 rounded-lg">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right-side controls: view toggle + export + save-changes + access */}
        <div className="ml-auto flex items-center gap-2">
          {/* Card / Table view toggle */}
          <div className="inline-flex items-center rounded-lg border border-zinc-200 bg-white p-0.5">
            <button
              onClick={() => setViewMode("cards")}
              title="Card view"
              className={`inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors ${
                viewMode === "cards" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              <LayoutList className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              title="Table view"
              className={`inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors ${
                viewMode === "table" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              <Table2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Column selector (table view only) */}
          {viewMode === "table" && (
            <div className="relative" ref={colMenuRef}>
              <button
                onClick={() => setColMenuOpen(v => !v)}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-600 hover:border-zinc-400 transition-colors"
              >
                <Columns3 className="h-3.5 w-3.5" /> Columns
                <ChevronDown className="h-3 w-3 opacity-50" />
              </button>
              {colMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-50 w-52 bg-white border border-zinc-200 rounded-xl shadow-xl overflow-hidden py-1">
                  {ACTIVITY_COLUMNS.map(col => (
                    <button key={col.key} onClick={() => toggleCol(col.key)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-zinc-50 transition-colors text-left">
                      <span className={cn("shrink-0 w-[14px] h-[14px] rounded border flex items-center justify-center transition-all", visibleCols.includes(col.key) ? "bg-zinc-900 border-zinc-900" : "border-zinc-300")}>
                        {visibleCols.includes(col.key) && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                      </span>
                      <span className="text-zinc-700">{col.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Email report */}
          <button
            onClick={() => setReportOpen(true)}
            disabled={filtered.length === 0}
            title="Email a report of the selected activities (or the current view)"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-600 hover:border-zinc-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Mail className="h-3.5 w-3.5" /> Email report
          </button>

          {/* Export to CSV */}
          <button
            onClick={() => setExportOpen(true)}
            disabled={filtered.length === 0}
            title="Export current view to CSV"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-600 hover:border-zinc-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="h-3.5 w-3.5" /> Export
          </button>

          {/* Save-changes button — grayed when no unsaved changes */}
          <button
            onClick={handleUpdateView}
            disabled={!viewDirty || savingView}
            title={viewDirty ? "Save changes to current view" : "No unsaved changes"}
            className={`inline-flex items-center justify-center h-8 w-8 rounded-lg border transition-colors ${
              viewDirty
                ? "border-amber-300 bg-amber-50 text-amber-600 hover:bg-amber-100"
                : "border-zinc-200 bg-white text-zinc-300 cursor-not-allowed"
            }`}
          >
            {savingView ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          </button>
          {/* Access — manage who can see the active view */}
          <div className="relative">
            <button
              onClick={() => { if (activeView && activeView.isOwner !== false) openEditAccess(activeView) }}
              disabled={!activeView || activeView.isOwner === false}
              title={activeView ? (activeView.isOwner === false ? "You can't change access for a view you don't own" : "Manage who can see this view") : "Select a view to manage access"}
              className={`inline-flex items-center justify-center h-8 w-8 rounded-lg border transition-colors ${
                editAccessId
                  ? "border-amber-300 bg-amber-50 text-amber-600"
                  : activeView && activeView.isOwner !== false
                  ? "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400"
                  : "border-zinc-200 bg-white text-zinc-300 cursor-not-allowed"
              }`}
            >
              {activeView?.visibility === "EVERYONE" ? <Globe className="h-3.5 w-3.5" /> : activeView?.visibility === "TEAM" ? <Users className="h-3.5 w-3.5" /> : activeView?.visibility === "CUSTOM" ? <UserCog className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            </button>
            {editAccessView && (
              <div className="absolute right-0 top-full mt-2 z-50 w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-3 space-y-3">
                <p className="text-xs text-slate-500">Editing access for <span className="font-semibold text-slate-700">{editAccessView.name}</span></p>
                <ViewAccessSelector value={editAccessValue} onChange={setEditAccessValue} users={shareUsers} teams={shareTeams} />
                <div className="flex gap-2 pt-1">
                  <button onClick={() => handleSaveAccess(editAccessView)} disabled={savingAccess}
                    className="flex-1 h-9 text-sm bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50 flex items-center justify-center gap-1.5">
                    {savingAccess ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Save access
                  </button>
                  <button onClick={() => setEditAccessId(null)}
                    className="h-9 px-3 text-sm text-zinc-500 hover:text-zinc-800 border border-zinc-200 rounded-lg">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search activities..." className="pl-9" />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-slate-500 whitespace-nowrap">From</label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36 text-sm" />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-slate-500 whitespace-nowrap">To</label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36 text-sm" />
          </div>
          <FilterDropdown
            label="Practice"
            options={filterPracticeOptions}
            selected={filterPracticeIds}
            onToggle={id => setFilterPracticeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
            onClear={() => setFilterPracticeIds([])}
            mode={filterPracticeMode}
            onModeChange={setFilterPracticeMode}
          />
          <FilterDropdown
            label="Location"
            options={filterLocationOptions}
            selected={filterLocationIds}
            onToggle={id => setFilterLocationIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
            onClear={() => setFilterLocationIds([])}
            mode={filterLocationMode}
            onModeChange={setFilterLocationMode}
          />
          <FilterDropdown
            label="Provider"
            options={filterProviderOptions}
            selected={filterProviderIds}
            onToggle={id => setFilterProviderIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
            onClear={() => setFilterProviderIds([])}
            mode={filterProviderMode}
            onModeChange={setFilterProviderMode}
          />
          {hasFilters && (
            <button onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); setActiveTagIds([]); setFilterPracticeIds([]); setFilterLocationIds([]); setFilterProviderIds([]) }}
              className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-slate-100">
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}
          {canManage && (
            <Button onClick={openNew} className="ml-auto">
              <Plus className="h-4 w-4 mr-2" />New Activity
            </Button>
          )}
        </div>

        {/* Tag filter chips */}
        {tagRegistry.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-400 flex items-center gap-1 shrink-0">
              <Tag className="h-3 w-3" /> Filter:
            </span>
            {tagRegistry.map(tag => (
              <TagChip
                key={tag.id} tag={tag}
                onClick={() => toggleTagFilter(tag.id)}
                active={activeTagIds.includes(tag.id)}
                onColorChange={() => {}}
              />
            ))}
          </div>
        )}

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
      ) : viewMode === "table" ? (
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 bg-zinc-900 text-white text-sm">
              <span className="font-medium">{selectedIds.size} selected</span>
              <button onClick={() => setReportOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 transition-colors">
                <Mail className="h-3.5 w-3.5" /> Email report
              </button>
              <button onClick={bulkDelete} disabled={isPending}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 transition-colors">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-zinc-300 hover:text-white">Clear</button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                  <th className="px-4 py-2.5 w-10">
                    <button onClick={toggleSelectAll}
                      className={cn("w-[15px] h-[15px] rounded border flex items-center justify-center align-middle", allSelected ? "bg-zinc-900 border-zinc-900" : "border-zinc-300 hover:border-zinc-400")}>
                      {allSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                    </button>
                  </th>
                  {cols.map(col => (
                    <th key={col.key} className="px-4 py-2.5">
                      {col.sortable ? (
                        <button onClick={() => toggleSort(col.key as "date" | "account")} className="inline-flex items-center gap-1 hover:text-zinc-800">
                          {col.label}
                          {sortKey === col.key && (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                        </button>
                      ) : col.label}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {sorted.map(a => (
                  <tr key={a.id} className={cn("hover:bg-zinc-50 transition-colors align-top", selectedIds.has(a.id) && "bg-blue-50/40")}>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleSelect(a.id)}
                        className={cn("w-[15px] h-[15px] rounded border flex items-center justify-center", selectedIds.has(a.id) ? "bg-zinc-900 border-zinc-900" : "border-zinc-300 hover:border-zinc-400")}>
                        {selectedIds.has(a.id) && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                      </button>
                    </td>
                    {cols.map(col => (
                      <td key={col.key} className="px-4 py-3 max-w-[240px] truncate">{renderCell(a, col.key)}</td>
                    ))}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex gap-0.5">
                        <button onClick={() => openEdit(a)} className="p-1.5 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setDeleteId(a.id)} className="p-1.5 rounded hover:bg-red-50 text-zinc-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(a => (
            <div key={a.id} className="flex items-start gap-4 p-4 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors">
              <div className="shrink-0 w-16 text-center">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">{format(activityDay(a.date), "MMM")}</p>
                <p className="text-2xl font-bold text-slate-800 leading-none">{format(activityDay(a.date), "d")}</p>
                <p className="text-xs text-slate-400">{format(activityDay(a.date), "yyyy")}</p>
              </div>

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
                  {a.flyer && (() => {
                    const t = ACTIVITY_TYPES.find(x => x.value === a.flyer)
                    return t
                      ? <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${t.bg} ${t.color} ${t.border}`}>{t.value}</span>
                      : <span><span className="font-medium text-slate-600">Type:</span> {a.flyer}</span>
                  })()}
                </div>

                {a.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {a.tags.map(tag => (
                      <TagChip
                        key={tag.id} tag={tag}
                        onClick={() => toggleTagFilter(tag.id)}
                        active={activeTagIds.includes(tag.id)}
                        onColorChange={() => {}}
                      />
                    ))}
                  </div>
                )}

                {a.notes && <ExpandableNotes text={a.notes} />}
                <p className="text-xs text-slate-400">Logged by {a.createdBy.name ?? a.createdBy.email}</p>
              </div>

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
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Activity" : "New Activity"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Account <span className="text-slate-400 font-normal">(Organization)</span></label>
              <Picker placeholder="Search Account..." value={form.practiceId} options={practiceOptions}
                onSelect={id => set("practiceId", id)} onClear={() => set("practiceId", "")}
                onQuickCreate={handleCreateOrg} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Clinic Location</label>
              <Picker placeholder="Search Locations..." value={form.locationId} options={locationOptions}
                onSelect={handleLocationSelect} onClear={() => set("locationId", "")}
                onQuickCreate={form.practiceId ? handleCreateLocation : undefined} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Providers</label>
              <ProviderPicker options={doctorOptions} selected={form.providerIds}
                onToggle={id => set("providerIds", form.providerIds.includes(id)
                  ? form.providerIds.filter(x => x !== id) : [...form.providerIds, id]
                )}
                onOpenCreateForm={form.practiceId ? handleOpenCreateProvider : undefined} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Selected Providers</label>
              <div className="min-h-[60px] border border-slate-200 rounded-md bg-slate-50 px-3 py-2 flex flex-wrap gap-1.5 content-start">
                {form.providerIds.length === 0
                  ? <p className="text-xs text-slate-400 self-center">None selected</p>
                  : form.providerIds.map(id => {
                    const d = combinedDoctors.find(x => x.id === id)
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

            {/* Provider Details Card */}
            {form.providerIds.length > 0 && (
              <div className="col-span-2">
                <SelectedProvidersCard
                  selectedDoctors={form.providerIds
                    .map(id => combinedDoctors.find(d => d.id === id))
                    .filter((d): d is typeof combinedDoctors[0] => !!d)
                  }
                />
              </div>
            )}
            {createProviderModal.open && (
              <div className="col-span-2">
                <InlineCreateProvider
                  initialName={createProviderModal.initialName}
                  practiceId={form.practiceId}
                  locations={allPractices.find(p => p.id === form.practiceId)?.locations ?? []}
                  onCancel={() => setCreateProviderModal({ open: false, initialName: "" })}
                  onCreate={handleProviderCreated}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Next Step</label>
              <Input value={form.nextStep} onChange={e => set("nextStep", e.target.value)} placeholder="e.g. Follow up in 2 weeks" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Date</label>
              <Input type="date" value={form.date} onChange={e => set("date", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Activity Type</label>
              <div className="flex flex-wrap gap-2">
                {ACTIVITY_TYPES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => set("flyer", form.flyer === t.value ? "" : t.value)}
                    className={`h-9 px-3.5 rounded-lg border text-sm font-medium whitespace-nowrap transition-all ${
                      form.flyer === t.value
                        ? `${t.bg} ${t.color} ${t.border}`
                        : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    {t.value}
                  </button>
                ))}
              </div>
            </div>

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

      {/* ── Export dialog ── */}
      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        subject="activities"
        defaultName={`activities-${format(new Date(), "yyyy-MM-dd")}`}
        getData={buildExportData}
      />

      {/* ── Email report dialog ── */}
      <Dialog open={reportOpen} onOpenChange={v => !v && setReportOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Email activity report</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-sm bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-slate-600">
              Reporting on <span className="font-semibold text-slate-900">{reportIds.length}</span> {reportScoped ? "selected " : ""}activit{reportIds.length === 1 ? "y" : "ies"}
              {!reportScoped && <span className="text-slate-400"> (current view — select rows to narrow it down)</span>}
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Recipients</label>
              <Input value={reportTo} onChange={e => setReportTo(e.target.value)} placeholder="name@example.com, another@example.com" />
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="text-xs text-slate-400">Add teammate:</span>
                <StyledSelect value="" onChange={e => { addTeammate(e.target.value); }} className="min-w-[180px] text-sm">
                  <option value="">Choose…</option>
                  {shareUsers.map(u => <option key={u.id} value={u.email}>{u.name || u.email}</option>)}
                </StyledSelect>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Subject</label>
              <Input value={reportSubject} onChange={e => setReportSubject(e.target.value)} placeholder={`Activity Report — ${reportIds.length} activit${reportIds.length === 1 ? "y" : "ies"}`} />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Message <span className="text-slate-400 font-normal">(optional)</span></label>
              <Textarea rows={3} value={reportMessage} onChange={e => setReportMessage(e.target.value)} placeholder="A short note to include at the top of the report…" />
            </div>
            <p className="text-xs text-slate-400">Sends from your own email address. The report includes a summary plus each activity's details.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportOpen(false)}>Cancel</Button>
            <Button disabled={reportPending || reportRecipients.length === 0 || reportIds.length === 0} onClick={sendReport}>
              {reportPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />} Send report
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
