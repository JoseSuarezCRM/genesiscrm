"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Trash2, Plus, Loader2, Check, MapPin, User, Phone, Mail, ExternalLink, X } from "lucide-react"
import {
  updatePractice, deleteLocation, createLocation, updateLocation,
  createDoctor, updateDoctor, deleteDoctor,
} from "@/app/actions/referring-doctors"
import { PhoneInput } from "@/components/ui/phone-input"
import Link from "next/link"

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
  isAdmin: boolean
}

const PROVIDER_TITLES = ["MD", "DO", "NP", "PA-C", "DPM", "DC", "PT", "OT", "RN", "Other"]

// ─── Shared input styles ───────────────────────────────────────────────────────

const inputCls = "h-9 w-full px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 bg-white transition-colors"
const labelCls = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1"

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({ title, count, children, action }: {
  title: string
  count?: number
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="bg-white border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-100 bg-zinc-50">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-slate-800">{title}</h2>
          {count !== undefined && <span className="text-xs text-slate-400">{count}</span>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ─── Inline form helpers ───────────────────────────────────────────────────────

function InlineForm({ onCancel, onSubmit, isPending, children }: {
  onCancel: () => void
  onSubmit: (e: React.FormEvent) => void
  isPending: boolean
  children: React.ReactNode
}) {
  return (
    <form onSubmit={onSubmit} className="border border-zinc-200 rounded-xl p-4 space-y-3 bg-slate-50">
      {children}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="h-8 px-4 text-sm font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50 flex items-center gap-1.5"
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Save
        </button>
        <button type="button" onClick={onCancel} className="h-8 px-3 text-sm text-zinc-500 hover:text-zinc-800 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function PracticeDetailClient({ practice, isAdmin }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Practice edit
  const [editingPractice, setEditingPractice] = useState(false)
  const [pracName, setPracName] = useState(practice.name)
  const [pracPhone, setPracPhone] = useState(practice.phone ?? "")
  const [pracFax, setPracFax] = useState(practice.fax ?? "")
  const [pracAddress, setPracAddress] = useState(practice.address ?? "")

  // Location states
  const [addingLocation, setAddingLocation] = useState(false)
  const [editingLocId, setEditingLocId] = useState<string | null>(null)
  const [locForm, setLocForm] = useState({ name: "", phone: "", fax: "", address: "" })

  // Doctor states
  const [addingDoctor, setAddingDoctor] = useState(false)
  const [editingDocId, setEditingDocId] = useState<string | null>(null)
  const [docForm, setDocForm] = useState({ name: "", title: "", npi: "", specialty: "", phone: "", email: "", locationIds: [] as string[] })

  function refresh() { router.refresh() }

  // ── Practice ──────────────────────────────────────────────────────────────

  function savePractice(e: React.FormEvent) {
    e.preventDefault()
    if (!pracName.trim()) return
    startTransition(async () => {
      await updatePractice(practice.id, { name: pracName, phone: pracPhone, fax: pracFax, address: pracAddress })
      setEditingPractice(false)
      refresh()
    })
  }

  // ── Locations ────────────────────────────────────────────────────────────

  function startEditLoc(loc: Location) {
    setEditingLocId(loc.id)
    setLocForm({ name: loc.name, phone: loc.phone ?? "", fax: loc.fax ?? "", address: loc.address ?? "" })
    setAddingLocation(false)
  }

  function saveLocation(e: React.FormEvent) {
    e.preventDefault()
    if (!locForm.name.trim()) return
    startTransition(async () => {
      if (editingLocId) {
        await updateLocation(editingLocId, locForm)
        setEditingLocId(null)
      } else {
        await createLocation({ ...locForm, practiceId: practice.id })
        setAddingLocation(false)
      }
      setLocForm({ name: "", phone: "", fax: "", address: "" })
      refresh()
    })
  }

  function deleteLoc(id: string) {
    if (!confirm("Delete this location?")) return
    startTransition(async () => {
      const r = await deleteLocation(id) as any
      if (r?.error) alert(r.error)
      else refresh()
    })
  }

  // ── Doctors ──────────────────────────────────────────────────────────────

  function startEditDoc(doc: Doctor) {
    setEditingDocId(doc.id)
    setDocForm({
      name: doc.name,
      title: doc.title ?? "",
      npi: doc.npi ?? "",
      specialty: doc.specialty ?? "",
      phone: doc.phone ?? "",
      email: doc.email ?? "",
      locationIds: doc.locations.map((l) => l.location.id),
    })
    setAddingDoctor(false)
  }

  function toggleDocLoc(id: string) {
    setDocForm((f) => ({
      ...f,
      locationIds: f.locationIds.includes(id) ? f.locationIds.filter((x) => x !== id) : [...f.locationIds, id],
    }))
  }

  function saveDoctor(e: React.FormEvent) {
    e.preventDefault()
    if (!docForm.name.trim()) return
    startTransition(async () => {
      if (editingDocId) {
        await updateDoctor(editingDocId, { ...docForm, practiceId: practice.id })
        setEditingDocId(null)
      } else {
        await createDoctor({ ...docForm, practiceId: practice.id })
        setAddingDoctor(false)
      }
      setDocForm({ name: "", title: "", npi: "", specialty: "", phone: "", email: "", locationIds: [] })
      refresh()
    })
  }

  function deleteDoc(id: string) {
    if (!confirm("Delete this provider?")) return
    startTransition(async () => {
      const r = await deleteDoctor(id) as any
      if (r?.error) alert(r.error)
      else refresh()
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Practice Info ── */}
      <SectionCard
        title="Practice Information"
        action={isAdmin && !editingPractice ? (
          <button onClick={() => setEditingPractice(true)} className="h-7 w-7 flex items-center justify-center text-zinc-400 hover:text-zinc-700 rounded-lg transition-colors">
            <Pencil className="h-3.5 w-3.5" />
          </button>
        ) : undefined}
      >
        {editingPractice ? (
          <InlineForm onCancel={() => setEditingPractice(false)} onSubmit={savePractice} isPending={isPending}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={labelCls}>Practice Name *</label><input value={pracName} onChange={(e) => setPracName(e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>Phone</label><PhoneInput value={pracPhone} onChange={setPracPhone} /></div>
              <div><label className={labelCls}>Fax</label><input value={pracFax} onChange={(e) => setPracFax(e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>Address</label><input value={pracAddress} onChange={(e) => setPracAddress(e.target.value)} className={inputCls} /></div>
            </div>
          </InlineForm>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-8 text-sm">
            <InfoRow label="Phone" value={practice.phone} />
            <InfoRow label="Fax" value={practice.fax} />
            <InfoRow label="Address" value={practice.address} span />
          </div>
        )}
      </SectionCard>

      {/* ── Locations ── */}
      <SectionCard
        title="Locations"
        count={practice.locations.length}
        action={isAdmin ? (
          <button
            onClick={() => { setAddingLocation((v) => !v); setEditingLocId(null); setLocForm({ name: "", phone: "", fax: "", address: "" }) }}
            className="flex items-center gap-1 h-7 px-2.5 text-xs font-medium border border-zinc-200 rounded-lg text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        ) : undefined}
      >
        <div className="space-y-3">
          {addingLocation && (
            <InlineForm onCancel={() => setAddingLocation(false)} onSubmit={saveLocation} isPending={isPending}>
              <LocationFormFields form={locForm} onChange={setLocForm} />
            </InlineForm>
          )}

          {practice.locations.length === 0 && !addingLocation && (
            <p className="text-sm text-slate-400">No locations yet.</p>
          )}

          {practice.locations.map((loc) => (
            <div key={loc.id}>
              {editingLocId === loc.id ? (
                <InlineForm onCancel={() => setEditingLocId(null)} onSubmit={saveLocation} isPending={isPending}>
                  <LocationFormFields form={locForm} onChange={setLocForm} />
                </InlineForm>
              ) : (
                <div className="flex items-start justify-between gap-4 p-3 rounded-xl border border-zinc-100 hover:border-zinc-200 transition-colors">
                  <div className="flex items-start gap-3 min-w-0">
                    <MapPin className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 text-sm">{loc.name}</p>
                      {loc.address && <p className="text-xs text-slate-500 truncate">{loc.address}</p>}
                      <div className="flex gap-3 mt-0.5">
                        {loc.phone && <span className="text-xs text-slate-400">{loc.phone}</span>}
                        {loc.fax && <span className="text-xs text-slate-400">fax {loc.fax}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-slate-400 mr-1">{loc._count.referrals} ref</span>
                    {isAdmin && (
                      <>
                        <button onClick={() => startEditLoc(loc)} className="h-7 w-7 flex items-center justify-center text-zinc-400 hover:text-zinc-700 rounded-lg transition-colors"><Pencil className="h-3 w-3" /></button>
                        <button onClick={() => deleteLoc(loc.id)} className="h-7 w-7 flex items-center justify-center text-zinc-400 hover:text-red-500 rounded-lg transition-colors"><Trash2 className="h-3 w-3" /></button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── Providers ── */}
      <SectionCard
        title="Providers"
        count={practice.doctors.length}
        action={isAdmin ? (
          <button
            onClick={() => { setAddingDoctor((v) => !v); setEditingDocId(null); setDocForm({ name: "", title: "", npi: "", specialty: "", phone: "", email: "", locationIds: [] }) }}
            className="flex items-center gap-1 h-7 px-2.5 text-xs font-medium border border-zinc-200 rounded-lg text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        ) : undefined}
      >
        <div className="space-y-3">
          {addingDoctor && (
            <InlineForm onCancel={() => setAddingDoctor(false)} onSubmit={saveDoctor} isPending={isPending}>
              <DoctorFormFields form={docForm} onChange={setDocForm} locations={practice.locations} onToggleLoc={toggleDocLoc} />
            </InlineForm>
          )}

          {practice.doctors.length === 0 && !addingDoctor && (
            <p className="text-sm text-slate-400">No providers yet.</p>
          )}

          {practice.doctors.map((doc) => (
            <div key={doc.id}>
              {editingDocId === doc.id ? (
                <InlineForm onCancel={() => setEditingDocId(null)} onSubmit={saveDoctor} isPending={isPending}>
                  <DoctorFormFields form={docForm} onChange={setDocForm} locations={practice.locations} onToggleLoc={toggleDocLoc} />
                </InlineForm>
              ) : (
                <div className="flex items-start justify-between gap-4 p-3 rounded-xl border border-zinc-100 hover:border-zinc-200 transition-colors">
                  <div className="flex items-start gap-3 min-w-0">
                    <User className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link href={`/referring-doctors/${doc.id}`} className="font-medium text-slate-800 text-sm hover:text-blue-600 transition-colors">
                          {doc.title ? `${doc.name}, ${doc.title}` : doc.name}
                        </Link>
                        <ExternalLink className="h-3 w-3 text-slate-300" />
                      </div>
                      {doc.specialty && <p className="text-xs text-slate-500">{doc.specialty}</p>}
                      <div className="flex flex-wrap gap-2 mt-1">
                        {doc.phone && (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                            <Phone className="h-3 w-3" />{doc.phone}
                          </span>
                        )}
                        {doc.email && (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                            <Mail className="h-3 w-3" />{doc.email}
                          </span>
                        )}
                      </div>
                      {doc.locations.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {doc.locations.map((l) => (
                            <span key={l.location.id} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                              <MapPin className="h-2.5 w-2.5" />{l.location.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-slate-400 mr-1">{doc._count.referrals} ref</span>
                    {isAdmin && (
                      <>
                        <button onClick={() => startEditDoc(doc)} className="h-7 w-7 flex items-center justify-center text-zinc-400 hover:text-zinc-700 rounded-lg transition-colors"><Pencil className="h-3 w-3" /></button>
                        <button onClick={() => deleteDoc(doc.id)} className="h-7 w-7 flex items-center justify-center text-zinc-400 hover:text-red-500 rounded-lg transition-colors"><Trash2 className="h-3 w-3" /></button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

// ─── Sub-form field sets ───────────────────────────────────────────────────────

function InfoRow({ label, value, span }: { label: string; value: string | null | undefined; span?: boolean }) {
  return (
    <div className={span ? "sm:col-span-2" : ""}>
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
      <p className="text-slate-800 mt-0.5">{value ?? <span className="text-slate-400">—</span>}</p>
    </div>
  )
}

function LocationFormFields({
  form, onChange,
}: {
  form: { name: string; phone: string; fax: string; address: string }
  onChange: (f: any) => void
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div><label className={labelCls}>Location Name *</label><input value={form.name} onChange={(e) => onChange((f: any) => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="Main Office" /></div>
      <div><label className={labelCls}>Phone</label><PhoneInput value={form.phone} onChange={(v) => onChange((f: any) => ({ ...f, phone: v }))} /></div>
      <div><label className={labelCls}>Fax</label><input value={form.fax} onChange={(e) => onChange((f: any) => ({ ...f, fax: e.target.value }))} className={inputCls} /></div>
      <div><label className={labelCls}>Address</label><input value={form.address} onChange={(e) => onChange((f: any) => ({ ...f, address: e.target.value }))} className={inputCls} /></div>
    </div>
  )
}

function DoctorFormFields({
  form, onChange, locations, onToggleLoc,
}: {
  form: { name: string; title: string; npi: string; specialty: string; phone: string; email: string; locationIds: string[] }
  onChange: (f: any) => void
  locations: Location[]
  onToggleLoc: (id: string) => void
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className={labelCls}>Name *</label><input value={form.name} onChange={(e) => onChange((f: any) => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="Sarah Johnson" /></div>
        <div>
          <label className={labelCls}>Title</label>
          <select value={form.title} onChange={(e) => onChange((f: any) => ({ ...f, title: e.target.value }))} className={inputCls}>
            <option value="">— Select —</option>
            {PROVIDER_TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div><label className={labelCls}>NPI</label><input value={form.npi} onChange={(e) => onChange((f: any) => ({ ...f, npi: e.target.value }))} className={inputCls} maxLength={10} /></div>
        <div><label className={labelCls}>Specialty</label><input value={form.specialty} onChange={(e) => onChange((f: any) => ({ ...f, specialty: e.target.value }))} className={inputCls} /></div>
        <div><label className={labelCls}>Phone</label><PhoneInput value={form.phone} onChange={(v) => onChange((f: any) => ({ ...f, phone: v }))} /></div>
        <div><label className={labelCls}>Email</label><input type="email" value={form.email} onChange={(e) => onChange((f: any) => ({ ...f, email: e.target.value }))} className={inputCls} /></div>
      </div>
      {locations.length > 0 && (
        <div>
          <label className={labelCls}>Locations</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {locations.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => onToggleLoc(l.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  form.locationIds.includes(l.id)
                    ? "bg-zinc-900 text-white border-zinc-900"
                    : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"
                }`}
              >
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
