"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Plus, Trash2, Loader2, Check, ChevronDown, ChevronRight, Box, GripVertical, ExternalLink } from "lucide-react"
import {
  createCustomObject, updateCustomObject, saveCustomObjectProperties, saveCustomObjectCards, deleteCustomObject,
  type CustomObjectDefLite, type CustomObjectProperty, type CustomObjectCard, type CustomPropType,
} from "@/app/actions/custom-objects"
import StyledSelect from "@/components/ui/styled-select"

const PROP_TYPES: { value: CustomPropType; label: string }[] = [
  { value: "TEXT", label: "Text" },
  { value: "LONG_TEXT", label: "Long text" },
  { value: "NUMBER", label: "Number" },
  { value: "EMAIL", label: "Email" },
  { value: "PHONE", label: "Phone" },
  { value: "DATE", label: "Date" },
  { value: "CHECKBOX", label: "Checkbox" },
  { value: "DROPDOWN", label: "Dropdown" },
  { value: "MULTI_SELECT", label: "Multi-select" },
  { value: "URL", label: "URL" },
  { value: "USER", label: "User" },
]

const inputCls = "h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"

function newPropId() { return `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }

export default function CustomObjectSettings({ objects }: { objects: CustomObjectDefLite[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [singular, setSingular] = useState("")
  const [plural, setPlural] = useState("")
  const [err, setErr] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setErr("")
    if (!singular.trim() || !plural.trim()) { setErr("Both names are required."); return }
    startTransition(async () => {
      const res = await createCustomObject({ singular, plural })
      if ((res as any)?.error) { setErr((res as any).error); return }
      setSingular(""); setPlural("")
      setExpanded((res as any).id)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* Create */}
      <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-800">New object</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Singular name</label>
            <input className={inputCls + " w-full"} value={singular} onChange={(e) => setSingular(e.target.value)} placeholder="Visit" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Plural name</label>
            <input className={inputCls + " w-full"} value={plural} onChange={(e) => setPlural(e.target.value)} placeholder="Visits" />
          </div>
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
        <button type="submit" disabled={isPending}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50">
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create object
        </button>
      </form>

      {/* Existing */}
      {objects.length === 0 ? (
        <div className="bg-white border rounded-xl py-12 text-center text-slate-400">No custom objects yet.</div>
      ) : (
        <div className="space-y-2">
          {objects.map((o) => (
            <div key={o.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <button onClick={() => setExpanded(expanded === o.id ? null : o.id)} className="text-slate-400 hover:text-slate-700">
                  {expanded === o.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <Box className="h-4 w-4 text-slate-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">{o.plural}</p>
                  <p className="text-xs text-slate-400">{o.properties.length} propert{o.properties.length === 1 ? "y" : "ies"} · owner: {o.ownerLabel}</p>
                </div>
                <Link href={`/objects/${o.key}`} className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                  Open <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              {expanded === o.id && <ObjectEditor object={o} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ObjectEditor({ object }: { object: CustomObjectDefLite }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [singular, setSingular] = useState(object.singular)
  const [plural, setPlural] = useState(object.plural)
  const [props, setProps] = useState<CustomObjectProperty[]>(object.properties)
  const [cards, setCards] = useState<CustomObjectCard[]>(object.cards)
  const [saved, setSaved] = useState(false)

  function patch(id: string, p: Partial<CustomObjectProperty>) {
    setProps((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)))
  }
  function addProp() {
    setProps((prev) => [...prev, { id: newPropId(), name: "", type: "TEXT" }])
  }
  function removeProp(id: string) {
    setProps((prev) => prev.filter((x) => x.id !== id))
  }
  // Card layout
  function addCard() { setCards((prev) => [...prev, { id: newPropId(), title: "New card", column: "MIDDLE", propertyIds: [] }]) }
  function patchCard(id: string, c: Partial<CustomObjectCard>) { setCards((prev) => prev.map((x) => (x.id === id ? { ...x, ...c } : x))) }
  function removeCard(id: string) { setCards((prev) => prev.filter((x) => x.id !== id)) }
  function toggleCardProp(cardId: string, propId: string) {
    setCards((prev) => prev.map((c) => {
      if (c.id === cardId) return { ...c, propertyIds: c.propertyIds.includes(propId) ? c.propertyIds.filter((p) => p !== propId) : [...c.propertyIds, propId] }
      // A property lives in one card — remove it from others.
      return { ...c, propertyIds: c.propertyIds.filter((p) => p !== propId) }
    }))
  }
  function save() {
    startTransition(async () => {
      if (singular !== object.singular || plural !== object.plural) {
        await updateCustomObject(object.id, { singular, plural })
      }
      await saveCustomObjectProperties(object.id, props.filter((p) => p.name.trim() || p.primary))
      await saveCustomObjectCards(object.id, cards)
      setSaved(true); setTimeout(() => setSaved(false), 2000)
      router.refresh()
    })
  }

  return (
    <div className="border-t border-slate-100 bg-slate-50/60 p-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Singular</label>
          <input className={inputCls + " w-full"} value={singular} onChange={(e) => setSingular(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Plural</label>
          <input className={inputCls + " w-full"} value={plural} onChange={(e) => setPlural(e.target.value)} />
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Properties</p>
        <div className="space-y-2">
          {props.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <GripVertical className="h-3.5 w-3.5 text-slate-300 shrink-0" />
              <input className={inputCls + " flex-1 min-w-0"} value={p.name} disabled={p.primary}
                onChange={(e) => patch(p.id, { name: e.target.value })} placeholder="Property name" />
              <select className={inputCls + " w-36 shrink-0"} value={p.type} disabled={p.primary}
                onChange={(e) => patch(p.id, { type: e.target.value as CustomPropType })}>
                {PROP_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {(p.type === "DROPDOWN" || p.type === "MULTI_SELECT") && (
                <input className={inputCls + " w-48 shrink-0"} value={(p.options ?? []).join(", ")}
                  onChange={(e) => patch(p.id, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  placeholder="Option A, Option B" />
              )}
              {p.primary
                ? <span className="text-[10px] font-medium text-slate-400 uppercase w-16 text-center shrink-0">Primary</span>
                : <button onClick={() => removeProp(p.id)} className="h-8 w-8 shrink-0 inline-flex items-center justify-center text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
          ))}
        </div>
        <button onClick={addProp} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900">
          <Plus className="h-3.5 w-3.5" /> Add property
        </button>
      </div>

      {/* Detail card layout */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Detail cards</p>
        <p className="text-xs text-slate-400 mb-2">Group properties into cards on the record&apos;s detail page. Anything not placed in a card shows in a default card in the middle.</p>
        <div className="space-y-2">
          {cards.map((card) => (
            <div key={card.id} className="border border-slate-200 rounded-lg bg-white p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input className={inputCls + " flex-1 min-w-0"} value={card.title} onChange={(e) => patchCard(card.id, { title: e.target.value })} placeholder="Card title" />
                <StyledSelect className={inputCls + " w-32 shrink-0"} value={card.column} onChange={(e) => patchCard(card.id, { column: e.target.value as "LEFT" | "MIDDLE" })}>
                  <option value="LEFT">Left column</option>
                  <option value="MIDDLE">Middle (Overview)</option>
                </StyledSelect>
                <button onClick={() => removeCard(card.id)} className="h-8 w-8 shrink-0 inline-flex items-center justify-center text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {props.filter((p) => p.name.trim()).map((p) => {
                  const on = card.propertyIds.includes(p.id)
                  return <button key={p.id} type="button" onClick={() => toggleCardProp(card.id, p.id)}
                    className={"px-2 py-0.5 rounded-lg text-xs font-medium border " + (on ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-600 border-zinc-200")}>{p.name}</button>
                })}
              </div>
            </div>
          ))}
        </div>
        <button onClick={addCard} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900">
          <Plus className="h-3.5 w-3.5" /> Add card
        </button>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button onClick={save} disabled={isPending}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50">
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
        </button>
        {saved && <span className="text-xs text-green-600">Saved</span>}
        <button
          onClick={() => { if (confirm(`Delete "${object.plural}" and all its records? This cannot be undone.`)) startTransition(async () => { await deleteCustomObject(object.id); router.refresh() }) }}
          className="ml-auto inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
          <Trash2 className="h-3.5 w-3.5" /> Delete object
        </button>
      </div>
    </div>
  )
}
