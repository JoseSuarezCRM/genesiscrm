"use client"

import { useState, useTransition, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Loader2, Check, Plus, X, Search, ExternalLink } from "lucide-react"
import { updateCustomObjectRecord } from "@/app/actions/custom-object-records"
import { searchAssociableRecords, associateRecords, unassociateRecords } from "@/app/actions/associations"
import RecordActivityFeed from "@/components/record-activity-feed"
import RecordEngagementBar from "@/components/record-engagement-bar"
import RecordAssociationCards from "@/components/record-association-cards"
import type { ActivityItem } from "@/app/actions/record-activity"
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
  activityItems: ActivityItem[]
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

export default function CustomObjectDetail({ objectKey, singular, ownerLabel, properties, cards, record, users, canEdit, associations, activityItems }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const userMap = Object.fromEntries(users.map((u) => [u.id, u.label]))
  const propById = Object.fromEntries(properties.map((p) => [p.id, p]))
  const primary = properties.find((p) => p.primary) ?? properties[0]

  const [tab, setTab] = useState<"overview" | "activities">("overview")
  const [values, setValues] = useState<Record<string, any>>(record.values)

  // Inline save of a single property value.
  function saveField(propId: string, val: any) {
    const next = { ...values, [propId]: val }
    setValues(next)
    startTransition(async () => { await updateCustomObjectRecord(objectKey, record.id, { values: next }); router.refresh() })
  }

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
        <div className="p-5 divide-y divide-slate-100">
          {props.map((p) => (
            <FieldRow key={p.id} p={p} value={values[p.id]} users={users} userMap={userMap} canEdit={canEdit} onSave={saveField} />
          ))}
        </div>
      </div>
    )
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
          <RecordEngagementBar
            recordType={`CO:${objectKey}`}
            recordId={record.id}
            users={users}
            canEdit={canEdit}
            compact
            onLogged={() => setTab("activities")}
          />

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
              {middleCards.map(renderCard)}
            </div>
          ) : (
            <RecordActivityFeed recordType={`CO:${objectKey}`} recordId={record.id} items={activityItems} users={users} canEdit={canEdit} showActions={false} />
          )}
        </div>

        {/* RIGHT: Associated Objects — same component every other object uses */}
        <div className="lg:col-span-1 space-y-4">
          {associations.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-200 rounded-xl px-5 py-4 text-sm text-slate-400">
              No relationships. Set them up in Settings → Data Model.
            </div>
          ) : (
            <RecordAssociationCards
              recordType={`CO:${objectKey}`}
              recordId={record.id}
              cards={associations as any}
              canEdit={canEdit}
            />
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

function FieldRow({ p, value, users, userMap, canEdit, onSave }: {
  p: CustomObjectProperty; value: any; users: { id: string; label: string }[]; userMap: Record<string, string>; canEdit: boolean; onSave: (id: string, v: any) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<any>(value)
  useEffect(() => { setDraft(value) }, [value])

  const label = <span className="text-slate-500 shrink-0">{p.name}</span>
  const shown = display(p, value, userMap)

  if (!canEdit) {
    return <div className="flex justify-between gap-4 py-2 text-sm">{label}<span className="text-slate-900 font-medium text-right break-words">{shown}</span></div>
  }
  if (p.type === "CHECKBOX") {
    return (
      <div className="flex justify-between gap-4 py-2 text-sm items-center">{label}
        <input type="checkbox" checked={!!value} onChange={(e) => onSave(p.id, e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
      </div>
    )
  }

  const multiline = p.type === "LONG_TEXT" || p.type === "MULTI_SELECT"
  const commit = () => { onSave(p.id, draft); setEditing(false) }
  const cancel = () => { setDraft(value); setEditing(false) }

  return (
    <div className="flex justify-between gap-4 py-2 text-sm">{label}
      {editing ? (
        <div className="flex-1 max-w-[65%]" onKeyDown={(e) => { if (e.key === "Enter" && !multiline) { e.preventDefault(); commit() } if (e.key === "Escape") cancel() }}>
          <PropInput p={p} value={draft} users={users} onChange={setDraft} />
          <div className="flex gap-1.5 mt-1.5 justify-end">
            <button onClick={commit} className="h-7 px-2.5 rounded-md bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 inline-flex items-center gap-1"><Check className="h-3 w-3" /> Save</button>
            <button onClick={cancel} className="h-7 px-2 text-xs text-slate-500 hover:text-slate-800">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setEditing(true)}
          className="text-right text-slate-900 font-medium break-words rounded px-1 -mx-1 hover:bg-blue-50/70 hover:ring-1 hover:ring-blue-200 cursor-text max-w-[65%]">
          {shown === "—" ? <span className="text-slate-400 font-normal">—</span> : shown}
        </button>
      )}
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
