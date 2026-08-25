"use client"

import { useState, useTransition, useMemo, useRef, useEffect } from "react"
import { createActivity, updateActivity, deleteActivity } from "@/app/actions/activities"
import { createTask } from "@/app/actions/tasks"
import { TaskType, TaskPriority } from "@prisma/client"
import DatePicker from "@/components/ui/date-picker"
import StyledSelect from "@/components/ui/styled-select"
import { TASK_TYPES, PRIORITY_LABELS, REMINDER_OPTIONS } from "@/lib/task-meta"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import { createActivityView, updateActivityView, deleteActivityView } from "@/app/actions/activity-views"
import { reorderViews } from "@/app/actions/view-order"
import { useCardReorder } from "@/components/use-card-reorder"
import ColumnChooserModal from "@/components/ui/column-chooser"
import { associationColumns, readAssocValue, type AssociationGroup } from "@/lib/association-columns"
import { frozenMap, frozenHeadStyle, frozenCellStyle, frozenClass } from "@/lib/frozen-columns"
import { OptionValue } from "@/components/option-value"
import { formatNumber } from "@/lib/number-format"
import { EditableCell } from "@/components/ui/editable-cell"
import { cpToFieldDef } from "@/lib/cp-field-def"
import { updateRecordField } from "@/app/actions/record-fields"
import { setRecordOwner } from "@/app/actions/record-owner"
import { type RecordFieldDef } from "@/lib/record-field-catalog"
import { ViewAccessSelector, type Visibility, type ViewAccessValue, type ShareUser, type ShareTeam } from "@/components/view-access-selector"
import { upsertActivityTag, updateTagColor } from "@/app/actions/tags"
import { emailActivityReport } from "@/app/actions/activity-report"
import { ACTIVITY_RATINGS, MEETING_RATINGS } from "@/lib/activity-ratings"
import { fmtActivityWhen, fmtActivityTime, activityLocalDate, hasActivityTime } from "@/lib/activity-time"
import { OPTION_COLORS, hexToChipStyle } from "@/lib/option-colors"
import { ColorPicker } from "@/components/ui/color-picker"
import { showToast } from "@/components/toast"
import { createPractice, createLocation, createDoctor } from "@/app/actions/referring-doctors"
import SelectedProvidersCard from "@/components/selected-providers-card"
import ExportDialog from "@/components/ui/export-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import ProviderTitleField from "@/components/provider-title-field"
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
import BulkActionBar, { bulkBtn, bulkDanger } from "@/components/ui/bulk-action-bar"
import { useColumnResize, ColResizer } from "@/components/ui/use-column-resize"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

// ─── Searchable teammate picker (email activity report) ─────────────────────────
// Same searchable dropdown pattern as the filter builder: a search box + a list
// that scrolls inside its own container (no more portal-scroll weirdness).
function TeammatePicker({ users, selected, onAdd }: {
  users: { id: string; name?: string | null; email: string }[]
  selected: string[]
  onAdd: (email: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])
  const ql = q.toLowerCase().trim()
  const chosen = new Set(selected.map((e) => e.toLowerCase()))
  const filtered = users.filter((u) => {
    if (chosen.has(u.email.toLowerCase())) return false
    if (!ql) return true
    return (u.name ?? "").toLowerCase().includes(ql) || u.email.toLowerCase().includes(ql)
  })
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:border-slate-300">
        <Plus className="h-3.5 w-3.5" /> Add teammate <ChevronDown className="h-3 w-3 text-slate-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-50 w-72 max-h-72 overflow-hidden bg-white border border-slate-200 rounded-xl shadow-xl flex flex-col">
          <div className="relative border-b border-slate-100 p-1.5">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search teammates…"
              className="w-full pl-7 pr-2 py-1.5 text-sm rounded-md focus:outline-none" />
          </div>
          <div className="overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-400">{ql ? "No matches" : "Everyone's already added"}</p>
            ) : filtered.map((u) => (
              <button key={u.id} type="button" onClick={() => { onAdd(u.email); setQ("") }}
                className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50">
                <p className="text-sm text-slate-700 truncate">{u.name || u.email}</p>
                {u.name && <p className="text-xs text-slate-400 truncate">{u.email}</p>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

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
  rating: number | null
  meetingRating: number | null
  customProperties?: Record<string, any> | null
  ownerId?: string | null
  owner?: { id: string; name: string | null; email: string } | null
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
    columns?: string[]
    frozen?: number
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
  currentUserName?: string
  assignableUsers?: { id: string; label: string }[]
  savedViews: SavedView[]
  shareUsers: ShareUser[]
  shareTeams: ShareTeam[]
  customProps?: { id: string; name: string; type: string; optionLabels?: Record<string, string> | null; optionColors?: Record<string, string> | null; optionStyle?: string | null; numberFormat?: string | null }[]
}

// ─── Color palette ────────────────────────────────────────────────────────────

// Color palette + picker are shared (lib/option-colors, components/ui/color-picker).
const COLOR_OPTIONS = OPTION_COLORS

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


function InlineCreateProvider({ initialName, practiceId, locations, onCancel, onCreate }: {
  initialName: string
  practiceId: string
  locations: { id: string; name: string }[]
  onCancel: () => void
  onCreate: (provider: { id: string; label: string; name: string; title: string | null }) => void
}) {
  const [name, setName] = useState(initialName)
  const [title, setTitle] = useState("")
  const [npi, setNpi] = useState("")
  const [phone, setPhone] = useState("")
  const [officePhone, setOfficePhone] = useState("")
  const [email, setEmail] = useState("")
  const [locationIds, setLocationIds] = useState<string[]>([])
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState("")

  const finalTitle = title.trim()

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
          <ProviderTitleField value={title} onChange={setTitle} placeholder="— None —" />
        </div>
        <div>
          <label className={labelCls}>NPI</label>
          <input value={npi} onChange={e => setNpi(e.target.value)} className={inputCls} placeholder="1234567890" maxLength={10} />
        </div>
        <div>
          <label className={labelCls}>Cell Phone</label>
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
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border transition-colors ${locationIds.includes(l.id) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"}`}>
                {locationIds.includes(l.id) && <Check className="h-2.5 w-2.5" />}
                {l.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={handleSubmit as any} disabled={isPending}
          className="flex-1 h-8 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
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
            ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
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
              className={`flex-1 h-7 text-xs rounded-md font-medium transition-colors ${!isExclude ? "bg-blue-600 text-white" : "text-zinc-500 hover:bg-zinc-50"}`}>
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
                    ? isExclude ? "bg-rose-600 border-rose-600" : "bg-blue-600 border-blue-600"
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
    nextStep: "", date: new Date().toISOString(),
    frontDesk: "", flyer: "", notes: "", rating: "", meetingRating: "",
  }
}

// The optional follow-up task drafted on step 2 of the New Activity dialog.
function emptyTaskDraft() {
  return {
    title: "", description: "", dueDate: "", assignedToId: "",
    type: "TODO" as TaskType, priority: "NORMAL" as TaskPriority,
    reminderMinutesBefore: null as number | null,
    skipAssoc: new Set<string>(), // association keys ("PRACTICE:id") the user removed
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
  return activityLocalDate(date)
}

// Table columns for the activities table view.
const ACTIVITY_COLUMNS: { key: string; label: string; sortable?: boolean }[] = [
  { key: "date",      label: "Date",       sortable: true },
  { key: "account",   label: "Account",    sortable: true },
  { key: "location",  label: "Location" },
  { key: "providers", label: "Providers" },
  { key: "type",      label: "Type" },
  { key: "rating",    label: "Rating", sortable: true },
  { key: "nextStep",  label: "Next Step" },
  { key: "frontDesk", label: "Front Desk" },
  { key: "tags",      label: "Tags" },
  { key: "notes",     label: "Notes" },
  { key: "owner",     label: "Owner" },
  { key: "loggedBy",  label: "Logged By" },
]
const DEFAULT_ACTIVITY_COLS = ["date", "account", "location", "providers", "type", "rating", "nextStep", "tags", "loggedBy"]
const ACTIVITY_COL_W: Record<string, number> = { date: 120, account: 200, location: 180, providers: 200, type: 130, rating: 140, nextStep: 200, frontDesk: 160, tags: 180, notes: 240, loggedBy: 150 }

// ─── Main component ───────────────────────────────────────────────────────────

export default function ActivityManager({ activities, practices, allDoctors, allTags, currentUserId, currentUserName, assignableUsers = [], savedViews: initialSavedViews, shareUsers, shareTeams, canManage = true, canCreateTasks = false, customProps = [], associations = [] }: Props & { canManage?: boolean; canCreateTasks?: boolean; associations?: AssociationGroup[] }) {
  const ownerUserMap = Object.fromEntries(assignableUsers.map((u) => [u.id, u.label]))
  // Full catalog = native activity columns + every activity custom property.
  const { columns: assocColumns, byKey: assocByKey } = associationColumns(associations)
  const allActivityCols = [...ACTIVITY_COLUMNS, ...customProps.map((p) => ({ key: `cp_${p.id}`, label: p.name })), ...assocColumns]
  const activityCpById = Object.fromEntries(customProps.map((p) => [p.id, p]))
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  // Two-step "New Activity" dialog: step 2 is an optional follow-up task built
  // from the Next Step text + the selected practice/location/providers.
  const [step, setStep] = useState<1 | 2>(1)
  const [taskDraft, setTaskDraft] = useState(emptyTaskDraft())
  const setTask = <K extends keyof ReturnType<typeof emptyTaskDraft>>(k: K, val: ReturnType<typeof emptyTaskDraft>[K]) => setTaskDraft((p) => ({ ...p, [k]: val }))
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
  const [frozenCount, setFrozenCount] = useState(0)
  const [colModalOpen, setColModalOpen] = useState(false)
  const [sortKey, setSortKey] = useState<string>("date")
  const { colWidth, startResize } = useColumnResize("activityColWidths")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Persist column choice + frozen count per user (loaded after mount).
  useEffect(() => {
    try {
      const c = localStorage.getItem("activityCols"); if (c) { const a = JSON.parse(c); if (Array.isArray(a) && a.length) setVisibleCols(a) }
      const f = localStorage.getItem("activityFrozen"); if (f != null) { const n = Number(f); if (!Number.isNaN(n)) setFrozenCount(n) }
    } catch {}
  }, [])
  useEffect(() => { try { localStorage.setItem("activityCols", JSON.stringify(visibleCols)) } catch {} }, [visibleCols])
  useEffect(() => { try { localStorage.setItem("activityFrozen", String(frozenCount)) } catch {} }, [frozenCount])

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
  // Drag to reorder the view tabs (per-user order, persisted).
  const viewReorder = useCardReorder(savedViews, (v) => v.id, (ids) => startTransition(() => { reorderViews("ACTIVITY", "", ids) }))
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
    setForm(emptyForm()); setEditId(null); setError(null); setStep(1); setTaskDraft(emptyTaskDraft()); setOpen(true)
  }

  function openEdit(a: ActivityRow) {
    setForm({
      practiceId: a.practice?.id ?? "", locationId: a.location?.id ?? "",
      providerIds: a.providers.map(p => p.doctor.id),
      tagIds: a.tags.map(t => t.id), selectedTags: a.tags,
      nextStep: a.nextStep ?? "", date: typeof a.date === "string" ? a.date : new Date(a.date).toISOString(),
      frontDesk: a.frontDesk ?? "", flyer: a.flyer ?? "", notes: a.notes ?? "",
      rating: a.rating != null ? String(a.rating) : "",
      meetingRating: a.meetingRating != null ? String(a.meetingRating) : "",
    })
    setEditId(a.id); setError(null); setStep(1); setOpen(true)
  }

  // Association {type,id,label} list built from the activity's practice/location/providers.
  const followupAssocs = (): { key: string; type: string; id: string; label: string }[] => {
    const out: { key: string; type: string; id: string; label: string }[] = []
    if (form.practiceId) out.push({ key: `PRACTICE:${form.practiceId}`, type: "PRACTICE", id: form.practiceId, label: practiceOptions.find(p => p.id === form.practiceId)?.label ?? "Practice" })
    if (form.locationId) out.push({ key: `LOCATION:${form.locationId}`, type: "LOCATION", id: form.locationId, label: locationOptions.find(l => l.id === form.locationId)?.label ?? "Location" })
    for (const id of form.providerIds) {
      const d = combinedDoctors.find(x => x.id === id)
      out.push({ key: `PROVIDER:${id}`, type: "PROVIDER", id, label: d ? `${d.name}${d.title ? `, ${d.title}` : ""}` : "Provider" })
    }
    return out
  }

  // Whether the follow-up task step is offered (new activity + Next Step text + can create tasks).
  const followupAvailable = !editId && canCreateTasks && form.nextStep.trim().length > 0

  function goToTaskStep() {
    setTaskDraft({
      ...emptyTaskDraft(),
      title: form.nextStep.trim(),
      description: form.nextStep.trim(),
      assignedToId: currentUserId,
    })
    setStep(2)
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

  function handleSubmit(withTask = false) {
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
        rating: form.rating ? Number(form.rating) : null,
        meetingRating: form.meetingRating ? Number(form.meetingRating) : null,
      }
      const result = editId ? await updateActivity(editId, payload) : await createActivity(payload)
      if (result.error) {
        setError(typeof result.error === "string" ? result.error : "Error saving activity.")
        return
      }
      // Optional follow-up task from the Next Step. The activity is already saved,
      // so a task failure is non-fatal — surface it but don't discard the activity.
      if (withTask) {
        const associations = followupAssocs().filter(a => !taskDraft.skipAssoc.has(a.key)).map(a => ({ type: a.type, id: a.id }))
        const tr = await createTask({
          title: taskDraft.title.trim() || form.nextStep.trim(),
          description: taskDraft.description || undefined,
          dueDate: taskDraft.dueDate || undefined,
          assignedToId: taskDraft.assignedToId || undefined,
          type: taskDraft.type, priority: taskDraft.priority,
          reminderMinutesBefore: taskDraft.reminderMinutesBefore,
          associations,
        })
        if ((tr as any)?.error) {
          setError("Activity saved, but the follow-up task couldn't be created. You can add it from the Tasks page.")
          return
        }
        showToast("Activity logged and follow-up task created")
      }
      setOpen(false)
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
    if (f.columns) setVisibleCols(f.columns)
    if (typeof f.frozen === "number") setFrozenCount(f.frozen)
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
    columns: visibleCols, frozen: frozenCount,
  }

  const editAccessView = savedViews.find(v => v.id === editAccessId) ?? null

  const activeView = savedViews.find(v => v.id === activeViewId)
  const sameSet = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every(x => b.includes(x))
  const viewDirty = !!activeView && (
    activeView.filters.search !== search ||
    activeView.filters.dateFrom !== dateFrom ||
    activeView.filters.dateTo !== dateTo ||
    activeView.filters.filterPracticeMode !== filterPracticeMode ||
    activeView.filters.filterLocationMode !== filterLocationMode ||
    activeView.filters.filterProviderMode !== filterProviderMode ||
    !sameSet(activeView.filters.activeTagIds, activeTagIds) ||
    !sameSet(activeView.filters.filterPracticeIds, filterPracticeIds) ||
    !sameSet(activeView.filters.filterLocationIds, filterLocationIds) ||
    !sameSet(activeView.filters.filterProviderIds, filterProviderIds) ||
    !sameSet(activeView.filters.columns ?? DEFAULT_ACTIVITY_COLS, visibleCols) ||
    (activeView.filters.frozen ?? 0) !== frozenCount
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
  // Export the visible columns (in order) so the CSV matches the table — including
  // custom-property and association columns.
  function cellText(a: ActivityRow, key: string): string {
    if (assocByKey[key]) return readAssocValue(a, assocByKey[key])
    if (key.startsWith("cp_")) { const raw = (a as any).customProperties?.[key.slice(3)]; return raw == null ? "" : Array.isArray(raw) ? raw.join(", ") : String(raw) }
    switch (key) {
      case "date": return format(activityDay(a.date), "yyyy-MM-dd")
      case "account": return a.practice?.name ?? ""
      case "location": return a.location?.name ?? ""
      case "providers": return a.providers.map(p => p.doctor.name + (p.doctor.title ? `, ${p.doctor.title}` : "")).join("; ")
      case "type": return a.flyer ?? ""
      case "rating": return a.rating ? String(a.rating) : ""
      case "nextStep": return a.nextStep ?? ""
      case "frontDesk": return a.frontDesk ?? ""
      case "tags": return a.tags.map(t => t.name).join("; ")
      case "notes": return (a.notes ?? "").replace(/\s+/g, " ").trim()
      case "owner": return (a as any).owner?.name ?? (a as any).owner?.email ?? ""
      case "loggedBy": return a.createdBy.name ?? a.createdBy.email
      default: return ""
    }
  }
  function buildExportData() {
    const headers = cols.map(c => c.label)
    const rows = filtered.map(a => cols.map(c => cellText(a, c.key)))
    return { headers, rows }
  }

  // Sorted rows for the table view.
  // Comparable value per column, so any header can sort.
  const sortVal = (a: ActivityRow, key: string): string | number => {
    switch (key) {
      case "date": return activityDay(a.date).getTime()
      case "account": return a.practice?.name?.toLowerCase() ?? ""
      case "location": return a.location?.name?.toLowerCase() ?? ""
      case "providers": return a.providers.map(p => p.doctor.name).join(", ").toLowerCase()
      case "type": return (a.flyer ?? "").toLowerCase()
      case "rating": return a.rating ?? 0
      case "nextStep": return (a.nextStep ?? "").toLowerCase()
      case "frontDesk": return (a.frontDesk ?? "").toLowerCase()
      case "tags": return a.tags.map(t => t.name).join(", ").toLowerCase()
      case "loggedBy": return (a.createdBy.name ?? a.createdBy.email).toLowerCase()
      default: return ""
    }
  }
  const sorted = useMemo(() => {
    const rows = [...filtered]
    rows.sort((a, b) => {
      const va = sortVal(a, sortKey), vb = sortVal(b, sortKey)
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))
      return sortDir === "asc" ? cmp : -cmp
    })
    return rows
  }, [filtered, sortKey, sortDir])

  // Render in chosen order, with the required "date" column first.
  const orderedActKeys = ["date", ...visibleCols.filter((k) => k !== "date")]
  const cols = (orderedActKeys.map((k) => allActivityCols.find((c) => c.key === k)).filter(Boolean) as typeof ACTIVITY_COLUMNS)
  const reorderableActCols = cols.filter((c) => c.key !== "date")
  const colReorder = useCardReorder(reorderableActCols, (c) => c.key, (ids) => setVisibleCols(["date", ...ids]))
  const orderedCols = [cols.find((c) => c.key === "date")!, ...colReorder.order].filter(Boolean) as typeof cols
  const widthOf = (k: string) => colWidth(k) ?? ACTIVITY_COL_W[k] ?? 160
  const fmap = frozenMap(orderedCols.map((c) => c.key), frozenCount, widthOf, 40)
  const cbFrozen = frozenCount > 0
  // Text columns start A→Z; date starts newest first.
  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir(key === "date" ? "desc" : "asc") }
  }

  const allSelected = sorted.length > 0 && sorted.every(a => selectedIds.has(a.id))
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(sorted.map(a => a.id)))
  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  async function bulkDelete() {
    const ids = Array.from(selectedIds)
    if (!ids.length || !(await confirmDialog(`Delete ${ids.length} activit${ids.length === 1 ? "y" : "ies"}? This cannot be undone.`))) return
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
  // Editable native activity columns → the Prisma column + field type. Relations
  // (account/location/providers/tags), the colored type/rating chips, and the
  // creator stay read-only.
  const ACTIVITY_EDIT: Record<string, RecordFieldDef & { field: string; get: (a: any) => any }> = {
    date: { key: "date", field: "date", label: "Date", type: "datetime", get: (a) => a.date },
    nextStep: { key: "nextStep", field: "nextStep", label: "Next Step", type: "text", get: (a) => a.nextStep },
    frontDesk: { key: "frontDesk", field: "frontDesk", label: "Front Desk", type: "text", get: (a) => a.frontDesk },
    notes: { key: "notes", field: "notes", label: "Notes", type: "long_text", get: (a) => a.notes },
  }
  function activEditable(a: any, key: string): { def: RecordFieldDef; value: any; field: string; read?: React.ReactNode; owner?: boolean } | null {
    if (key.startsWith("cp_")) {
      const id = key.slice(3); const p = activityCpById[id] as any; if (!p) return null
      return { def: cpToFieldDef(p, key), value: (a as any).customProperties?.[id], field: key }
    }
    if (key === "owner") {
      return { def: { key: "owner", label: "Owner", type: "user" }, value: a.ownerId ?? a.owner?.id ?? "", field: "ownerId", owner: true }
    }
    if (key === "type") {
      const t = ACTIVITY_TYPES.find(x => x.value === a.flyer)
      return {
        def: { key: "type", label: "Type", type: "select", options: ACTIVITY_TYPES.map(x => x.value) },
        value: a.flyer, field: "flyer",
        read: a.flyer
          ? <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${t ? `${t.bg} ${t.color} ${t.border}` : "bg-zinc-100 text-zinc-600 border-zinc-200"}`}>{a.flyer}</span>
          : <span className="text-zinc-400">—</span>,
      }
    }
    if (key === "rating") {
      return {
        def: { key: "rating", label: "Rating", type: "select", coerce: "number", options: ACTIVITY_RATINGS.map(String), optionLabels: Object.fromEntries(ACTIVITY_RATINGS.map((v) => [String(v), String(v)])) },
        value: a.rating != null ? String(a.rating) : "", field: "rating",
        read: a.rating
          ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border bg-zinc-100 text-zinc-700 border-zinc-200 whitespace-nowrap">{a.rating}</span>
          : <span className="text-zinc-400">—</span>,
      }
    }
    const m = ACTIVITY_EDIT[key]
    if (!m) return null
    const { field, get, ...def } = m
    return { def: def as RecordFieldDef, value: get(a), field }
  }

  function renderCell(a: typeof filtered[number], key: string): React.ReactNode {
    if (assocByKey[key]) { const v = readAssocValue(a, assocByKey[key]); return v ? <span className="text-zinc-600">{v}</span> : <span className="text-zinc-400">—</span> }
    if (key.startsWith("cp_")) {
      const id = key.slice(3)
      const raw = (a as any).customProperties?.[id]
      if (raw == null || raw === "" || (Array.isArray(raw) && raw.length === 0)) return <span className="text-zinc-400">—</span>
      const def = activityCpById[id] as any
      if (def?.type === "DROPDOWN" || def?.type === "MULTI_SELECT") return <OptionValue value={raw} optionLabels={def.optionLabels} optionColors={def.optionColors} optionStyle={def.optionStyle} />
      if (Array.isArray(raw)) return <span className="text-zinc-500">{raw.join(", ")}</span>
      if (def?.type === "NUMBER") return <span className="text-zinc-500">{formatNumber(raw, def.numberFormat)}</span>
      return <span className="text-zinc-500">{String(raw)}</span>
    }
    switch (key) {
      case "date": return <span className="whitespace-nowrap text-zinc-600">{fmtActivityWhen(a.date)}</span>
      case "account": return <span className="font-medium text-zinc-800">{a.practice?.name ?? "—"}</span>
      case "location": return <span className="text-zinc-500">{a.location?.name ?? "—"}</span>
      case "providers": return <span className="text-zinc-600">{a.providers.length ? a.providers.map(p => p.doctor.name + (p.doctor.title ? `, ${p.doctor.title}` : "")).join(", ") : "—"}</span>
      case "type": {
        const t = ACTIVITY_TYPES.find(x => x.value === a.flyer)
        return a.flyer
          ? <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${t ? `${t.bg} ${t.color} ${t.border}` : "bg-zinc-100 text-zinc-600 border-zinc-200"}`}>{a.flyer}</span>
          : <span className="text-zinc-400">—</span>
      }
      case "rating": return a.rating
        ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border bg-zinc-100 text-zinc-700 border-zinc-200 whitespace-nowrap">{a.rating}</span>
        : <span className="text-zinc-400">—</span>
      case "nextStep": return <span className="text-zinc-500">{a.nextStep || "—"}</span>
      case "frontDesk": return <span className="text-zinc-500">{a.frontDesk || "—"}</span>
      case "tags": return <span className="text-zinc-500">{a.tags.length ? a.tags.map(tg => tg.name).join(", ") : "—"}</span>
      case "notes": return <span className="text-zinc-500">{a.notes ? a.notes.replace(/\s+/g, " ").trim() : "—"}</span>
      case "owner": return <span className="whitespace-nowrap text-zinc-500">{ownerUserMap[a.ownerId ?? ""] ?? a.owner?.name ?? a.owner?.email ?? "—"}</span>
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
            !activeViewId ? "bg-blue-600 text-white border-blue-600" : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"
          }`}
        >
          All
        </button>
        {viewReorder.order.map(view => (
          <div key={view.id}
            {...viewReorder.handleProps(view.id)}
            {...viewReorder.cardProps(view.id)}
            className={cn("inline-flex items-center gap-1 h-8 rounded-lg border text-sm font-medium transition-all overflow-hidden cursor-grab active:cursor-grabbing",
              viewReorder.dragging === view.id && "opacity-50",
              activeViewId === view.id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400")}>
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
                  className="flex-1 h-9 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
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
                viewMode === "cards" ? "bg-blue-600 text-white" : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              <LayoutList className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              title="Table view"
              className={`inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors ${
                viewMode === "table" ? "bg-blue-600 text-white" : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              <Table2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Column selector (table view only) */}
          {viewMode === "table" && (
            <button
              onClick={() => setColModalOpen(true)}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-600 hover:border-zinc-400 transition-colors"
            >
              <Columns3 className="h-3.5 w-3.5" /> Columns
              <ChevronDown className="h-3 w-3 opacity-50" />
            </button>
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
                    className="flex-1 h-9 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
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
          <BulkActionBar embedded count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
            <button onClick={() => setReportOpen(true)} className={bulkBtn}><Mail className="h-3.5 w-3.5" /> Email report</button>
            <button onClick={bulkDelete} disabled={isPending} className={bulkDanger}><Trash2 className="h-3.5 w-3.5" /> Delete</button>
          </BulkActionBar>
          <div className="overflow-x-auto rounded-xl">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col style={{ width: 40 }} />
                {orderedCols.map(col => <col key={col.key} style={{ width: widthOf(col.key) }} />)}
                <col style={{ width: 64 }} />
              </colgroup>
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <th style={cbFrozen ? { position: "sticky", left: 0, zIndex: 30 } : undefined} className={cn("px-3 py-2 w-10", cbFrozen && "bg-slate-50")}>
                    <button onClick={toggleSelectAll}
                      className={cn("w-[15px] h-[15px] rounded border flex items-center justify-center align-middle", allSelected ? "bg-blue-600 border-blue-600" : "border-zinc-300 hover:border-zinc-400")}>
                      {allSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                    </button>
                  </th>
                  {orderedCols.map(col => {
                    const draggable = col.key !== "date"
                    return (
                      <th key={col.key}
                        {...(draggable ? { ...colReorder.handleProps(col.key), ...colReorder.cardProps(col.key) } : {})}
                        style={frozenHeadStyle(fmap.get(col.key))}
                        className={cn("px-3 py-2 font-semibold relative overflow-hidden transition-colors", draggable && "cursor-grab active:cursor-grabbing", (draggable && colReorder.dragging === col.key) ? "bg-slate-200/70" : cn("hover:bg-slate-100", frozenClass(fmap.get(col.key), "bg-slate-50")))}>
                        <button onClick={() => toggleSort(col.key)} className="flex items-center gap-1 w-full min-w-0 hover:text-slate-800">
                          <span className="flex-1 min-w-0 truncate text-left">{col.label}</span>
                          {sortKey === col.key && (sortDir === "asc" ? <ChevronUp className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />)}
                        </button>
                        <ColResizer onMouseDown={(e) => startResize(col.key, e)} />
                      </th>
                    )
                  })}
                  <th className="px-3 py-2 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {sorted.map(a => (
                  <tr key={a.id} className={cn("hover:bg-zinc-50 transition-colors align-top", selectedIds.has(a.id) && "bg-blue-50/40")}>
                    <td style={cbFrozen ? { position: "sticky", left: 0, zIndex: 10 } : undefined} className={cn("px-3 py-2.5", cbFrozen && "bg-white")}>
                      <button onClick={() => toggleSelect(a.id)}
                        className={cn("w-[15px] h-[15px] rounded border flex items-center justify-center", selectedIds.has(a.id) ? "bg-blue-600 border-blue-600" : "border-zinc-300 hover:border-zinc-400")}>
                        {selectedIds.has(a.id) && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                      </button>
                    </td>
                    {orderedCols.map(col => {
                      const ed = canManage ? activEditable(a, col.key) : null
                      return (
                      <td key={col.key} className={cn(ed ? "p-0 align-middle" : "px-3 py-2.5 truncate", frozenClass(fmap.get(col.key)))} style={{ maxWidth: widthOf(col.key), ...frozenCellStyle(fmap.get(col.key)) }}>{ed
                        ? <EditableCell def={ed.def} value={ed.value} values={(a as any).customProperties ?? {}} canEdit={canManage} renderRead={ed.read}
                            users={ed.owner ? assignableUsers : undefined} userMap={ed.owner ? ownerUserMap : undefined}
                            onSaveOwner={ed.owner ? (uid) => setRecordOwner("ACTIVITY", a.id, uid) : undefined}
                            onSave={ed.owner ? ((uid) => setRecordOwner("ACTIVITY", a.id, uid as any)) : ((v) => updateRecordField("ACTIVITY", a.id, ed.field, v))} />
                        : renderCell(a, col.key)}</td>
                    )})}
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
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
              <div className="shrink-0 w-20 text-center">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">{format(activityDay(a.date), "MMM")}</p>
                <p className="text-2xl font-bold text-slate-800 leading-none">{format(activityDay(a.date), "d")}</p>
                <p className="text-xs text-slate-400">{format(activityDay(a.date), "yyyy")}</p>
                {hasActivityTime(a.date) && <p className="text-[11px] text-slate-400 mt-0.5 whitespace-nowrap">{fmtActivityTime(a.date)}</p>}
                {(a.rating != null || a.meetingRating != null) && (
                  <div className="mt-2 space-y-1">
                    {a.rating != null && (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[9px] font-medium uppercase tracking-wide text-slate-400">Clinic</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border bg-zinc-100 text-zinc-700 border-zinc-200">{a.rating}</span>
                      </div>
                    )}
                    {a.meetingRating != null && (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[9px] font-medium uppercase tracking-wide text-slate-400">Meeting</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border bg-zinc-100 text-zinc-700 border-zinc-200">{a.meetingRating}</span>
                      </div>
                    )}
                  </div>
                )}
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

                <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-slate-500">
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

          {(followupAvailable || step === 2) && (
            <div className="flex gap-1 p-1 bg-slate-100 rounded-lg text-sm font-medium">
              <button type="button" onClick={() => setStep(1)}
                className={cn("flex-1 py-1.5 rounded-md transition-colors", step === 1 ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                1 · Activity
              </button>
              <button type="button" onClick={() => step === 1 ? goToTaskStep() : setStep(2)}
                className={cn("flex-1 py-1.5 rounded-md transition-colors", step === 2 ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                2 · Follow-up task
              </button>
            </div>
          )}

          <div className={cn("grid grid-cols-2 gap-4 py-2", step === 2 && "hidden")}>
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
              <label className="text-sm font-medium text-slate-700">Date &amp; Time</label>
              <DatePicker withTime autoOpen={false} value={form.date} onCommit={v => set("date", v)} onCancel={() => {}} />
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
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Clinic Value (1 lowest, 6 highest)</label>
              <div className="flex flex-wrap gap-2">
                {ACTIVITY_RATINGS.map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => set("rating", form.rating === String(v) ? "" : String(v))}
                    className={`h-9 w-9 rounded-lg border text-sm font-medium transition-all ${
                      form.rating === String(v)
                        ? "bg-zinc-900 text-white border-zinc-900"
                        : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Meeting Rating (1 lowest, 6 highest)</label>
              <div className="flex flex-wrap gap-2">
                {MEETING_RATINGS.map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => set("meetingRating", form.meetingRating === String(v) ? "" : String(v))}
                    className={`h-9 w-9 rounded-lg border text-sm font-medium transition-all ${
                      form.meetingRating === String(v)
                        ? "bg-zinc-900 text-white border-zinc-900"
                        : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div className="col-span-2 space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Notes</label>
              <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Enter notes here..." rows={4} />
            </div>
          </div>

          {/* ── Step 2: follow-up task ── */}
          {step === 2 && (
            <div className="space-y-4 py-2">
              <p className="text-xs text-slate-500">Create a task from this next step. It's linked to the practice, location, and providers you picked.</p>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Task title *</label>
                <Input value={taskDraft.title} onChange={e => setTask("title", e.target.value)} placeholder="What needs to be done?" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Deadline</label>
                  <DatePicker withTime autoOpen={false} value={taskDraft.dueDate} onCommit={v => setTask("dueDate", v)} onCancel={() => {}} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Assigned to</label>
                  <StyledSelect value={taskDraft.assignedToId} onChange={e => setTask("assignedToId", e.target.value)} className="w-full">
                    <option value="">— Unassigned —</option>
                    <option value={currentUserId}>{currentUserName ? `${currentUserName} (You)` : "You"}</option>
                    {shareUsers.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                  </StyledSelect>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Task type</label>
                  <StyledSelect value={taskDraft.type} onChange={e => setTask("type", e.target.value as TaskType)} className="w-full">
                    {TASK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </StyledSelect>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Priority</label>
                  <StyledSelect value={taskDraft.priority} onChange={e => setTask("priority", e.target.value as TaskPriority)} className="w-full">
                    {Object.values(TaskPriority).map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                  </StyledSelect>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Reminder</label>
                  <StyledSelect value={String(taskDraft.reminderMinutesBefore ?? "")} onChange={e => setTask("reminderMinutesBefore", e.target.value === "" ? null : Number(e.target.value))} className="w-full">
                    {REMINDER_OPTIONS.map(r => <option key={String(r.value)} value={r.value === null ? "" : r.value}>{r.label}</option>)}
                  </StyledSelect>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Associated with</label>
                <div className="flex flex-wrap gap-1.5 min-h-[38px] border border-slate-200 rounded-md bg-slate-50 px-3 py-2 content-start">
                  {followupAssocs().length === 0 ? (
                    <p className="text-xs text-slate-400 self-center">No practice/location/providers selected on the activity.</p>
                  ) : followupAssocs().map(a => {
                    const skipped = taskDraft.skipAssoc.has(a.key)
                    const kind = a.type === "PRACTICE" ? "Practice" : a.type === "LOCATION" ? "Location" : "Provider"
                    return (
                      <button key={a.key} type="button"
                        onClick={() => { const s = new Set(taskDraft.skipAssoc); skipped ? s.delete(a.key) : s.add(a.key); setTask("skipAssoc", s) }}
                        className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors",
                          skipped ? "bg-slate-100 text-slate-400 line-through" : "bg-white border border-slate-200 text-slate-700")}
                        title={skipped ? "Click to re-add" : "Click to remove"}>
                        <span className="text-slate-400">{kind}:</span> {a.label}
                        {!skipped && <X className="h-3 w-3 text-slate-400" />}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Description</label>
                <Textarea value={taskDraft.description} onChange={e => setTask("description", e.target.value)} placeholder="Task details…" rows={3} />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

          <DialogFooter>
            {step === 2 ? (
              <>
                <Button variant="outline" onClick={() => setStep(1)} disabled={isPending}>← Back</Button>
                <Button onClick={() => handleSubmit(true)} disabled={isPending || !taskDraft.title.trim()}>
                  {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Log activity &amp; create task
                </Button>
              </>
            ) : followupAvailable ? (
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
                <Button variant="outline" onClick={() => handleSubmit(false)} disabled={isPending}>Log activity only</Button>
                <Button onClick={goToTaskStep} disabled={isPending}>Next → Task details</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
                <Button onClick={() => handleSubmit(false)} disabled={isPending}>
                  {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editId ? "Save Changes" : "Log Activity"}
                </Button>
              </>
            )}
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

      <ColumnChooserModal
        open={colModalOpen}
        onClose={() => setColModalOpen(false)}
        columns={allActivityCols}
        required={["date"]}
        selected={visibleCols}
        frozen={frozenCount}
        onApply={(sel, fr) => { setVisibleCols(sel); setFrozenCount(fr) }}
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
              <div className="mt-1.5">
                <TeammatePicker users={shareUsers} selected={reportRecipients} onAdd={addTeammate} />
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
