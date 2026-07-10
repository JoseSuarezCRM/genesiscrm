"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Loader2, Check, Link2 } from "lucide-react"
import { updateCustomObjectRecord } from "@/app/actions/custom-object-records"
import type { CustomObjectProperty } from "@/app/actions/custom-objects"
import StyledSelect from "@/components/ui/styled-select"

interface RecordData {
  id: string
  recordNumber: number | null
  values: Record<string, any>
  ownerId: string | null
  ownerName: string | null
  createdByName: string | null
  createdAt: string | Date
  updatedByName: string | null
  updatedAt: string | Date
  lastViewedByName: string | null
  lastViewedAt: string | Date | null
}

interface Props {
  objectKey: string
  singular: string
  ownerLabel: string
  properties: CustomObjectProperty[]
  record: RecordData
  users: { id: string; label: string }[]
  canEdit: boolean
}

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" })
}

function display(p: CustomObjectProperty, v: any, userMap: Record<string, string>): string {
  if (v === null || v === undefined || v === "") return "—"
  switch (p.type) {
    case "CHECKBOX": return v ? "Yes" : "No"
    case "DATE": return fmtDate(v)
    case "MULTI_SELECT": return Array.isArray(v) ? v.join(", ") : String(v)
    case "USER": return userMap[v] ?? String(v)
    default: return String(v)
  }
}

const inputCls = "h-9 w-full px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"

export default function CustomObjectDetail({ objectKey, singular, ownerLabel, properties, record, users, canEdit }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const userMap = Object.fromEntries(users.map((u) => [u.id, u.label]))
  const primary = properties.find((p) => p.primary) ?? properties[0]

  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState<Record<string, any>>(record.values)
  const set = (id: string, v: any) => setValues((p) => ({ ...p, [id]: v }))

  function saveProps() {
    startTransition(async () => {
      await updateCustomObjectRecord(objectKey, record.id, { values })
      setEditing(false); router.refresh()
    })
  }
  function saveOwner(ownerId: string) {
    startTransition(async () => { await updateCustomObjectRecord(objectKey, record.id, { ownerId: ownerId || null }); router.refresh() })
  }

  const title = (primary && display(primary, record.values[primary.id], userMap)) || `${singular} #${record.recordNumber ?? ""}`

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-400 font-mono">Record ID #{record.recordNumber ?? "—"}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: record details */}
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl">
            <div className="px-5 py-3 border-b border-slate-100"><h2 className="text-sm font-semibold text-slate-900">Record details</h2></div>
            <div className="p-5 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-slate-500 shrink-0">{ownerLabel}</span>
                {canEdit ? (
                  <StyledSelect value={record.ownerId ?? ""} onChange={(e) => saveOwner(e.target.value)} className="w-44 h-8">
                    <option value="">— Unassigned —</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                  </StyledSelect>
                ) : <span className="text-slate-900 font-medium text-right">{record.ownerName ?? "—"}</span>}
              </div>
              <Row label="Record ID" value={record.recordNumber != null ? `#${record.recordNumber}` : "—"} />
              <Row label="Created by" value={record.createdByName ?? "—"} />
              <Row label="Created" value={fmtDate(record.createdAt)} />
              <Row label="Last updated by" value={record.updatedByName ?? "—"} />
              <Row label="Last updated" value={fmtDate(record.updatedAt)} />
              <Row label="Last viewed by" value={record.lastViewedByName ?? "—"} />
            </div>
          </div>
        </div>

        {/* Middle: property card(s) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Properties</h2>
              {canEdit && !editing && (
                <button onClick={() => { setValues(record.values); setEditing(true) }} className="h-7 w-7 flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg"><Pencil className="h-3.5 w-3.5" /></button>
              )}
            </div>
            <div className="p-5 space-y-3">
              {editing ? (
                <>
                  {properties.map((p) => (
                    <div key={p.id}>
                      <label className="text-xs font-medium text-slate-600 block mb-1">{p.name}</label>
                      <PropInput p={p} value={values[p.id]} users={users} onChange={(v) => set(p.id, v)} />
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <button onClick={saveProps} disabled={isPending} className="h-9 px-4 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 inline-flex items-center gap-1.5">
                      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
                    </button>
                    <button onClick={() => setEditing(false)} className="h-9 px-3 text-sm text-slate-500 hover:text-slate-800">Cancel</button>
                  </div>
                </>
              ) : (
                <div className="divide-y divide-slate-100">
                  {properties.map((p) => (
                    <div key={p.id} className="flex justify-between gap-4 py-2 text-sm">
                      <span className="text-slate-500 shrink-0">{p.name}</span>
                      <span className="text-slate-900 font-medium text-right break-words">{display(p, record.values[p.id], userMap)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Associations (Phase 3) */}
          <div className="bg-white border border-dashed border-slate-200 rounded-xl px-5 py-4 text-sm text-slate-400 flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Associated records will appear here once the data model is set up.
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="text-slate-900 font-medium text-right">{value}</span>
    </div>
  )
}

function PropInput({ p, value, users, onChange }: { p: CustomObjectProperty; value: any; users: { id: string; label: string }[]; onChange: (v: any) => void }) {
  if (p.type === "LONG_TEXT") return <textarea rows={3} className={inputCls + " resize-none py-2 h-auto"} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
  if (p.type === "CHECKBOX") return <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
  if (p.type === "DATE") return <input type="date" className={inputCls} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
  if (p.type === "NUMBER") return <input type="number" className={inputCls} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
  if (p.type === "DROPDOWN") return (
    <StyledSelect className={inputCls} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">— Select —</option>
      {(p.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
    </StyledSelect>
  )
  if (p.type === "MULTI_SELECT") {
    const arr: string[] = Array.isArray(value) ? value : []
    return (
      <div className="flex flex-wrap gap-1.5">
        {(p.options ?? []).map((o) => {
          const on = arr.includes(o)
          return <button key={o} type="button" onClick={() => onChange(on ? arr.filter((x) => x !== o) : [...arr, o])}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${on ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-600 border-zinc-200"}`}>{o}</button>
        })}
      </div>
    )
  }
  if (p.type === "USER") return (
    <StyledSelect className={inputCls} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">— Select —</option>
      {users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
    </StyledSelect>
  )
  return <input className={inputCls} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
}
