"use client"

import { useState, useTransition, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Pencil, Loader2, Check, Plus, X, Search, ExternalLink } from "lucide-react"
import { updateCustomObjectRecord } from "@/app/actions/custom-object-records"
import { searchAssociableRecords, associateRecords, unassociateRecords } from "@/app/actions/associations"
import type { CustomObjectProperty, CustomObjectCard } from "@/app/actions/custom-objects"
import StyledSelect from "@/components/ui/styled-select"
import { cn } from "@/lib/utils"

interface AssocRecord { id: string; name: string; url: string }
interface AssocGroup { type: string; label: string; records: AssocRecord[] }

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
  cards: CustomObjectCard[]
  record: RecordData
  users: { id: string; label: string }[]
  canEdit: boolean
  associations: AssocGroup[]
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

export default function CustomObjectDetail({ objectKey, singular, ownerLabel, properties, cards, record, users, canEdit, associations }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const userMap = Object.fromEntries(users.map((u) => [u.id, u.label]))
  const propById = Object.fromEntries(properties.map((p) => [p.id, p]))
  const primary = properties.find((p) => p.primary) ?? properties[0]

  const [editing, setEditing] = useState(false)
  const [tab, setTab] = useState<"overview" | "activities">("overview")
  const [values, setValues] = useState<Record<string, any>>(record.values)
  const set = (id: string, v: any) => setValues((p) => ({ ...p, [id]: v }))

  // Group properties into cards; anything not placed in a card falls into an
  // auto "Details" card in the middle so nothing is ever hidden.
  const assigned = new Set(cards.flatMap((c) => c.propertyIds))
  const unassigned = properties.filter((p) => !assigned.has(p.id))
  const leftCards = cards.filter((c) => c.column === "LEFT")
  const middleCards = [
    ...cards.filter((c) => c.column === "MIDDLE"),
    ...(unassigned.length ? [{ id: "__auto", title: "Details", column: "MIDDLE" as const, propertyIds: unassigned.map((p) => p.id) }] : []),
  ]

  function renderCard(card: CustomObjectCard) {
    const props = card.propertyIds.map((id) => propById[id]).filter(Boolean)
    if (props.length === 0) return null
    return (
      <div key={card.id} className="bg-white border border-slate-200 rounded-xl">
        <div className="px-5 py-3 border-b border-slate-100"><h2 className="text-sm font-semibold text-slate-900">{card.title}</h2></div>
        <div className="p-5">
          {editing ? (
            <div className="space-y-3">
              {props.map((p) => (
                <div key={p.id}>
                  <label className="text-xs font-medium text-slate-600 block mb-1">{p.name}</label>
                  <PropInput p={p} value={values[p.id]} users={users} onChange={(v) => set(p.id, v)} />
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {props.map((p) => (
                <div key={p.id} className="flex justify-between gap-4 py-2 text-sm">
                  <span className="text-slate-500 shrink-0">{p.name}</span>
                  <span className="text-slate-900 font-medium text-right break-words">{display(p, record.values[p.id], userMap)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

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

      {/* Three-Column Layout (like Referrals) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* LEFT: record details */}
        <div className="lg:col-span-1 space-y-4">
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
          {leftCards.map(renderCard)}
        </div>

        {/* MIDDLE: Overview / Activities tabs */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center gap-1 border-b border-slate-200">
            {(["overview", "activities"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={cn("px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize", tab === t ? "border-zinc-900 text-zinc-900" : "border-transparent text-slate-500 hover:text-slate-800")}>
                {t}
              </button>
            ))}
          </div>

          {tab === "overview" ? (
            <div className="space-y-4">
              {canEdit && (
                <div className="flex justify-end">
                  {editing ? (
                    <div className="flex gap-2">
                      <button onClick={saveProps} disabled={isPending} className="h-8 px-3 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 inline-flex items-center gap-1.5">
                        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
                      </button>
                      <button onClick={() => setEditing(false)} className="h-8 px-3 text-sm text-slate-500 hover:text-slate-800">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => { setValues(record.values); setEditing(true) }} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:border-slate-300"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                  )}
                </div>
              )}
              {middleCards.map(renderCard)}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl px-5 py-10 text-center text-sm text-slate-400">
              Activities — notes, tasks, emails, SMS, and meetings for this record — are coming next.
            </div>
          )}
        </div>

        {/* RIGHT: Associated Objects */}
        <div className="lg:col-span-1 space-y-4">
          {associations.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-200 rounded-xl px-5 py-4 text-sm text-slate-400">
              No relationships. Set them up in Settings → Data Model.
            </div>
          ) : (
            associations.map((g) => (
              <AssociationCard key={g.type} objectKey={objectKey} recordId={record.id} group={g} canEdit={canEdit} />
            ))
          )}
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

function AssociationCard({ objectKey, recordId, group, canEdit }: { objectKey: string; recordId: string; group: AssocGroup; canEdit: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState("")
  const [results, setResults] = useState<AssocRecord[]>([])
  const [searching, setSearching] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const typeKey = `CO:${objectKey}`
  const existingIds = new Set(group.records.map((r) => r.id))

  useEffect(() => {
    if (!adding) return
    let active = true
    setSearching(true)
    const t = setTimeout(async () => {
      const r = await searchAssociableRecords(group.type, q)
      if (active) { setResults(r); setSearching(false) }
    }, 250)
    return () => { active = false; clearTimeout(t) }
  }, [adding, q, group.type])

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setAdding(false) }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  function add(rec: AssocRecord) {
    startTransition(async () => { await associateRecords(typeKey, recordId, group.type, rec.id); setAdding(false); setQ(""); router.refresh() })
  }
  function remove(id: string) {
    startTransition(async () => { await unassociateRecords(typeKey, recordId, group.type, id); router.refresh() })
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">{group.label} <span className="text-slate-400 font-normal">({group.records.length})</span></h2>
        {canEdit && (
          <div className="relative" ref={ref}>
            <button onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"><Plus className="h-3.5 w-3.5" /> Add</button>
            {adding && (
              <div className="absolute right-0 top-7 z-50 w-72 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                <div className="relative border-b border-slate-100 p-1.5">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${group.label.toLowerCase()}…`} className="w-full pl-7 pr-2 py-1.5 text-sm rounded-md focus:outline-none" />
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                  {searching ? <p className="px-3 py-2 text-xs text-slate-400">Searching…</p>
                    : results.filter((r) => !existingIds.has(r.id)).length === 0 ? <p className="px-3 py-2 text-xs text-slate-400">No matches</p>
                    : results.filter((r) => !existingIds.has(r.id)).map((r) => (
                      <button key={r.id} onClick={() => add(r)} className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 truncate">{r.name}</button>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="p-3">
        {group.records.length === 0 ? (
          <p className="px-2 py-3 text-sm text-slate-400">No associated {group.label.toLowerCase()}.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {group.records.map((r) => (
              <div key={r.id} className="flex items-center gap-2 py-2 px-2">
                <Link href={r.url} className="flex-1 min-w-0 text-sm text-blue-600 hover:underline truncate inline-flex items-center gap-1">{r.name}<ExternalLink className="h-3 w-3 text-slate-400 shrink-0" /></Link>
                {canEdit && <button onClick={() => remove(r.id)} disabled={isPending} className="h-6 w-6 inline-flex items-center justify-center text-slate-300 hover:text-red-500 rounded"><X className="h-3.5 w-3.5" /></button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
