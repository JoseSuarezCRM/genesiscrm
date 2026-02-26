"use client"

import { useState, useTransition } from "react"
import { ReferringPractice, PracticeLocation, ReferringDoctor, DoctorLocation } from "@prisma/client"
import {
  createPractice, updatePractice, deletePractice,
  createLocation, updateLocation, deleteLocation,
  createDoctor, updateDoctor, deleteDoctor,
} from "@/app/actions/referring-doctors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog"
import { Plus, Pencil, Trash2, Loader2, ChevronRight, MapPin, User, Building2, ExternalLink } from "lucide-react"
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

interface Props {
  practices: PracticeWithRelations[]
  isAdmin: boolean
}

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
      <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="555-100-2000" /></Field>
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
      <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="555-100-2002" /></Field>
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

const PROVIDER_TITLES = ["MD", "DO", "NP", "PA-C", "DPM", "DC", "PT", "OT", "RN", "Other"]

function DoctorForm({ practiceId, locations, defaultValues, onSubmit, isPending, onClose }: {
  practiceId: string
  locations: LocationWithCount[]
  defaultValues?: Partial<ReferringDoctor> & { locationIds?: string[] }
  onSubmit: (d: { name: string; title: string; npi: string; specialty: string; phone: string; email: string; practiceId: string; locationIds: string[] }) => Promise<void>
  isPending: boolean
  onClose: () => void
}) {
  const [name, setName] = useState(defaultValues?.name ?? "")
  const [title, setTitle] = useState((defaultValues as any)?.title ?? "")
  const [npi, setNpi] = useState((defaultValues as any)?.npi ?? "")
  const [specialty, setSpecialty] = useState(defaultValues?.specialty ?? "")
  const [phone, setPhone] = useState(defaultValues?.phone ?? "")
  const [email, setEmail] = useState(defaultValues?.email ?? "")
  const [selectedLocs, setSelectedLocs] = useState<string[]>(defaultValues?.locationIds ?? [])
  const [err, setErr] = useState("")

  function toggleLoc(id: string) {
    setSelectedLocs((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  return (
    <form onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) { setErr("Required"); return } await onSubmit({ name, title, npi, specialty, phone, email, practiceId, locationIds: selectedLocs }) }} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Provider Name *" error={err}>
          <Input value={name} onChange={(e) => { setName(e.target.value); setErr("") }} placeholder="Sarah Johnson" />
        </Field>
        <Field label="Title">
          <select
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">— Select —</option>
            {PROVIDER_TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      </div>
      <Field label="NPI (National Provider Identifier)">
        <Input value={npi} onChange={(e) => setNpi(e.target.value)} placeholder="1234567890" maxLength={10} />
      </Field>
      <Field label="Specialty"><Input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Orthopedic Surgery" /></Field>
      <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="555-100-2000" /></Field>
      <Field label="Email"><Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="dr.johnson@clinic.com" /></Field>
      <div className="space-y-1.5">
        <Label>Locations (check all that apply)</Label>
        {locations.length === 0 ? (
          <p className="text-sm text-slate-400 italic">Add locations to this practice first.</p>
        ) : (
          <div className="space-y-2 border rounded-md p-3">
            {locations.map((l) => (
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

// ─── Main Component ────────────────────────────────────────────────────────────

export default function PracticeManager({ practices, isAdmin }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [expandedPractice, setExpandedPractice] = useState<string | null>(null)

  const [addPracticeOpen, setAddPracticeOpen] = useState(false)
  const [editPractice, setEditPractice] = useState<PracticeWithRelations | null>(null)
  const [addLocationFor, setAddLocationFor] = useState<PracticeWithRelations | null>(null)
  const [editLocation, setEditLocation] = useState<{ loc: LocationWithCount; practice: PracticeWithRelations } | null>(null)
  const [addDoctorFor, setAddDoctorFor] = useState<PracticeWithRelations | null>(null)
  const [editDoctor, setEditDoctor] = useState<{ doc: DoctorWithRelations; practice: PracticeWithRelations } | null>(null)

  function run(fn: () => Promise<{ success?: boolean; error?: string | object } | undefined>) {
    startTransition(async () => {
      const result = await fn()
      if (result?.error) setError(typeof result.error === "string" ? result.error : "Validation error")
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md flex-1 mr-4">
            {error} <button className="ml-2 underline" onClick={() => setError(null)}>Dismiss</button>
          </p>
        )}
        <div className="ml-auto">
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
        </div>
      </div>

      <div className="space-y-3">
        {practices.length === 0 && (
          <div className="bg-white border rounded-lg px-6 py-10 text-center text-slate-400">No referring practices yet. Add one above.</div>
        )}
        {practices.map((p) => {
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
                {isAdmin && (
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditPractice(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:bg-red-50" disabled={isPending} onClick={() => run(() => deletePractice(p.id))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
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
                            <span className="font-medium text-slate-800 flex-1 min-w-0 truncate">{l.name}</span>
                            {l.address && <span className="text-slate-500 text-xs hidden md:block truncate max-w-xs">{l.address}</span>}
                            {l.phone && <span className="text-slate-500 text-xs hidden lg:block">{l.phone}</span>}
                            <span className="text-xs text-slate-400 shrink-0">{l._count.referrals} ref.</span>
                            {isAdmin && (
                              <div className="flex gap-1 shrink-0">
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
                            <Link href={`/referring-doctors/${d.id}`} className="font-medium text-blue-600 hover:underline flex-1 min-w-0 truncate flex items-center gap-1">
                              {(d as any).title ? <span className="text-slate-500 font-normal">{(d as any).title}</span> : null}{d.name}
                              <ExternalLink className="h-3 w-3 text-slate-400 shrink-0" />
                            </Link>
                            {d.specialty && <span className="text-slate-500 text-xs hidden md:block">{d.specialty}</span>}
                            <span className="text-xs text-slate-400 hidden sm:block shrink-0">
                              {d.locations.length > 0 ? d.locations.map((dl) => dl.location.name).join(", ") : "No locations"}
                            </span>
                            <span className="text-xs text-slate-400 shrink-0">{d._count.referrals} ref.</span>
                            {isAdmin && (
                              <div className="flex gap-1 shrink-0">
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
        })}
      </div>

      {/* Dialogs */}
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
        <DialogContent><DialogHeader><DialogTitle>Add Provider — {addDoctorFor?.name}</DialogTitle></DialogHeader>
          {addDoctorFor && <DoctorForm practiceId={addDoctorFor.id} locations={addDoctorFor.locations} onSubmit={async (d) => { run(() => createDoctor(d)); setAddDoctorFor(null) }} isPending={isPending} onClose={() => setAddDoctorFor(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editDoctor} onOpenChange={(o) => !o && setEditDoctor(null)}>
        <DialogContent><DialogHeader><DialogTitle>Edit Provider</DialogTitle></DialogHeader>
          {editDoctor && <DoctorForm practiceId={editDoctor.practice.id} locations={editDoctor.practice.locations} defaultValues={{ ...editDoctor.doc, locationIds: editDoctor.doc.locations.map((dl) => dl.locationId) }} onSubmit={async (d) => { run(() => updateDoctor(editDoctor.doc.id, d)); setEditDoctor(null) }} isPending={isPending} onClose={() => setEditDoctor(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
