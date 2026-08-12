"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Plus, Trash2, Loader2, Check, Box, GripVertical, ExternalLink, Pencil, Search, ChevronLeft, ChevronRight } from "lucide-react"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import {
  createCustomObject, updateCustomObject, saveCustomObjectProperties, saveCustomObjectCards, deleteCustomObject,
  type CustomObjectDefLite, type CustomObjectProperty, type CustomObjectCard, type CustomPropType,
} from "@/app/actions/custom-objects"
import StyledSelect from "@/components/ui/styled-select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import PropertyEditor, { type PropertyDraft } from "@/components/property-editor"

const PROP_TYPES: { value: CustomPropType; label: string }[] = [
  { value: "TEXT", label: "Text" },
  { value: "LONG_TEXT", label: "Long text" },
  { value: "NUMBER", label: "Number" },
  { value: "EMAIL", label: "Email" },
  { value: "PHONE", label: "Phone" },
  { value: "DATE", label: "Date" },
  { value: "DATE_TIME", label: "Date & time" },
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
  const [showCreate, setShowCreate] = useState(false)
  const [selectedId, setSelectedId] = useState<string>(objects[0]?.id ?? "")

  const selected = objects.find((o) => o.id === selectedId) ?? null

  function handleCreate() {
    setErr("")
    if (!singular.trim() || !plural.trim()) { setErr("Both names are required."); return }
    startTransition(async () => {
      const res = await createCustomObject({ singular, plural })
      if ((res as any)?.error) { setErr((res as any).error); return }
      setSingular(""); setPlural(""); setShowCreate(false)
      setSelectedId((res as any).id)
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      {/* Toolbar: choose an object + create */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-600">Select an object
          <StyledSelect value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
            className="mt-1 min-w-[240px] h-9 border border-slate-200 rounded-lg bg-white">
            <option value="">Select an object…</option>
            {objects.map((o) => <option key={o.id} value={o.id}>{o.plural}</option>)}
          </StyledSelect>
        </label>
        <button onClick={() => { setErr(""); setShowCreate(true) }}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
          <Plus className="h-4 w-4" /> New object
        </button>
        {selected && (
          <Link href={`/objects/${selected.key}`} className="ml-auto text-sm text-blue-600 hover:underline inline-flex items-center gap-1 pb-1.5">
            Open {selected.plural} <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {/* Selected object editor */}
      {objects.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-xl py-12 text-center text-sm text-slate-400">
          No custom objects yet. Click “New object” to create one.
        </div>
      ) : selected ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
            <Box className="h-4 w-4 text-slate-400" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900">{selected.plural}</p>
              <p className="text-xs text-slate-400">{selected.properties.length} propert{selected.properties.length === 1 ? "y" : "ies"} · owner: {selected.ownerLabel}</p>
            </div>
          </div>
          <ObjectEditor key={selected.id} object={selected} />
        </div>
      ) : (
        <div className="bg-white border border-dashed border-slate-200 rounded-xl py-12 text-center text-sm text-slate-400">
          Pick an object above to edit it.
        </div>
      )}

      {/* Create modal */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New object</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Singular name</label>
                <input className={inputCls + " w-full"} value={singular} onChange={(e) => setSingular(e.target.value)} placeholder="Visit" autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreate() }} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Plural name</label>
                <input className={inputCls + " w-full"} value={plural} onChange={(e) => setPlural(e.target.value)} placeholder="Visits"
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreate() }} />
              </div>
            </div>
            {err && <p className="text-xs text-red-600">{err}</p>}
          </div>
          <DialogFooter>
            <button onClick={() => setShowCreate(false)} className="h-9 px-3 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
            <button onClick={handleCreate} disabled={isPending}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create object
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const [editingProp, setEditingProp] = useState<CustomObjectProperty | "new" | null>(null)
  const [propQuery, setPropQuery] = useState("")
  const [propPage, setPropPage] = useState(0)
  const PROP_PAGE = 10

  function removeProp(id: string) {
    const next = props.filter((x) => x.id !== id)
    setProps(next)
    startTransition(async () => { await saveCustomObjectProperties(object.id, next); router.refresh() })
  }
  // Persist a created/edited property from the full editor into the def.
  async function saveProp(draft: PropertyDraft, existing: CustomObjectProperty | null) {
    // Type is fixed after creation, except DROPDOWN ↔ MULTI_SELECT (shared options).
    const optType = (t?: string) => t === "DROPDOWN" || t === "MULTI_SELECT"
    const nextType = existing && optType(existing.type) && optType(draft.type) ? draft.type : (existing?.type ?? draft.type)
    const prop: CustomObjectProperty = {
      id: existing?.id ?? newPropId(),
      name: draft.name, type: nextType as CustomPropType,
      options: draft.options, optionLabels: draft.optionLabels, optionColors: draft.optionColors, optionStyle: draft.optionStyle, required: draft.required, primary: existing?.primary,
      internalName: draft.internalName, description: draft.description,
      unique: draft.unique, defaultValue: draft.defaultValue, conditional: draft.conditional,
      visibilityRule: draft.visibilityRule, numberFormat: draft.numberFormat,
    }
    const next = existing ? props.map((p) => (p.id === existing.id ? prop : p)) : [...props, prop]
    setProps(next)
    return await saveCustomObjectProperties(object.id, next).then(() => { router.refresh(); return {} }).catch((e: any) => ({ error: e?.message ?? "Failed to save." }))
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

      {(() => {
        const filtered = props.filter((p) => !propQuery || (p.name || "").toLowerCase().includes(propQuery.toLowerCase()) || (p.internalName || "").toLowerCase().includes(propQuery.toLowerCase()))
        const pages = Math.max(1, Math.ceil(filtered.length / PROP_PAGE))
        const pageC = Math.min(propPage, pages - 1)
        const visible = filtered.slice(pageC * PROP_PAGE, pageC * PROP_PAGE + PROP_PAGE)
        return (
      <div>
        <div className="flex items-center justify-between mb-2 gap-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Properties ({props.length})</p>
          {props.length > PROP_PAGE && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input value={propQuery} onChange={(e) => { setPropQuery(e.target.value); setPropPage(0) }} placeholder="Search properties…"
                className="pl-8 pr-2 h-8 w-52 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-zinc-400" />
            </div>
          )}
        </div>
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white divide-y divide-slate-100">
          {visible.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-400">No properties match “{propQuery}”.</p>
          ) : visible.map((p) => (
            <div key={p.id} className="group flex items-center gap-2 px-3 py-2">
              <GripVertical className="h-3.5 w-3.5 text-slate-300 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{p.name || <span className="text-slate-400">Untitled</span>}</p>
                {(p.options?.length ?? 0) > 0 && <p className="text-xs text-slate-400 truncate">Options: {(p.options ?? []).join(", ")}</p>}
              </div>
              <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-600 shrink-0">{PROP_TYPES.find((t) => t.value === p.type)?.label ?? p.type}</span>
              {p.primary && <span className="text-[10px] font-medium text-slate-400 uppercase shrink-0">Primary</span>}
              <button onClick={() => setEditingProp(p)} className="h-8 w-8 shrink-0 inline-flex items-center justify-center text-slate-400 hover:text-zinc-900 hover:bg-slate-100 rounded-lg"><Pencil className="h-3.5 w-3.5" /></button>
              {!p.primary && <button onClick={() => removeProp(p.id)} className="h-8 w-8 shrink-0 inline-flex items-center justify-center text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-2">
          <button onClick={() => setEditingProp("new")} className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900">
            <Plus className="h-3.5 w-3.5" /> Add property
          </button>
          {filtered.length > PROP_PAGE && (
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <span>{pageC * PROP_PAGE + 1}–{Math.min(filtered.length, pageC * PROP_PAGE + PROP_PAGE)} of {filtered.length}</span>
              <button disabled={pageC === 0} onClick={() => setPropPage(pageC - 1)} className="h-6 w-6 inline-flex items-center justify-center rounded-md hover:bg-slate-100 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
              <span>{pageC + 1} / {pages}</span>
              <button disabled={pageC >= pages - 1} onClick={() => setPropPage(pageC + 1)} className="h-6 w-6 inline-flex items-center justify-center rounded-md hover:bg-slate-100 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
            </div>
          )}
        </div>
      </div>
        )
      })()}

      {editingProp && (
        <PropertyEditor
          entityLabel={object.plural}
          editing={editingProp === "new" ? null : {
            id: editingProp.id, name: editingProp.name, internalName: editingProp.internalName, type: editingProp.type,
            required: editingProp.required, unique: editingProp.unique, description: editingProp.description,
            defaultValue: editingProp.defaultValue, options: editingProp.options, optionLabels: editingProp.optionLabels,
            optionColors: editingProp.optionColors, optionStyle: editingProp.optionStyle,
            conditional: editingProp.conditional, visibilityRule: editingProp.visibilityRule,
            numberFormat: (editingProp as any).numberFormat,
          }}
          controllingProps={props.filter((p) => p.type === "DROPDOWN" && (editingProp === "new" || p.id !== editingProp.id)).map((p) => ({ id: p.id, name: p.name, options: p.options ?? [] }))}
          visibilityControllers={props.filter((p) => editingProp === "new" || p.id !== editingProp.id).map((p) => ({ key: p.id, name: p.name, options: (p.type === "DROPDOWN" || p.type === "MULTI_SELECT") ? (p.options ?? []) : [], optionLabels: p.optionLabels }))}
          onSave={(d) => saveProp(d, editingProp === "new" ? null : editingProp)}
          onClose={() => setEditingProp(null)}
        />
      )}

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
                    className={"px-2 py-0.5 rounded-lg text-xs font-medium border " + (on ? "bg-blue-600 text-white border-blue-600" : "bg-white text-zinc-600 border-zinc-200")}>{p.name}</button>
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
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
        </button>
        {saved && <span className="text-xs text-green-600">Saved</span>}
        <button
          onClick={async () => { if (await confirmDialog(`Delete "${object.plural}" and all its records? This cannot be undone.`)) startTransition(async () => { await deleteCustomObject(object.id); router.refresh() }) }}
          className="ml-auto inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
          <Trash2 className="h-3.5 w-3.5" /> Delete object
        </button>
      </div>
    </div>
  )
}
