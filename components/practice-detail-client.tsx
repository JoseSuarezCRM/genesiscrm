"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Trash2, Plus, Loader2, Check, MapPin, User, ExternalLink, ChevronRight, ChevronDown } from "lucide-react"
import {
  updatePractice, deleteLocation, createLocation, updateLocation,
  createDoctor, updateDoctor, deleteDoctor,
} from "@/app/actions/referring-doctors"
import { PhoneInput } from "@/components/ui/phone-input"
import { StatusBadge } from "@/components/status-badge"
import { formatDate } from "@/lib/utils"
import Link from "next/link"
import CustomPropertiesDisplay from "@/components/custom-properties-display"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Location {
  id: string
  name: string
  phone: string | null
  fax: string | null
  address: string | null
  _count: { referrals: number }
}

interface Doctor {
  id: string
  name: string
  title: string | null
  npi: string | null
  specialty: string | null
  phone: string | null
  email: string | null
  _count: { referrals: number }
  locations: { location: { id: string; name: string } }[]
}

interface Referral {
  id: string
  patientFirstName: string
  patientLastName: string
  referralDate: string | Date
  status: string
  referringDoctor: { id: string; name: string; title: string | null } | null
}

interface Practice {
  id: string
  name: string
  phone: string | null
  fax: string | null
  address: string | null
  locations: Location[]
  doctors: Doctor[]
}

interface Props {
  practice: Practice
  referrals: Referral[]
  isAdmin: boolean
  customProperties?: any[]
}

const PROVIDER_TITLES = ["MD", "DO", "NP", "PA-C", "DPM", "DC", "PT", "OT", "RN", "Other"]
const inputCls = "h-9 w-full px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 bg-white transition-colors"
const labelCls = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1"

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({ title, count, children, action }: {
  title: string; count?: number; children: React.ReactNode; action?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-white border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-zinc-100 bg-zinc-50">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 flex-1 text-left min-w-0">
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-150 shrink-0 ${open ? "" : "-rotate-90"}`} />
          <h2 className="font-semibold text-slate-800">{title}</h2>
          {count !== undefined && <span className="text-xs text-slate-400">{count}</span>}
        </button>
        {action}
      </div>
      {open && <div className="divide-y divide-zinc-100">{children}</div>}
    </div>
  )
}

// ─── Inline save form ─────────────────────────────────────────────────────────

function InlineForm({ onCancel, onSubmit, isPending, children }: {
  onCancel: () => void; onSubmit: (e: React.FormEvent) => void
  isPending: boolean; children: React.ReactNode
}) {
  return (
    <form onSubmit={onSubmit} className="p-4 space-y-3 bg-slate-50 border-b border-zinc-200">
      {children}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={isPending}
          className="h-8 px-4 text-sm font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50 flex items-center gap-1.5">
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Save
        </button>
        <button type="button" onClick={onCancel} className="h-8 px-3 text-sm text-zinc-500 hover:text-zinc-800 transition-colors">Cancel</button>
      </div>
    </form>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function PracticeDetailClient({ practice, referrals, isAdmin, customProperties }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Practice edit
  const [editingPractice, setEditingPractice] = useState(false)
  const [pracName, setPracName] = useState(practice.name)
  const [pracPhone, setPracPhone] = useState(practice.phone ?? "")
  const [pracFax, setPracFax] = useState(practice.fax ?? "")
  const [pracAddress, setPracAddress] = useState(practice.address ?? "")

  // Location
  const [addingLocation, setAddingLocation] = useState(false)
  const [editingLocId, setEditingLocId] = useState<string | null>(null)
  const [locForm, setLocForm] = useState({ name: "", phone: "", fax: "", address: "" })

  // Doctor
  const [addingDoctor, setAddingDoctor] = useState(false)
  const [editingDocId, setEditingDocId] = useState<string | null>(null)
  const [docForm, setDocForm] = useState({ name: "", title: "", npi: "", specialty: "", phone: "", email: "", locationIds: [] as string[] })

  function refresh() { router.refresh() }

  // Practice save
  function savePractice(e: React.FormEvent) {
    e.preventDefault()
    if (!pracName.trim()) return
    startTransition(async () => {
      await updatePractice(practice.id, { name: pracName, phone: pracPhone, fax: pracFax, address: pracAddress })
      setEditingPractice(false)
      refresh()
    })
  }

  // Location saves
  function startEditLoc(loc: Location) {
    setEditingLocId(loc.id)
    setLocForm({ name: loc.name, phone: loc.phone ?? "", fax: loc.fax ?? "", address: loc.address ?? "" })
    setAddingLocation(false)
  }

  function saveLocation(e: React.FormEvent) {
    e.preventDefault()
    if (!locForm.name.trim()) return
    startTransition(async () => {
      if (editingLocId) { await updateLocation(editingLocId, locForm); setEditingLocId(null) }
      else { await createLocation({ ...locForm, practiceId: practice.id }); setAddingLocation(false) }
      setLocForm({ name: "", phone: "", fax: "", address: "" })
      refresh()
    })
  }

  function deleteLoc(id: string) {
    if (!confirm("Delete this location?")) return
    startTransition(async () => {
      const r = await deleteLocation(id) as any
      if (r?.error) alert(r.error); else refresh()
    })
  }

  // Doctor saves
  function startEditDoc(doc: Doctor) {
    setEditingDocId(doc.id)
    setDocForm({ name: doc.name, title: doc.title ?? "", npi: doc.npi ?? "", specialty: doc.specialty ?? "", phone: doc.phone ?? "", email: doc.email ?? "", locationIds: doc.locations.map((l) => l.location.id) })
    setAddingDoctor(false)
  }

  function saveDoctor(e: React.FormEvent) {
    e.preventDefault()
    if (!docForm.name.trim()) return
    startTransition(async () => {
      if (editingDocId) { await updateDoctor(editingDocId, { ...docForm, practiceId: practice.id }); setEditingDocId(null) }
      else { await createDoctor({ ...docForm, practiceId: practice.id }); setAddingDoctor(false) }
      setDocForm({ name: "", title: "", npi: "", specialty: "", phone: "", email: "", locationIds: [] })
      refresh()
    })
  }

  function deleteDoc(id: string) {
    if (!confirm("Delete this provider?")) return
    startTransition(async () => {
      const r = await deleteDoctor(id) as any
      if (r?.error) alert(r.error); else refresh()
    })
  }

  const addBtn = (label: string, onClick: () => void) => (
    <button onClick={onClick}
      className="flex items-center gap-1 h-7 px-2.5 text-xs font-medium border border-zinc-200 rounded-lg text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 transition-all">
      <Plus className="h-3.5 w-3.5" />{label}
    </button>
  )

  return (
    <div className="space-y-6">

      {/* ── Practice Info ── */}
      <SectionCard
        title="Practice Information"
        action={isAdmin && !editingPractice
          ? <button onClick={() => setEditingPractice(true)} className="h-7 w-7 flex items-center justify-center text-zinc-400 hover:text-zinc-700 rounded-lg transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
          : undefined}
      >
        {editingPractice ? (
          <InlineForm onCancel={() => setEditingPractice(false)} onSubmit={savePractice} isPending={isPending}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={labelCls}>Name *</label><input value={pracName} onChange={(e) => setPracName(e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>Phone</label><PhoneInput value={pracPhone} onChange={setPracPhone} /></div>
              <div><label className={labelCls}>Fax</label><input value={pracFax} onChange={(e) => setPracFax(e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>Address</label><input value={pracAddress} onChange={(e) => setPracAddress(e.target.value)} className={inputCls} /></div>
            </div>
          </InlineForm>
        ) : (
          <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-3 text-sm">
            <InfoRow label="Phone" value={practice.phone} />
            <InfoRow label="Fax" value={practice.fax} />
            <InfoRow label="Address" value={practice.address} />
          </div>
        )}
      </SectionCard>

      {/* ── Custom Properties ── */}
      {customProperties && customProperties.length > 0 && (
        <div className="bg-white border rounded-xl p-5">
          <CustomPropertiesDisplay
            entityType="PRACTICE"
            entityId={practice.id}
            properties={customProperties}
          />
        </div>
      )}

      {/* ── Locations ── */}
      <SectionCard title="Locations" count={practice.locations.length}
        action={isAdmin ? addBtn("Add", () => { setAddingLocation((v) => !v); setEditingLocId(null); setLocForm({ name: "", phone: "", fax: "", address: "" }) }) : undefined}>
        {addingLocation && (
          <InlineForm onCancel={() => setAddingLocation(false)} onSubmit={saveLocation} isPending={isPending}>
            <LocationFormFields form={locForm} onChange={setLocForm} />
          </InlineForm>
        )}
        {practice.locations.length === 0 && !addingLocation && (
          <p className="px-5 py-4 text-sm text-slate-400">No locations yet.</p>
        )}
        {practice.locations.map((loc) => (
          <div key={loc.id}>
            {editingLocId === loc.id ? (
              <InlineForm onCancel={() => setEditingLocId(null)} onSubmit={saveLocation} isPending={isPending}>
                <LocationFormFields form={locForm} onChange={setLocForm} />
              </InlineForm>
            ) : (
              <div className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                <MapPin className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                <span className="flex-1 text-sm text-slate-700 truncate">{loc.name}</span>
                <span className="text-xs text-slate-400 shrink-0">{loc._count.referrals} ref</span>
                {isAdmin && (
                  <>
                    <button onClick={() => startEditLoc(loc)} className="h-7 w-7 flex items-center justify-center text-zinc-300 hover:text-zinc-700 rounded transition-colors"><Pencil className="h-3 w-3" /></button>
                    <button onClick={() => deleteLoc(loc.id)} className="h-7 w-7 flex items-center justify-center text-zinc-300 hover:text-red-500 rounded transition-colors"><Trash2 className="h-3 w-3" /></button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </SectionCard>

      {/* ── Providers ── */}
      <SectionCard title="Providers" count={practice.doctors.length}
        action={isAdmin ? addBtn("Add", () => { setAddingDoctor((v) => !v); setEditingDocId(null); setDocForm({ name: "", title: "", npi: "", specialty: "", phone: "", email: "", locationIds: [] }) }) : undefined}>
        {addingDoctor && (
          <InlineForm onCancel={() => setAddingDoctor(false)} onSubmit={saveDoctor} isPending={isPending}>
            <DoctorFormFields form={docForm} onChange={setDocForm} locations={practice.locations} onToggleLoc={(id) => setDocForm((f) => ({ ...f, locationIds: f.locationIds.includes(id) ? f.locationIds.filter((x) => x !== id) : [...f.locationIds, id] }))} />
          </InlineForm>
        )}
        {practice.doctors.length === 0 && !addingDoctor && (
          <p className="px-5 py-4 text-sm text-slate-400">No providers yet.</p>
        )}
        {practice.doctors.map((doc) => (
          <div key={doc.id}>
            {editingDocId === doc.id ? (
              <InlineForm onCancel={() => setEditingDocId(null)} onSubmit={saveDoctor} isPending={isPending}>
                <DoctorFormFields form={docForm} onChange={setDocForm} locations={practice.locations} onToggleLoc={(id) => setDocForm((f) => ({ ...f, locationIds: f.locationIds.includes(id) ? f.locationIds.filter((x) => x !== id) : [...f.locationIds, id] }))} />
              </InlineForm>
            ) : (
              <div className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                <User className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                <Link href={`/referring-doctors/${doc.id}`} className="flex-1 text-sm font-medium text-slate-700 hover:text-blue-600 transition-colors truncate flex items-center gap-1.5">
                  {doc.title ? `${doc.name}, ${doc.title}` : doc.name}
                  <ExternalLink className="h-3 w-3 text-slate-300 shrink-0" />
                </Link>
                <span className="text-xs text-slate-400 shrink-0">{doc._count.referrals} ref</span>
                {isAdmin && (
                  <>
                    <button onClick={() => startEditDoc(doc)} className="h-7 w-7 flex items-center justify-center text-zinc-300 hover:text-zinc-700 rounded transition-colors"><Pencil className="h-3 w-3" /></button>
                    <button onClick={() => deleteDoc(doc.id)} className="h-7 w-7 flex items-center justify-center text-zinc-300 hover:text-red-500 rounded transition-colors"><Trash2 className="h-3 w-3" /></button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </SectionCard>

      {/* ── Referrals ── */}
      <SectionCard title="Referrals" count={referrals.length}>
        {referrals.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-400">No referrals yet.</p>
        ) : (
          referrals.map((r) => (
            <Link key={r.id} href={`/referrals/${r.id}`}
              className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50 transition-colors group">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 group-hover:text-blue-600 transition-colors truncate">
                  {r.patientFirstName} {r.patientLastName}
                </p>
                {r.referringDoctor && (
                  <p className="text-xs text-slate-400 truncate">
                    {r.referringDoctor.title ? `${r.referringDoctor.name}, ${r.referringDoctor.title}` : r.referringDoctor.name}
                  </p>
                )}
              </div>
              <span className="text-xs text-slate-400 shrink-0">{formatDate(r.referralDate)}</span>
              <StatusBadge status={r.status as any} />
              <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500 shrink-0" />
            </Link>
          ))
        )}
      </SectionCard>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-slate-800 mt-0.5">{value ?? <span className="text-slate-400">—</span>}</p>
    </div>
  )
}

function LocationFormFields({ form, onChange }: { form: { name: string; phone: string; fax: string; address: string }; onChange: (f: any) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div><label className={labelCls}>Location Name *</label><input value={form.name} onChange={(e) => onChange((f: any) => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="Main Office" /></div>
      <div><label className={labelCls}>Phone</label><PhoneInput value={form.phone} onChange={(v) => onChange((f: any) => ({ ...f, phone: v }))} /></div>
      <div><label className={labelCls}>Fax</label><input value={form.fax} onChange={(e) => onChange((f: any) => ({ ...f, fax: e.target.value }))} className={inputCls} /></div>
      <div><label className={labelCls}>Address</label><input value={form.address} onChange={(e) => onChange((f: any) => ({ ...f, address: e.target.value }))} className={inputCls} /></div>
    </div>
  )
}

function DoctorFormFields({ form, onChange, locations, onToggleLoc }: {
  form: { name: string; title: string; npi: string; specialty: string; phone: string; email: string; locationIds: string[] }
  onChange: (f: any) => void; locations: Location[]; onToggleLoc: (id: string) => void
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className={labelCls}>Name *</label><input value={form.name} onChange={(e) => onChange((f: any) => ({ ...f, name: e.target.value }))} className={inputCls} /></div>
        <div>
          <label className={labelCls}>Title</label>
          <select value={form.title} onChange={(e) => onChange((f: any) => ({ ...f, title: e.target.value }))} className={inputCls}>
            <option value="">— Select —</option>
            {PROVIDER_TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div><label className={labelCls}>NPI</label><input value={form.npi} onChange={(e) => onChange((f: any) => ({ ...f, npi: e.target.value }))} className={inputCls} maxLength={10} /></div>
        <div><label className={labelCls}>Phone</label><PhoneInput value={form.phone} onChange={(v) => onChange((f: any) => ({ ...f, phone: v }))} /></div>
        <div><label className={labelCls}>Email</label><input type="email" value={form.email} onChange={(e) => onChange((f: any) => ({ ...f, email: e.target.value }))} className={inputCls} /></div>
      </div>
      {locations.length > 0 && (
        <div>
          <label className={labelCls}>Locations</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {locations.map((l) => (
              <button key={l.id} type="button" onClick={() => onToggleLoc(l.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${form.locationIds.includes(l.id) ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"}`}>
                {form.locationIds.includes(l.id) && <Check className="h-3 w-3" />}
                {l.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
