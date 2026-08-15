"use client"

import ProviderTitleField from "@/components/provider-title-field"
import ExportDialog from "@/components/ui/export-dialog"
import FilterBuilder from "@/components/ui/filter-builder"
import { type FilterField, type FilterState, type CustomPropDef, emptyFilter, matchesFilter, activeConditionCount, customPropertyFilterFields } from "@/lib/filters"
import { formatNumber } from "@/lib/number-format"
import { useState, useTransition, useRef, useEffect, type ReactNode } from "react"
import { OptionValue } from "@/components/option-value"
import { ReferringPractice, PracticeLocation, ReferringDoctor, DoctorLocation } from "@prisma/client"
import {
  createPractice, updatePractice, deletePractice, mergePractice,
  createLocation, updateLocation, deleteLocation, mergeLocation,
  createDoctor, updateDoctor, deleteDoctor, mergeDoctor,
} from "@/app/actions/referring-doctors"
import { createProviderView, updateProviderView, deleteProviderView } from "@/app/actions/provider-views"
import { reorderViews } from "@/app/actions/view-order"
import { useCardReorder } from "@/components/use-card-reorder"
import ColumnChooserModal from "@/components/ui/column-chooser"
import { frozenMap, frozenHeadStyle, frozenCellStyle, frozenClass } from "@/lib/frozen-columns"
import { ViewAccessSelector, type Visibility, type ViewAccessValue, type ShareUser, type ShareTeam } from "@/components/view-access-selector"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog"
import { Plus, Pencil, Trash2, Loader2, ChevronRight, MapPin, User, Building2, ExternalLink, Merge, Search, X, Check, BarChart2, Columns3, ChevronDown, Save, Globe, Users, UserCog, Lock, Download } from "lucide-react"
import { useColumnResize, ColResizer } from "@/components/ui/use-column-resize"
import { PhoneInput } from "@/components/ui/phone-input"
import Link from "next/link"
import { cn } from "@/lib/utils"

// ─── Types ─────────────────────────────────────────────────────────────────────

type LocationWithCount = PracticeLocation & { _count: { referrals: number } }
type DoctorWithRelations = ReferringDoctor & {
  locations: (DoctorLocation & { location: Pick<PracticeLocation, "id" | "name"> })[]
  _count: { referrals: number }
}
type PracticeWithRelations = ReferringPractice & {
  locations: LocationWithCount[]
  doctors: DoctorWithRelations[]
  _count: { referrals: number }
}

interface SavedProviderView {
  id: string
  name: string
  config: { columns: string[]; sort: "name" | "referrals"; search: string }
  visibility?: Visibility
  teamId?: string | null
  sharedUserIds?: string[]
  isOwner?: boolean
}

interface Props {
  practices: PracticeWithRelations[]
  isAdmin: boolean
  currentUserId: string
  savedViews: SavedProviderView[]
  shareUsers: ShareUser[]
  shareTeams: ShareTeam[]
  providerCustomPropertyDefs?: CustomPropDef[]
}

// ─── Provider table columns ─────────────────────────────────────────────────────

const PROVIDER_COLUMNS: { key: string; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "practice", label: "Practice" },
  { key: "npi", label: "NPI" },
  { key: "phone", label: "Phone" },
  { key: "officePhone", label: "Office Phone" },
  { key: "email", label: "Email" },
  { key: "locations", label: "Locations" },
  { key: "referrals", label: "Referrals" },
  { key: "owner", label: "Provider Owner" },
]

const DEFAULT_PROVIDER_COLUMNS = ["title", "practice", "npi", "referrals"]

// ─── Field wrapper ─────────────────────────────────────────────────────────────

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

// ─── Practice Form ─────────────────────────────────────────────────────────────

function PracticeForm({ defaultValues, onSubmit, isPending, onClose }: {
  defaultValues?: Partial<ReferringPractice>
  onSubmit: (d: { name: string; phone: string; fax: string; address: string }) => Promise<void>
  isPending: boolean
  onClose: () => void
}) {
  const [name, setName] = useState(defaultValues?.name ?? "")
  const [phone, setPhone] = useState(defaultValues?.phone ?? "")
  const [fax, setFax] = useState(defaultValues?.fax ?? "")
  const [address, setAddress] = useState(defaultValues?.address ?? "")
  const [err, setErr] = useState("")

  return (
    <form onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) { setErr("Required"); return } await onSubmit({ name, phone, fax, address }) }} className="space-y-4">
      <Field label="Practice Name *" error={err}><Input value={name} onChange={(e) => { setName(e.target.value); setErr("") }} placeholder="Downtown Family Medicine" /></Field>
      <Field label="Phone"><PhoneInput value={phone} onChange={setPhone} /></Field>
      <Field label="Fax"><Input value={fax} onChange={(e) => setFax(e.target.value)} type="tel" placeholder="555-100-2001" /></Field>
      <Field label="Address"><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St" /></Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={isPending}>{isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
      </DialogFooter>
    </form>
  )
}

// ─── Location Form ─────────────────────────────────────────────────────────────

function LocationForm({ practiceId, defaultValues, onSubmit, isPending, onClose }: {
  practiceId: string
  defaultValues?: Partial<PracticeLocation>
  onSubmit: (d: { name: string; phone: string; fax: string; address: string; practiceId: string }) => Promise<void>
  isPending: boolean
  onClose: () => void
}) {
  const [name, setName] = useState(defaultValues?.name ?? "")
  const [phone, setPhone] = useState(defaultValues?.phone ?? "")
  const [fax, setFax] = useState(defaultValues?.fax ?? "")
  const [address, setAddress] = useState(defaultValues?.address ?? "")
  const [err, setErr] = useState("")

  return (
    <form onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) { setErr("Required"); return } await onSubmit({ name, phone, fax, address, practiceId }) }} className="space-y-4">
      <Field label="Location Name *" error={err}><Input value={name} onChange={(e) => { setName(e.target.value); setErr("") }} placeholder="Main Office" /></Field>
      <Field label="Phone"><PhoneInput value={phone} onChange={setPhone} /></Field>
      <Field label="Fax"><Input value={fax} onChange={(e) => setFax(e.target.value)} type="tel" placeholder="555-100-2003" /></Field>
      <Field label="Address"><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, Suite 100" /></Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={isPending}>{isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
      </DialogFooter>
    </form>
  )
}

// ─── Provider Form ─────────────────────────────────────────────────────────────

function DoctorForm({ practiceId, locations, defaultValues, onSubmit, isPending, onClose, practices }: {
  practiceId: string
  locations: LocationWithCount[]
  defaultValues?: Partial<ReferringDoctor> & { locationIds?: string[] }
  onSubmit: (d: { name: string; title: string; npi: string; specialty: string; phone: string; officePhone: string; email: string; practiceId: string; locationIds: string[] }) => Promise<void>
  isPending: boolean
  onClose: () => void
  practices?: PracticeWithRelations[]  // when provided, shows a practice selector
}) {
  const [name, setName] = useState(defaultValues?.name ?? "")
  const [title, setTitle] = useState((defaultValues as any)?.title ?? "")
  const [npi, setNpi] = useState((defaultValues as any)?.npi ?? "")
  const [specialty, setSpecialty] = useState(defaultValues?.specialty ?? "")
  const [phone, setPhone] = useState(defaultValues?.phone ?? "")
  const [officePhone, setWorkPhone] = useState((defaultValues as any)?.officePhone ?? "")
  const [email, setEmail] = useState(defaultValues?.email ?? "")
  const [selectedLocs, setSelectedLocs] = useState<string[]>(defaultValues?.locationIds ?? [])
  const [err, setErr] = useState("")
  const [selectedPracticeId, setSelectedPracticeId] = useState(practiceId)

  const activePractice = practices?.find((p) => p.id === selectedPracticeId)
  const activeLocations = activePractice ? activePractice.locations : locations

  function toggleLoc(id: string) {
    setSelectedLocs((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  return (
    <form onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) { setErr("Required"); return } await onSubmit({ name, title, npi, specialty, phone, officePhone, email, practiceId: selectedPracticeId, locationIds: selectedLocs }) }} className="space-y-4">
      {practices && (
        <Field label="Practice *">
          <SearchablePicker
            items={practices.map((p) => ({ id: p.id, label: p.name }))}
            value={selectedPracticeId}
            onChange={(id) => { setSelectedPracticeId(id); setSelectedLocs([]) }}
            placeholder="Search practices…"
          />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Provider Name *" error={err}>
          <Input value={name} onChange={(e) => { setName(e.target.value); setErr("") }} placeholder="Sarah Johnson" />
        </Field>
        <Field label="Title">
          <ProviderTitleField value={title} onChange={setTitle} />
        </Field>
      </div>
      <Field label="NPI (National Provider Identifier)">
        <Input value={npi} onChange={(e) => setNpi(e.target.value)} placeholder="1234567890" maxLength={10} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cell Phone"><PhoneInput value={phone} onChange={setPhone} /></Field>
        <Field label="Office Phone"><PhoneInput value={officePhone} onChange={setWorkPhone} /></Field>
      </div>
      <Field label="Email"><Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="dr.johnson@clinic.com" /></Field>
      <div className="space-y-1.5">
        <Label>Locations (check all that apply)</Label>
        {activeLocations.length === 0 ? (
          <p className="text-sm text-slate-400 italic">No locations for this practice yet.</p>
        ) : (
          <div className="space-y-2 border rounded-md p-3 max-h-48 overflow-y-auto">
            {activeLocations.map((l) => (
              <label key={l.id} className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={selectedLocs.includes(l.id)} onChange={() => toggleLoc(l.id)} className="rounded border-slate-300 h-4 w-4" />
                <span className="text-sm font-medium">{l.name}</span>
                {l.address && <span className="text-xs text-slate-500">{l.address}</span>}
              </label>
            ))}
          </div>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={isPending}>{isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
      </DialogFooter>
    </form>
  )
}

// ─── Searchable picker ────────────────────────────────────────────────────────

function SearchablePicker({
  items,
  value,
  onChange,
  placeholder = "Search...",
  renderItem,
  renderSelected,
}: {
  items: { id: string; label: string; sub?: string }[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  renderItem?: (item: { id: string; label: string; sub?: string }) => React.ReactNode
  renderSelected?: (item: { id: string; label: string; sub?: string }) => React.ReactNode
}) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = items.find((i) => i.id === value)
  const filtered = query.trim()
    ? items.filter((i) => i.label.toLowerCase().includes(query.toLowerCase()) || (i.sub ?? "").toLowerCase().includes(query.toLowerCase()))
    : items

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery("") } }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      {open ? (
        // One search box (replaces the trigger while open) — no redundant second field.
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            autoFocus type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to search…"
            className="w-full pl-9 pr-3 py-2.5 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { setOpen(true); setQuery("") }}
          className="w-full flex items-center justify-between border rounded-lg px-3 py-2.5 text-sm bg-white hover:bg-slate-50 transition-colors text-left"
        >
          {selected ? (
            <div className="min-w-0">
              {renderSelected ? renderSelected(selected) : <span className="font-medium text-slate-800 truncate block">{selected.label}</span>}
            </div>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
          <Search className="h-4 w-4 text-slate-400 shrink-0 ml-2" />
        </button>
      )}

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg overflow-hidden">
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-sm text-slate-400 text-center">No results</p>
            ) : (
              filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { onChange(item.id); setOpen(false); setQuery("") }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-slate-50 transition-colors text-left",
                    value === item.id && "bg-blue-50"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    {renderItem ? renderItem(item) : (
                      <>
                        <p className="font-medium text-slate-800 truncate">{item.label}</p>
                        {item.sub && <p className="text-xs text-slate-400 truncate">{item.sub}</p>}
                      </>
                    )}
                  </div>
                  {value === item.id && <Check className="h-4 w-4 text-blue-600 shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function PracticeManager({ practices, isAdmin, savedViews: initialSavedViews, shareUsers, shareTeams, providerCustomPropertyDefs = [], view = "practices" }: Props & { view?: "practices" | "providers" }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [expandedPractice, setExpandedPractice] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [tab] = useState<"practices" | "providers">(view)
  const [providerSort, setProviderSort] = useState<"name" | "referrals">("name")
  const [addProviderOpen, setAddProviderOpen] = useState(false)
  // Provider filters + export
  const [providerFilter, setProviderFilter] = useState<FilterState>(emptyFilter())
  const [exportOpen, setExportOpen] = useState(false)

  // Provider table columns + saved views
  const [visibleCols, setVisibleCols] = useState<string[]>(DEFAULT_PROVIDER_COLUMNS)
  const [frozenCount, setFrozenCount] = useState(0)
  const [colModalOpen, setColModalOpen] = useState(false)
  const { colWidth, startResize } = useColumnResize("providerColWidths")
  const [savedViews, setSavedViews] = useState<SavedProviderView[]>(initialSavedViews)
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [newViewName, setNewViewName] = useState("")
  const [savingView, setSavingView] = useState(false)
  const [newViewAccess, setNewViewAccess] = useState<ViewAccessValue>({ visibility: "PRIVATE", teamId: null, sharedUserIds: [] })
  const [editAccessId, setEditAccessId] = useState<string | null>(null)
  const [editAccessValue, setEditAccessValue] = useState<ViewAccessValue>({ visibility: "PRIVATE", teamId: null, sharedUserIds: [] })
  const [savingAccess, setSavingAccess] = useState(false)

  // Persist provider column choice + frozen count per user (loaded after mount).
  useEffect(() => {
    try {
      const c = localStorage.getItem("providerCols"); if (c) { const a = JSON.parse(c); if (Array.isArray(a) && a.length) setVisibleCols(a) }
      const f = localStorage.getItem("providerFrozen"); if (f != null) { const n = Number(f); if (!Number.isNaN(n)) setFrozenCount(n) }
    } catch {}
  }, [])
  useEffect(() => { try { localStorage.setItem("providerCols", JSON.stringify(visibleCols)) } catch {} }, [visibleCols])
  useEffect(() => { try { localStorage.setItem("providerFrozen", String(frozenCount)) } catch {} }, [frozenCount])

  function applyProviderView(view: SavedProviderView) {
    setVisibleCols(view.config.columns ?? DEFAULT_PROVIDER_COLUMNS)
    setFrozenCount((view.config as any).frozen ?? 0)
    setProviderSort(view.config.sort ?? "name")
    setSearch(view.config.search ?? "")
    setActiveViewId(view.id)
  }

  // Drag to reorder the view tabs (per-user order, persisted).
  const viewReorder = useCardReorder(savedViews, (v) => v.id, (ids) => startTransition(() => { reorderViews("PROVIDER", "", ids) }))

  async function handleSaveProviderView() {
    if (!newViewName.trim()) return
    setSavingView(true)
    const config = { columns: visibleCols, sort: providerSort, search, frozen: frozenCount }
    const res = await createProviderView(newViewName.trim(), config, newViewAccess) as any
    if (res?.success) {
      setSavedViews(prev => [...prev, {
        id: res.id, name: newViewName.trim(), config,
        visibility: newViewAccess.visibility, teamId: newViewAccess.teamId,
        sharedUserIds: newViewAccess.sharedUserIds, isOwner: true,
      }])
      setActiveViewId(res.id)
    }
    setNewViewName("")
    setNewViewAccess({ visibility: "PRIVATE", teamId: null, sharedUserIds: [] })
    setShowSaveForm(false)
    setSavingView(false)
  }

  const editAccessView = savedViews.find(v => v.id === editAccessId) ?? null

  // Does the current state differ from the active view's saved config?
  const activeView = savedViews.find(v => v.id === activeViewId)
  const viewDirty = !!activeView && activeView.isOwner !== false && (
    activeView.config.sort !== providerSort ||
    activeView.config.search !== search ||
    activeView.config.columns.length !== visibleCols.length ||
    !activeView.config.columns.every(c => visibleCols.includes(c))
  )

  async function handleUpdateProviderView() {
    if (!activeView) return
    setSavingView(true)
    const config = { columns: visibleCols, sort: providerSort, search, frozen: frozenCount }
    const res = await updateProviderView(activeView.id, config) as any
    if (res?.success) {
      setSavedViews(prev => prev.map(v => v.id === activeView.id ? { ...v, config } : v))
    }
    setSavingView(false)
  }

  function openEditAccess(view: SavedProviderView) {
    setShowSaveForm(false)
    setEditAccessValue({
      visibility: view.visibility ?? "PRIVATE",
      teamId: view.teamId ?? null,
      sharedUserIds: view.sharedUserIds ?? [],
    })
    setEditAccessId(prev => prev === view.id ? null : view.id)
  }

  async function handleSaveAccess(view: SavedProviderView) {
    setSavingAccess(true)
    const res = await updateProviderView(view.id, view.config, editAccessValue) as any
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

  async function handleDeleteProviderView(id: string) {
    await deleteProviderView(id)
    setSavedViews(prev => prev.filter(v => v.id !== id))
    if (activeViewId === id) setActiveViewId(null)
  }

  const [addPracticeOpen, setAddPracticeOpen] = useState(false)
  const [editPractice, setEditPractice] = useState<PracticeWithRelations | null>(null)
  const [mergePracticeFor, setMergePracticeFor] = useState<PracticeWithRelations | null>(null)
  const [mergePracticeTargetId, setMergePracticeTargetId] = useState("")
  const [addLocationFor, setAddLocationFor] = useState<PracticeWithRelations | null>(null)
  const [editLocation, setEditLocation] = useState<{ loc: LocationWithCount; practice: PracticeWithRelations } | null>(null)
  const [mergeLocationFor, setMergeLocationFor] = useState<{ loc: LocationWithCount; practice: PracticeWithRelations } | null>(null)
  const [mergeTargetId, setMergeTargetId] = useState("")
  const [addDoctorFor, setAddDoctorFor] = useState<PracticeWithRelations | null>(null)
  const [editDoctor, setEditDoctor] = useState<{ doc: DoctorWithRelations; practice: PracticeWithRelations } | null>(null)
  const [mergeDoctorFor, setMergeDoctorFor] = useState<{ doc: DoctorWithRelations; practice: PracticeWithRelations } | null>(null)
  const [mergeDoctorTargetId, setMergeDoctorTargetId] = useState("")

  function run(fn: () => Promise<{ success?: boolean; error?: string | object } | undefined>) {
    startTransition(async () => {
      const result = await fn()
      if (result?.error) setError(typeof result.error === "string" ? result.error : "Validation error")
    })
  }

  // Flat list of all providers across all practices — deduplicated by doctor ID
  // (a doctor can appear in multiple practice enrichments via cross-org location links)
  const allProviders = (() => {
    const seen = new Set<string>()
    return practices
      .flatMap((p) => p.doctors.map((d) => ({ ...d, practiceName: p.name, practice: p })))
      .filter((d) => { if (seen.has(d.id)) return false; seen.add(d.id); return true })
      .sort((a, b) =>
        providerSort === "referrals"
          ? b._count.referrals - a._count.referrals
          : a.name.localeCompare(b.name)
      )
  })()

  // Distinct values for the select-type filter fields.
  const providerPractices = Array.from(new Set(allProviders.map((d) => d.practiceName).filter(Boolean))).sort()
  const providerSpecialties = Array.from(new Set(allProviders.map((d) => (d as any).specialty as string).filter(Boolean))).sort()
  // Record Owner reads off the user list the view-sharing selector already has.
  const ownerLabel = (d: any) => {
    const u = shareUsers.find((x) => x.id === d.ownerId)
    return u ? (u.name ?? u.email) : ""
  }
  const providerOwners = Array.from(new Set(allProviders.map(ownerLabel).filter(Boolean))).sort()

  // Filter schema — one entry per column/property, type-aware. New (custom)
  // properties should be appended here so they become filter criteria automatically.
  const providerFilterFields: FilterField[] = [
    { key: "name", label: "Name", type: "text", getValue: (d) => d.name },
    { key: "title", label: "Title", type: "text", getValue: (d) => (d as any).title },
    { key: "practice", label: "Practice", type: "select", options: providerPractices.map((p) => ({ label: p, value: p })), getValue: (d) => d.practiceName },
    { key: "specialty", label: "Specialty", type: "select", options: providerSpecialties.map((s) => ({ label: s, value: s })), getValue: (d) => (d as any).specialty },
    { key: "npi", label: "NPI", type: "text", getValue: (d) => d.npi },
    { key: "phone", label: "Phone", type: "text", getValue: (d) => (d as any).phone },
    { key: "officePhone", label: "Office Phone", type: "text", getValue: (d) => (d as any).officePhone },
    { key: "email", label: "Email", type: "text", getValue: (d) => (d as any).email },
    { key: "referrals", label: "Referrals", type: "number", getValue: (d) => d._count.referrals },
    { key: "locations", label: "Locations (count)", type: "number", getValue: (d) => d.locations?.length ?? 0 },
    { key: "owner", label: "Provider Owner", type: "select", options: providerOwners.map((o) => ({ label: o, value: o })), getValue: ownerLabel },
    { key: "created", label: "Created", type: "date", getValue: (d) => (d as any).createdAt },
    ...customPropertyFilterFields(providerCustomPropertyDefs),
  ]

  // Column chooser: the fixed columns plus specialty, created, and every custom
  // property — so the list can surface any property, native or custom.
  const fmtProviderDate = (d: any) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" }) : "—")
  const extraProviderCols = [
    { key: "specialty", label: "Specialty" },
    { key: "created", label: "Created" },
    ...providerCustomPropertyDefs.map((p) => ({ key: `cp:${p.id}`, label: p.name })),
  ]
  const providerColumns = [...PROVIDER_COLUMNS, ...extraProviderCols]
  const cpDefById = Object.fromEntries(providerCustomPropertyDefs.map((p) => [p.id, p]))
  const cpValue = (d: any, key: string): ReactNode => {
    const id = key.slice(3)
    const raw = (d.customProperties as Record<string, any> | undefined)?.[id]
    if (raw == null || raw === "" || (Array.isArray(raw) && raw.length === 0)) return "—"
    const def = cpDefById[id]
    if (def?.type === "DROPDOWN" || def?.type === "MULTI_SELECT") return <OptionValue value={raw} optionLabels={(def as any).optionLabels} optionColors={(def as any).optionColors} optionStyle={(def as any).optionStyle} />
    if (Array.isArray(raw)) return raw.join(", ")
    if (def?.type === "NUMBER") return formatNumber(raw, (def as any).numberFormat)
    return String(raw)
  }

  // ── Data-driven provider table columns (name is the fixed leading column) ──
  const PROVIDER_COL_W: Record<string, number> = { name: 220, title: 150, practice: 180, npi: 130, phone: 150, officePhone: 150, email: 200, locations: 200, referrals: 110, owner: 160, specialty: 160, created: 130 }
  const provWidthOf = (k: string) => colWidth(k) ?? PROVIDER_COL_W[k] ?? 160
  const provOrderedCols = (visibleCols.map((k) => providerColumns.find((c) => c.key === k)).filter(Boolean) as { key: string; label: string }[])
  const provColReorder = useCardReorder(provOrderedCols, (c) => c.key, (ids) => setVisibleCols(ids))
  const provFmap = frozenMap(["name", ...provColReorder.order.map((c) => c.key)], frozenCount, provWidthOf, 0)
  const PROV_CELL_CLASS: Record<string, string> = { npi: "text-slate-400 font-mono text-xs", referrals: "text-right text-slate-600 tabular-nums", email: "text-slate-500 truncate max-w-[200px]", locations: "text-slate-500 text-xs" }
  const renderProviderCell = (d: any, key: string): ReactNode => {
    switch (key) {
      case "title": return d.title || "—"
      case "practice": return <span className="text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">{d.practiceName}</span>
      case "npi": return d.npi || "—"
      case "phone": return d.phone || "—"
      case "officePhone": return d.officePhone || "—"
      case "email": return d.email || "—"
      case "locations": return d.locations?.length ? d.locations.map((l: any) => l.location.name).join(", ") : "—"
      case "referrals": return d._count.referrals
      case "owner": return ownerLabel(d) || "—"
      case "specialty": return d.specialty || "—"
      case "created": return fmtProviderDate(d.createdAt)
      default: return cpValue(d, key)
    }
  }

  // Providers after search + advanced filters — used by both the table and the export.
  const filteredProviders = allProviders.filter((d) => {
    const q = search.toLowerCase().trim()
    if (q && !(d.name.toLowerCase().includes(q) || d.practiceName.toLowerCase().includes(q) || d.npi?.includes(q))) return false
    return matchesFilter(d, providerFilter, providerFilterFields)
  })
  const providerFiltersActive = activeConditionCount(providerFilter, providerFilterFields) > 0

  function buildProviderExport() {
    const headers = ["Name", "Title", "Practice", "Specialty", "NPI", "Phone", "Office Phone", "Email", "Locations", "Referrals", "Provider Owner"]
    const rows = filteredProviders.map((d) => [
      d.name, (d as any).title ?? "", d.practiceName, (d as any).specialty ?? "", d.npi ?? "",
      (d as any).phone ?? "", (d as any).officePhone ?? "", (d as any).email ?? "",
      d.locations?.map((l) => l.location.name).join("; ") ?? "", d._count.referrals, ownerLabel(d),
    ])
    return { headers, rows }
  }

  return (
    <div className="space-y-4">
      {/* Error message + action button */}
      <div className="flex items-center justify-between gap-4">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md flex-1">
            {error} <button className="ml-2 underline" onClick={() => setError(null)}>Dismiss</button>
          </p>
        )}

        {tab === "practices" && (
          <Dialog open={addPracticeOpen} onOpenChange={setAddPracticeOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Add Practice</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Referring Practice</DialogTitle></DialogHeader>
              <PracticeForm
                onSubmit={async (d) => { run(() => createPractice(d)); setAddPracticeOpen(false) }}
                isPending={isPending}
                onClose={() => setAddPracticeOpen(false)}
              />
            </DialogContent>
          </Dialog>
        )}

        {tab === "providers" && (
          <div className="flex items-center gap-2 shrink-0">
            {/* Sort toggle */}
            <div className="flex gap-0.5 bg-slate-100 rounded-lg p-0.5">
              <button
                onClick={() => setProviderSort("name")}
                className={cn("px-2.5 py-1 text-xs font-medium rounded-md transition-colors", providerSort === "name" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700")}
              >
                A–Z
              </button>
              <button
                onClick={() => setProviderSort("referrals")}
                className={cn("px-2.5 py-1 text-xs font-medium rounded-md transition-colors", providerSort === "referrals" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700")}
              >
                Top refs
              </button>
            </div>
            {/* Save-changes to active view — always visible, grayed when no changes */}
            <button
              onClick={handleUpdateProviderView}
              disabled={!viewDirty || savingView}
              title={viewDirty ? "Save changes to current view" : "No unsaved changes"}
              className={cn(
                "inline-flex items-center justify-center h-8 w-8 rounded-lg border transition-colors",
                viewDirty
                  ? "border-amber-300 bg-amber-50 text-amber-600 hover:bg-amber-100"
                  : "border-slate-200 bg-white text-slate-300 cursor-not-allowed"
              )}
            >
              {savingView ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            </button>
            {/* Access — manage who can see the active view */}
            <div className="relative">
              <button
                onClick={() => { if (activeView && activeView.isOwner !== false) openEditAccess(activeView) }}
                disabled={!activeView || activeView.isOwner === false}
                title={activeView ? (activeView.isOwner === false ? "You can't change access for a view you don't own" : "Manage who can see this view") : "Select a view to manage access"}
                className={cn(
                  "inline-flex items-center justify-center h-8 w-8 rounded-lg border transition-colors",
                  editAccessId
                    ? "border-amber-300 bg-amber-50 text-amber-600"
                    : activeView && activeView.isOwner !== false
                    ? "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    : "border-slate-200 bg-white text-slate-300 cursor-not-allowed"
                )}
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
            {/* Column selector */}
            <button
              onClick={() => setColModalOpen(true)}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900 transition-colors"
            >
              <Columns3 className="h-3.5 w-3.5" />
              Columns
              <ChevronDown className="h-3 w-3 opacity-50" />
            </button>
            {/* Export */}
            <button
              onClick={() => setExportOpen(true)}
              disabled={filteredProviders.length === 0}
              title="Export current view to CSV"
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900 disabled:opacity-50 transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> Export
            </button>
            {isAdmin && (
              <Dialog open={addProviderOpen} onOpenChange={setAddProviderOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 mr-1.5" />Add Provider</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Provider</DialogTitle></DialogHeader>
                  {practices.length === 0 ? (
                    <p className="text-sm text-slate-500">Create a practice first before adding a provider.</p>
                  ) : (
                    <DoctorForm
                      practiceId={practices[0].id}
                      locations={[]}
                      onSubmit={async (d) => { run(() => createDoctor(d)); setAddProviderOpen(false) }}
                      isPending={isPending}
                      onClose={() => setAddProviderOpen(false)}
                      practices={practices}
                    />
                  )}
                </DialogContent>
              </Dialog>
            )}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder={tab === "practices" ? "Search by organization or provider name…" : "Search providers…"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-8 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ── Filters (providers only) ───────────────────────────────────────── */}
      {tab === "providers" && (
        <div className="flex flex-wrap items-center gap-2">
          <FilterBuilder fields={providerFilterFields} value={providerFilter} onChange={setProviderFilter} />
          {providerFiltersActive && (
            <span className="text-xs text-slate-400">{filteredProviders.length} of {allProviders.length}</span>
          )}
        </div>
      )}

      {/* ── Views bar (providers only) ─────────────────────────────────────── */}
      {tab === "providers" && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { setActiveViewId(null); setVisibleCols(DEFAULT_PROVIDER_COLUMNS) }}
            className={cn("h-8 px-3 rounded-lg text-sm font-medium border transition-all", !activeViewId ? "bg-blue-600 text-white border-blue-600" : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400")}
          >
            Default
          </button>
          {viewReorder.order.map(view => (
            <div key={view.id}
              {...viewReorder.handleProps(view.id)}
              {...viewReorder.cardProps(view.id)}
              className={cn("inline-flex items-center gap-1 h-8 rounded-lg border text-sm font-medium transition-all overflow-hidden cursor-grab active:cursor-grabbing", viewReorder.dragging === view.id && "opacity-50", activeViewId === view.id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400")}>
              <button className={cn("pl-3 h-full", view.isOwner === false ? "pr-3" : "pr-1.5")} onClick={() => applyProviderView(view)}>
                {view.name}
                {view.isOwner === false && view.visibility && view.visibility !== "PRIVATE" && (
                  <span className="ml-1.5 opacity-60" title={view.visibility === "EVERYONE" ? "Shared with everyone" : view.visibility === "TEAM" ? "Shared with team" : "Shared with specific people"}>
                    {view.visibility === "EVERYONE" ? <Globe className="inline h-3 w-3" /> : view.visibility === "TEAM" ? <Users className="inline h-3 w-3" /> : <UserCog className="inline h-3 w-3" />}
                  </span>
                )}
              </button>
              {view.isOwner !== false && (
                <button
                  onClick={() => handleDeleteProviderView(view.id)}
                  title="Delete view"
                  className={cn("pr-2 pl-0.5 h-full transition-colors", activeViewId === view.id ? "hover:text-zinc-300" : "hover:text-red-500")}
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
                  onKeyDown={e => { if (e.key === "Enter") handleSaveProviderView(); if (e.key === "Escape") setShowSaveForm(false) }}
                  placeholder="View name..."
                  className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg outline-none focus:border-slate-400"
                />
                <ViewAccessSelector value={newViewAccess} onChange={setNewViewAccess} users={shareUsers} teams={shareTeams} />
                <div className="flex gap-2 pt-1">
                  <button onClick={handleSaveProviderView} disabled={savingView || !newViewName.trim()}
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
        </div>
      )}

      {/* ── Providers tab ──────────────────────────────────────────────────── */}
      {tab === "providers" && (() => {
        const filtered = filteredProviders
        return (
          <div className="bg-white border rounded-lg overflow-hidden">
            {filtered.length === 0 ? (
              <div className="px-6 py-10 text-center text-slate-400">
                {search || providerFiltersActive ? "No providers match your search or filters." : "No providers yet."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm table-fixed">
                  <colgroup>
                    <col style={{ width: provWidthOf("name") }} />
                    {provColReorder.order.map((c) => <col key={c.key} style={{ width: provWidthOf(c.key) }} />)}
                    {isAdmin && <col style={{ width: 80 }} />}
                  </colgroup>
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      <th style={frozenHeadStyle(provFmap.get("name"))} className={cn("px-4 py-2 font-semibold relative overflow-hidden transition-colors hover:bg-slate-100", frozenClass(provFmap.get("name"), "bg-slate-50"))}><span className="block truncate">Name</span><ColResizer onMouseDown={(e) => startResize("name", e)} /></th>
                      {provColReorder.order.map((c) => (
                        <th key={c.key}
                          {...provColReorder.handleProps(c.key)}
                          {...provColReorder.cardProps(c.key)}
                          style={frozenHeadStyle(provFmap.get(c.key))}
                          className={cn("px-4 py-2 font-semibold relative overflow-hidden cursor-grab active:cursor-grabbing transition-colors", c.key === "referrals" && "text-right", provColReorder.dragging === c.key ? "bg-slate-200/70" : cn("hover:bg-slate-100", frozenClass(provFmap.get(c.key), "bg-slate-50")))}>
                          <span className="block truncate">{c.label}</span><ColResizer onMouseDown={(e) => startResize(c.key, e)} />
                        </th>
                      ))}
                      {isAdmin && <th className="px-4 py-2 font-semibold text-right w-20"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                        <td style={{ maxWidth: provWidthOf("name"), ...frozenCellStyle(provFmap.get("name")) }} className={cn("px-4 py-2.5", frozenClass(provFmap.get("name")))}>
                          <Link href={`/referring-doctors/${d.id}`} className="font-medium text-slate-900 hover:text-blue-600">
                            {d.name}
                          </Link>
                        </td>
                        {provColReorder.order.map((c) => (
                          <td key={c.key} style={{ maxWidth: provWidthOf(c.key), ...frozenCellStyle(provFmap.get(c.key)) }} className={cn("px-4 py-2.5 truncate", PROV_CELL_CLASS[c.key] ?? "text-slate-500", frozenClass(provFmap.get(c.key)))}>
                            {renderProviderCell(d, c.key)}
                          </td>
                        ))}
                        {isAdmin && (
                          <td className="px-4 py-2.5">
                            <div className="flex gap-1 justify-end">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditDoctor({ doc: d, practice: d.practice })}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:bg-red-50" disabled={isPending} onClick={() => run(() => deleteDoctor(d.id))}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Practices tab ──────────────────────────────────────────────────── */}
      {tab === "practices" && <div className="space-y-3">
        {(() => {
          const q = search.toLowerCase().trim()
          const filtered = q
            ? practices.filter((p) =>
                p.name.toLowerCase().includes(q) ||
                p.doctors.some((d) => d.name.toLowerCase().includes(q))
              )
            : practices
          if (filtered.length === 0) return (
            <div className="bg-white border rounded-lg px-6 py-10 text-center text-slate-400">
              {q ? `No results for "${search}"` : "No referring practices yet. Add one above."}
            </div>
          )
          return filtered.map((p) => {
          const isExpanded = expandedPractice === p.id
          return (
            <div key={p.id} className="bg-white border rounded-lg overflow-hidden">
              {/* Practice header row */}
              <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                <button className="flex items-center gap-2 flex-1 text-left min-w-0" onClick={() => setExpandedPractice(isExpanded ? null : p.id)}>
                  <ChevronRight className={cn("h-4 w-4 text-slate-400 transition-transform shrink-0", isExpanded && "rotate-90")} />
                  <Building2 className="h-4 w-4 text-blue-500 shrink-0" />
                  <span className="font-semibold text-slate-900 truncate">{p.name}</span>
                  <span className="text-xs text-slate-400 shrink-0 ml-1">
                    {p.locations.length} loc · {p.doctors.length} prov · {p._count.referrals} ref
                  </span>
                </button>
                {p.phone && <span className="text-sm text-slate-500 hidden md:block shrink-0">{p.phone}</span>}
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-zinc-700 hover:bg-zinc-50" title="View / edit practice" asChild>
                    <Link href={`/practices/${p.id}`}><ExternalLink className="h-3.5 w-3.5" /></Link>
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50" title={`View reports for ${p.name}`} asChild>
                    <Link href={`/reports?practiceId=${p.id}`}><BarChart2 className="h-3.5 w-3.5" /></Link>
                  </Button>
                  {isAdmin && (
                    <>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-500 hover:bg-blue-50" title="Merge into another practice" onClick={() => { setMergePracticeTargetId(""); setMergePracticeFor(p) }}>
                        <Merge className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditPractice(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:bg-red-50" disabled={isPending} onClick={() => run(() => deletePractice(p.id))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Expanded panel */}
              {isExpanded && (
                <div className="border-t bg-slate-50 px-5 py-4 space-y-5">
                  {/* Locations */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5"><MapPin className="h-3 w-3" />Locations</p>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAddLocationFor(p)}>
                        <Plus className="h-3 w-3 mr-1" />Add Location
                      </Button>
                    </div>
                    {p.locations.length === 0 ? (
                      <p className="text-sm text-slate-400 pl-2 italic">No locations yet.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {p.locations.map((l) => (
                          <div key={l.id} className="flex items-center gap-2 bg-white border rounded-md px-3 py-2 text-sm">
                            <Link href={`/locations/${l.id}`} className="font-medium text-slate-800 hover:text-blue-600 flex-1 min-w-0 truncate">{l.name}</Link>
                            {l.phone && <span className="text-slate-500 text-xs hidden lg:block">{l.phone}</span>}
                            <span className="text-xs text-slate-400 shrink-0">{l._count.referrals} ref.</span>
                            {isAdmin && (
                              <div className="flex gap-1 shrink-0">
                                {p.locations.length > 1 && (
                                  <Button size="icon" variant="ghost" className="h-6 w-6 text-blue-500 hover:bg-blue-50" title="Merge into another location" onClick={() => { setMergeTargetId(""); setMergeLocationFor({ loc: l, practice: p }) }}>
                                    <Merge className="h-3 w-3" />
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditLocation({ loc: l, practice: p })}><Pencil className="h-3 w-3" /></Button>
                                <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:bg-red-50" disabled={isPending} onClick={() => run(() => deleteLocation(l.id))}><Trash2 className="h-3 w-3" /></Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Providers */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5"><User className="h-3 w-3" />Providers</p>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAddDoctorFor(p)}>
                        <Plus className="h-3 w-3 mr-1" />Add Provider
                      </Button>
                    </div>
                    {p.doctors.length === 0 ? (
                      <p className="text-sm text-slate-400 pl-2 italic">No providers yet.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {p.doctors.map((d) => (
                          <div key={d.id} className="flex items-center gap-2 bg-white border rounded-md px-3 py-2 text-sm">
                            <Link href={`/referring-doctors/${d.id}`} className="font-medium text-slate-900 hover:text-blue-600 flex-1 min-w-0 truncate">
                              {(d as any).title ? <span className="text-slate-500 font-normal">{(d as any).title} </span> : null}{d.name}
                            </Link>
                            <span className="text-xs text-slate-400 hidden sm:block shrink-0">
                              {(() => {
                                const practiceLocationIds = new Set(p.locations.map((l) => l.id))
                                const here = d.locations.filter((dl) => practiceLocationIds.has(dl.location.id))
                                return here.length > 0 ? here[0].location.name + (here.length > 1 ? ` +${here.length - 1}` : "") : "No locations"
                              })()}
                            </span>
                            <span className="text-xs text-slate-400 shrink-0">{d._count.referrals} ref.</span>
                            {isAdmin && (
                              <div className="flex gap-1 shrink-0">
                                {p.doctors.length > 1 && (
                                  <Button size="icon" variant="ghost" className="h-6 w-6 text-blue-500 hover:bg-blue-50" title="Merge into another provider" onClick={() => { setMergeDoctorTargetId(""); setMergeDoctorFor({ doc: d, practice: p }) }}>
                                    <Merge className="h-3 w-3" />
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditDoctor({ doc: d, practice: p })}><Pencil className="h-3 w-3" /></Button>
                                <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:bg-red-50" disabled={isPending} onClick={() => run(() => deleteDoctor(d.id))}><Trash2 className="h-3 w-3" /></Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })
        })()}
      </div>}

      {/* Dialogs */}
      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        subject="providers"
        defaultName="providers"
        getData={buildProviderExport}
      />

      <ColumnChooserModal
        open={colModalOpen}
        onClose={() => setColModalOpen(false)}
        columns={[{ key: "name", label: "Name" }, ...providerColumns]}
        required={["name"]}
        selected={visibleCols}
        frozen={frozenCount}
        onApply={(sel, fr) => { setVisibleCols(sel.filter((k) => k !== "name")); setFrozenCount(fr) }}
      />

      <Dialog open={!!editPractice} onOpenChange={(o) => !o && setEditPractice(null)}>
        <DialogContent><DialogHeader><DialogTitle>Edit Practice</DialogTitle></DialogHeader>
          {editPractice && <PracticeForm defaultValues={editPractice} onSubmit={async (d) => { run(() => updatePractice(editPractice.id, d)); setEditPractice(null) }} isPending={isPending} onClose={() => setEditPractice(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!addLocationFor} onOpenChange={(o) => !o && setAddLocationFor(null)}>
        <DialogContent><DialogHeader><DialogTitle>Add Location — {addLocationFor?.name}</DialogTitle></DialogHeader>
          {addLocationFor && <LocationForm practiceId={addLocationFor.id} onSubmit={async (d) => { run(() => createLocation(d)); setAddLocationFor(null) }} isPending={isPending} onClose={() => setAddLocationFor(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editLocation} onOpenChange={(o) => !o && setEditLocation(null)}>
        <DialogContent><DialogHeader><DialogTitle>Edit Location</DialogTitle></DialogHeader>
          {editLocation && <LocationForm practiceId={editLocation.practice.id} defaultValues={editLocation.loc} onSubmit={async (d) => { run(() => updateLocation(editLocation.loc.id, d)); setEditLocation(null) }} isPending={isPending} onClose={() => setEditLocation(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!addDoctorFor} onOpenChange={(o) => !o && setAddDoctorFor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Add Provider — {addDoctorFor?.name}</DialogTitle></DialogHeader>
          {addDoctorFor && <DoctorForm practiceId={addDoctorFor.id} locations={addDoctorFor.locations} onSubmit={async (d) => { run(() => createDoctor(d)); setAddDoctorFor(null) }} isPending={isPending} onClose={() => setAddDoctorFor(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editDoctor} onOpenChange={(o) => !o && setEditDoctor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Edit Provider</DialogTitle></DialogHeader>
          {editDoctor && <DoctorForm practiceId={editDoctor.practice.id} locations={editDoctor.practice.locations} defaultValues={{ ...editDoctor.doc, locationIds: editDoctor.doc.locations.map((dl) => dl.locationId) }} onSubmit={async (d) => { run(() => updateDoctor(editDoctor.doc.id, d)); setEditDoctor(null) }} isPending={isPending} onClose={() => setEditDoctor(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!mergePracticeFor} onOpenChange={(o) => !o && setMergePracticeFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Merge Practice</DialogTitle></DialogHeader>
          {mergePracticeFor && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Merge <span className="font-semibold">"{mergePracticeFor.name}"</span> into another practice.
                All locations, providers, and referrals will be moved to the target, then this practice will be deleted.
              </p>
              <div className="space-y-1.5">
                <Label>Merge into</Label>
                <SearchablePicker
                  placeholder="Search practices..."
                  value={mergePracticeTargetId}
                  onChange={setMergePracticeTargetId}
                  items={practices
                    .filter((p) => p.id !== mergePracticeFor.id)
                    .map((p) => ({ id: p.id, label: p.name, sub: `${p.locations.length} loc · ${p._count.referrals} ref` }))}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMergePracticeFor(null)}>Cancel</Button>
                <Button
                  disabled={!mergePracticeTargetId || isPending}
                  onClick={() => {
                    if (!mergePracticeTargetId) return
                    run(() => mergePractice(mergePracticeFor.id, mergePracticeTargetId))
                    setMergePracticeFor(null)
                  }}
                >
                  {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Merge &amp; Delete Duplicate
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!mergeLocationFor} onOpenChange={(o) => !o && setMergeLocationFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Merge Location</DialogTitle></DialogHeader>
          {mergeLocationFor && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Merge <span className="font-semibold">"{mergeLocationFor.loc.name}"</span> into another location.
                All referrals and provider links will be re-pointed to the target, then this location will be deleted.
              </p>
              <div className="space-y-1.5">
                <Label>Merge into</Label>
                <SearchablePicker
                  placeholder="Search locations..."
                  value={mergeTargetId}
                  onChange={setMergeTargetId}
                  items={mergeLocationFor.practice.locations
                    .filter((l) => l.id !== mergeLocationFor.loc.id)
                    .map((l) => ({ id: l.id, label: l.name, sub: l.address ?? undefined }))}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMergeLocationFor(null)}>Cancel</Button>
                <Button
                  disabled={!mergeTargetId || isPending}
                  onClick={() => {
                    if (!mergeTargetId) return
                    run(() => mergeLocation(mergeLocationFor.loc.id, mergeTargetId))
                    setMergeLocationFor(null)
                  }}
                >
                  {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Merge &amp; Delete Duplicate
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!mergeDoctorFor} onOpenChange={(o) => !o && setMergeDoctorFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Merge Provider</DialogTitle></DialogHeader>
          {mergeDoctorFor && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Merge <span className="font-semibold">"{mergeDoctorFor.doc.name}"</span> into another provider.
                All referrals and location links will be moved to the target, then this provider will be deleted.
                You can merge across organizations.
              </p>
              <div className="space-y-1.5">
                <Label>Merge into</Label>
                <SearchablePicker
                  placeholder="Search providers..."
                  value={mergeDoctorTargetId}
                  onChange={setMergeDoctorTargetId}
                  items={practices.flatMap((p) =>
                    p.doctors
                      .filter((d) => d.id !== mergeDoctorFor.doc.id)
                      .map((d) => ({
                        id: d.id,
                        label: `${(d as any).title ? `${(d as any).title} ` : ""}${d.name}`,
                        sub: p.name,
                      }))
                  )}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMergeDoctorFor(null)}>Cancel</Button>
                <Button
                  disabled={!mergeDoctorTargetId || isPending}
                  onClick={() => {
                    if (!mergeDoctorTargetId) return
                    run(() => mergeDoctor(mergeDoctorFor.doc.id, mergeDoctorTargetId))
                    setMergeDoctorFor(null)
                  }}
                >
                  {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Merge &amp; Delete Duplicate
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
