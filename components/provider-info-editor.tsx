"use client"

import StyledSelect from "@/components/ui/styled-select"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Loader2, Check, MapPin } from "lucide-react"
import { updateDoctor } from "@/app/actions/referring-doctors"
import { PhoneInput } from "@/components/ui/phone-input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"

const PROVIDER_TITLES = ["MD", "DO", "NP", "PA-C", "DPM", "DC", "PT", "OT", "RN", "Other"]

const inputCls = "h-9 w-full px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 bg-white transition-colors"
const labelCls = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1"

interface Location { id: string; name: string }
interface Practice { id: string; name: string; locations: Location[] }
interface Provider {
  id: string
  name: string
  title: string | null
  npi: string | null
  specialty: string | null
  phone: string | null
  officePhone: string | null
  email: string | null
  contactType: "PROVIDER" | "STAFF"
  practice: { id: string; name: string }
  locations: { location: Location }[]
}

interface Props {
  provider: Provider
  allPractices: Practice[]
  isAdmin: boolean
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="text-slate-900 font-medium text-right">{value ?? "—"}</span>
    </div>
  )
}

export default function ProviderInfoEditor({ provider, allPractices, isAdmin }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)

  const [name, setName] = useState(provider.name)
  const [title, setTitle] = useState(provider.title ?? "")
  const [npi, setNpi] = useState(provider.npi ?? "")
  const [phone, setPhone] = useState(provider.phone ?? "")
  const [officePhone, setOfficePhone] = useState(provider.officePhone ?? "")
  const [email, setEmail] = useState(provider.email ?? "")
  const [contactType, setContactType] = useState(provider.contactType)
  const [practiceId, setPracticeId] = useState(provider.practice.id)
  const [locationIds, setLocationIds] = useState<string[]>(provider.locations.map((l) => l.location.id))

  const selectedPractice = allPractices.find((p) => p.id === practiceId)

  function handlePracticeChange(id: string) {
    setPracticeId(id)
    setLocationIds([])
  }

  function toggleLoc(id: string) {
    setLocationIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    startTransition(async () => {
      const res = await updateDoctor(provider.id, { name, title, npi, specialty: provider.specialty ?? "", phone, officePhone, email, contactType, practiceId, locationIds }) as any
      if (res?.error) { alert("Save failed"); return }
      setEditing(false)
      router.refresh()
    })
  }

  function handleCancel() {
    setName(provider.name)
    setTitle(provider.title ?? "")
    setNpi(provider.npi ?? "")
    setPhone(provider.phone ?? "")
    setOfficePhone(provider.officePhone ?? "")
    setEmail(provider.email ?? "")
    setContactType(provider.contactType)
    setPracticeId(provider.practice.id)
    setLocationIds(provider.locations.map((l) => l.location.id))
    setEditing(false)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Provider Information</CardTitle>
        {isAdmin && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="h-7 w-7 flex items-center justify-center text-zinc-400 hover:text-zinc-700 rounded-lg transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className={labelCls}>Name *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Title</label>
                <StyledSelect value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls}>
                  <option value="">— None —</option>
                  {PROVIDER_TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
                </StyledSelect>
              </div>
              <div>
                <label className={labelCls}>Contact Type</label>
                <StyledSelect value={contactType} onChange={(e) => setContactType(e.target.value as "PROVIDER" | "STAFF")} className={inputCls}>
                  <option value="PROVIDER">Provider</option>
                  <option value="STAFF">Staff</option>
                </StyledSelect>
              </div>
            </div>
            <div>
              <label className={labelCls}>NPI</label>
              <input value={npi} onChange={(e) => setNpi(e.target.value)} className={inputCls} maxLength={10} placeholder="1234567890" />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <PhoneInput value={phone} onChange={setPhone} />
            </div>
            <div>
              <label className={labelCls}>Office Phone</label>
              <PhoneInput value={officePhone} onChange={setOfficePhone} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Practice</label>
              <StyledSelect value={practiceId} onChange={(e) => handlePracticeChange(e.target.value)} className={inputCls}>
                {allPractices.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </StyledSelect>
            </div>
            {selectedPractice && selectedPractice.locations.length > 0 && (
              <div>
                <label className={labelCls}>Locations</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {selectedPractice.locations.map((l) => (
                    <button key={l.id} type="button" onClick={() => toggleLoc(l.id)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                        locationIds.includes(l.id) ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"
                      }`}>
                      {locationIds.includes(l.id) && <Check className="h-3 w-3" />}
                      {l.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={isPending}
                className="h-8 px-4 text-sm font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50 flex items-center gap-1.5">
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Save
              </button>
              <button type="button" onClick={handleCancel} className="h-8 px-3 text-sm text-zinc-500 hover:text-zinc-800 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3 text-sm">
            <Row label="Name" value={provider.name} />
            <Row label="Title" value={provider.title} />
            <Row label="Contact Type" value={provider.contactType === "PROVIDER" ? "Provider" : "Staff"} />
            <Row label="NPI" value={provider.npi} />
            <Row label="Phone" value={provider.phone} />
            <Row label="Office Phone" value={provider.officePhone} />
            <Row label="Email" value={provider.email} />
            <div className="flex justify-between gap-4">
              <span className="text-slate-500 shrink-0">Practice</span>
              <Link href={`/practices/${provider.practice.id}`} className="text-blue-600 hover:underline font-medium text-right">
                {provider.practice.name}
              </Link>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500 shrink-0">Locations</span>
              <span className="text-slate-900 font-medium text-right">
                {provider.locations.length > 0
                  ? provider.locations.map((l) => l.location.name).join(", ")
                  : "—"}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
