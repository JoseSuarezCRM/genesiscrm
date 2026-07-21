"use client"

import { CP_ENTITIES } from "@/lib/custom-property-entities"

import StyledSelect from "@/components/ui/styled-select"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createCustomProperty, updateCustomProperty, deleteCustomProperty } from "@/app/actions/custom-properties"
import PropertyEditor, { type PropertyDraft } from "@/components/property-editor"
import { Plus, Trash2, Pencil, Search } from "lucide-react"

interface CustomProperty {
  id: string
  name: string
  internalName: string | null
  type: string
  entityType: string
  required: boolean
  unique?: boolean
  description: string | null
  defaultValue?: string | null
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

      {dialog && (
        <PropertyEditor
          entityLabel={active?.label ?? entity}
          editing={dialog.editing as any}
          controllingProps={all.filter((p) => p.type === "DROPDOWN" && p.id !== dialog.editing?.id).map((p) => ({ id: p.id, name: p.name, options: p.options }))}
          onSave={async (d: PropertyDraft) => {
            return dialog.editing
              ? await updateCustomProperty({ id: dialog.editing.id, name: d.name, internalName: d.internalName, required: d.required, unique: d.unique, description: d.description, defaultValue: d.defaultValue, options: d.options, conditional: d.conditional })
              : await createCustomProperty({ name: d.name, internalName: d.internalName, type: d.type as any, entityType: entity as any, required: d.required, unique: d.unique, description: d.description, defaultValue: d.defaultValue, options: d.options, conditional: d.conditional })
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}
