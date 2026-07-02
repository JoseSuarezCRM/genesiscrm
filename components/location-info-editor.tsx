"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Pencil, Loader2, Check } from "lucide-react"
import { updateLocation } from "@/app/actions/referring-doctors"
import { PhoneInput } from "@/components/ui/phone-input"
import StyledSelect from "@/components/ui/styled-select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface LocationLike {
  id: string
  name: string
  address: string | null
  phone: string | null
  fax: string | null
  practiceId: string
  practice: { id: string; name: string }
}

interface Props {
  location: LocationLike
  practices: { id: string; name: string }[]
  canEdit: boolean
}

const inputCls = "h-9 w-full px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 bg-white transition-colors"
const labelCls = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1"

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="text-slate-900 font-medium text-right">{value ?? "—"}</span>
    </div>
  )
}

export default function LocationInfoEditor({ location, practices, canEdit }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)

  const [name, setName] = useState(location.name)
  const [practiceId, setPracticeId] = useState(location.practiceId)
  const [address, setAddress] = useState(location.address ?? "")
  const [phone, setPhone] = useState(location.phone ?? "")
  const [fax, setFax] = useState(location.fax ?? "")

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !practiceId) return
    startTransition(async () => {
      const res = await updateLocation(location.id, { name, practiceId, address, phone, fax }) as any
      if (res?.error) { alert(typeof res.error === "string" ? res.error : "Save failed"); return }
      setEditing(false)
      router.refresh()
    })
  }

  function handleCancel() {
    setName(location.name); setPracticeId(location.practiceId)
    setAddress(location.address ?? ""); setPhone(location.phone ?? ""); setFax(location.fax ?? "")
    setEditing(false)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Location Information</CardTitle>
        {canEdit && !editing && (
          <button onClick={() => setEditing(true)} className="h-7 w-7 flex items-center justify-center text-zinc-400 hover:text-zinc-700 rounded-lg transition-colors">
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className={labelCls}>Name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Practice *</label>
              <StyledSelect value={practiceId} onChange={(e) => setPracticeId(e.target.value)} className={inputCls}>
                {practices.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </StyledSelect>
            </div>
            <div>
              <label className={labelCls}>Address</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Phone</label>
                <PhoneInput value={phone} onChange={setPhone} />
              </div>
              <div>
                <label className={labelCls}>Fax</label>
                <PhoneInput value={fax} onChange={setFax} />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={isPending}
                className="h-8 px-4 text-sm font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50 flex items-center gap-1.5">
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
              </button>
              <button type="button" onClick={handleCancel} className="h-8 px-3 text-sm text-zinc-500 hover:text-zinc-800">Cancel</button>
            </div>
          </form>
        ) : (
          <div className="space-y-3 text-sm">
            <Row label="Name" value={location.name} />
            <Row label="Practice" value={<Link href={`/practices/${location.practice.id}`} className="text-blue-600 hover:underline">{location.practice.name}</Link>} />
            <Row label="Address" value={location.address} />
            <Row label="Phone" value={location.phone} />
            <Row label="Fax" value={location.fax} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
