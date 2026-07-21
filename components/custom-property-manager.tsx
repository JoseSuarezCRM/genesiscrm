"use client"

import { CP_ENTITIES } from "@/lib/custom-property-entities"

import StyledSelect from "@/components/ui/styled-select"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createCustomProperty, updateCustomProperty, deleteCustomProperty } from "@/app/actions/custom-properties"
import { Plus, Trash2, Pencil, X, Search } from "lucide-react"

interface CustomProperty {
  id: string
  name: string
  internalName: string | null
  type: string
  entityType: string
  required: boolean
  description: string | null
  options: string[]
  createdAt: Date
}

const slugify = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")

interface Props {
  propsByEntity: Record<string, CustomProperty[]>
}

const PROPERTY_TYPES = [
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
]
const typeLabel = (t: string) => PROPERTY_TYPES.find((p) => p.value === t)?.label ?? t

const INPUT = "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400"

// Create/edit dialog. `editing` present → edit mode (type is locked, like HubSpot).
function PropertyDialog({ entityType, editing, onClose }: { entityType: string; editing?: CustomProperty | null; onClose: () => void }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(editing?.name ?? "")
  const [internalName, setInternalName] = useState(editing?.internalName ?? "")
  // Once the user edits the internal name by hand, stop auto-filling it from the label.
  const [internalTouched, setInternalTouched] = useState(!!editing?.internalName)
  const [type, setType] = useState(editing?.type ?? "TEXT")
  const [required, setRequired] = useState(editing?.required ?? false)
  const [description, setDescription] = useState(editing?.description ?? "")
  const [options, setOptions] = useState((editing?.options ?? []).join("\n"))
  const [error, setError] = useState("")
  const hasOptions = type === "DROPDOWN" || type === "MULTI_SELECT"

  function onNameChange(v: string) {
    setName(v)
    if (!internalTouched) setInternalName(slugify(v))
  }

  function submit() {
    if (!name.trim()) { setError("Property name is required"); return }
    const optionsArray = hasOptions ? options.split("\n").map((o) => o.trim()).filter(Boolean) : []
    if (hasOptions && optionsArray.length === 0) { setError("Add at least one option"); return }
    const internal = slugify(internalName || name)

    startTransition(async () => {
      const res = editing
        ? await updateCustomProperty({ id: editing.id, name: name.trim(), internalName: internal, required, description: description.trim() || undefined, options: optionsArray }) as any
        : await createCustomProperty({ name: name.trim(), internalName: internal, type: type as any, entityType: entityType as any, required, description: description.trim() || undefined, options: optionsArray }) as any
      if (res?.error) { setError(res.error); return }
      router.refresh()
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/30 backdrop-blur-sm p-4 sm:p-8" onMouseDown={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 my-4 sm:my-12" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-900">{editing ? "Edit property" : "Create property"}</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Property label</label>
            <input value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="e.g. Insurance Plan" className={INPUT} autoFocus />
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-xs text-slate-400 shrink-0">Internal name</span>
              <input value={internalName} onChange={(e) => { setInternalName(slugify(e.target.value)); setInternalTouched(true) }}
                placeholder="auto-filled from label"
                className="flex-1 min-w-0 font-mono text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400" />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Used as the personalization token, e.g. <span className="font-mono">{`{${internalName || "field"}}`}</span></p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Type</label>
              {editing ? (
                <div className={INPUT + " bg-slate-50 text-slate-500"}>{typeLabel(type)}</div>
              ) : (
                <StyledSelect value={type} onChange={(e) => setType(e.target.value)} className={INPUT}>
                  {PROPERTY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </StyledSelect>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 self-end pb-2">
              <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              Required
            </label>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" className={INPUT} />
          </div>
          {hasOptions && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Options (one per line)</label>
              <textarea value={options} onChange={(e) => setOptions(e.target.value)} rows={5} placeholder={"Option 1\nOption 2"} className={INPUT + " font-mono resize-none"} />
            </div>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-100">
          <button onClick={onClose} className="h-8 px-3 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
          <button onClick={submit} disabled={isPending} className="h-8 px-4 text-sm font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50">
            {isPending ? "Saving…" : editing ? "Save changes" : "Create property"}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CustomPropertyManager({ propsByEntity }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [entity, setEntity] = useState(CP_ENTITIES[0]?.type ?? "REFERRAL")
  const [query, setQuery] = useState("")
  const [dialog, setDialog] = useState<{ editing?: CustomProperty | null } | null>(null)

  const active = CP_ENTITIES.find((e) => e.type === entity) ?? CP_ENTITIES[0]
  const all = propsByEntity[entity] ?? []
  const q = query.trim().toLowerCase()
  const list = q ? all.filter((p) => p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q)) : all

  function remove(p: CustomProperty) {
    if (!confirm(`Delete "${p.name}"? Existing data isn't removed, but the field stops appearing.`)) return
    startTransition(async () => { await deleteCustomProperty(p.id); router.refresh() })
  }

  return (
    <div className="space-y-4">
      {/* Object selector + search + create */}
      <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-500">Object</span>
          <StyledSelect value={entity} onChange={(e) => { setEntity(e.target.value as any); setQuery("") }} className="min-w-[190px]">
            {CP_ENTITIES.map((e) => <option key={e.type} value={e.type}>{e.icon}  {e.label}</option>)}
          </StyledSelect>
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${active?.label ?? ""} properties…`}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400" />
        </div>
        <button onClick={() => setDialog({ editing: null })}
          className="h-9 px-3.5 inline-flex items-center gap-1.5 text-sm font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800">
          <Plus className="h-4 w-4" /> Create property
        </button>
      </div>

      {/* Property list */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-base">{active?.icon}</span>
            <h2 className="text-sm font-semibold text-slate-800">{active?.label}</h2>
            <span className="text-xs text-slate-400">{list.length}{q ? ` of ${all.length}` : ""}</span>
          </div>
        </div>
        {list.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400">
            {all.length === 0 ? "No custom properties yet. Create one to get started." : `No properties match “${query}”.`}
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {list.map((p) => (
              <div key={p.id} className="group flex items-start justify-between gap-3 px-4 py-3 hover:bg-slate-50/60">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-slate-800">{p.name}</p>
                    <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-600">{typeLabel(p.type)}</span>
                    {p.required && <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700">Required</span>}
                  </div>
                  {p.description && <p className="text-xs text-slate-500 mt-1">{p.description}</p>}
                  {p.options.length > 0 && <p className="text-xs text-slate-400 mt-1 truncate">Options: {p.options.join(", ")}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setDialog({ editing: p })} disabled={isPending} title="Edit"
                    className="p-1.5 text-slate-400 hover:text-zinc-900 hover:bg-slate-100 rounded"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => remove(p)} disabled={isPending} title="Delete"
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {dialog && <PropertyDialog entityType={entity} editing={dialog.editing} onClose={() => setDialog(null)} />}
    </div>
  )
}
