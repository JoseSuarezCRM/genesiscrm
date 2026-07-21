"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  X, Code2, GripVertical, Plus, Trash2, Search,
  Type, AlignLeft, Hash, ChevronDownCircle, ListChecks, CheckSquare, Calendar, CalendarClock, Mail, Phone, Link2,
} from "lucide-react"
import StyledSelect from "@/components/ui/styled-select"
import { createCustomProperty, updateCustomProperty } from "@/app/actions/custom-properties"
import { cn } from "@/lib/utils"

interface CustomProperty {
  id: string; name: string; internalName: string | null; type: string; entityType: string
  required: boolean; unique?: boolean; description: string | null; defaultValue?: string | null; options: string[]
}

const FIELD_TYPES = [
  { value: "TEXT", label: "Single-line text", icon: Type, desc: "Short free text" },
  { value: "LONG_TEXT", label: "Multi-line text", icon: AlignLeft, desc: "A longer paragraph" },
  { value: "NUMBER", label: "Number", icon: Hash, desc: "Numeric values" },
  { value: "DROPDOWN", label: "Dropdown select", icon: ChevronDownCircle, desc: "Pick one option" },
  { value: "MULTI_SELECT", label: "Multiple select", icon: ListChecks, desc: "Pick several options" },
  { value: "CHECKBOX", label: "Single checkbox", icon: CheckSquare, desc: "A yes / no toggle" },
  { value: "DATE", label: "Date picker", icon: Calendar, desc: "A calendar date" },
  { value: "DATE_TIME", label: "Date & time", icon: CalendarClock, desc: "Date with a time" },
  { value: "EMAIL", label: "Email", icon: Mail, desc: "An email address" },
  { value: "PHONE", label: "Phone number", icon: Phone, desc: "A phone number" },
  { value: "URL", label: "URL", icon: Link2, desc: "A web link" },
]
const typeMeta = (t: string) => FIELD_TYPES.find((f) => f.value === t) ?? FIELD_TYPES[0]
const slugify = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")

type Step = "details" | "field" | "rules" | "preview"
const STEPS: { key: Step; label: string }[] = [
  { key: "details", label: "Details" },
  { key: "field", label: "Field type" },
  { key: "rules", label: "Rules" },
  { key: "preview", label: "Preview" },
]

const INPUT = "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400"

export default function PropertyEditor({ entityType, entityLabel, editing, onClose }: {
  entityType: string; entityLabel: string; editing?: CustomProperty | null; onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState<Step>("details")
  const [error, setError] = useState("")

  const [name, setName] = useState(editing?.name ?? "")
  const [internalName, setInternalName] = useState(editing?.internalName ?? "")
  const [internalTouched, setInternalTouched] = useState(!!editing?.internalName)
  const [type, setType] = useState(editing?.type ?? "TEXT")
  const [description, setDescription] = useState(editing?.description ?? "")
  const [required, setRequired] = useState(editing?.required ?? false)
  const [unique, setUnique] = useState(editing?.unique ?? false)
  const [defaultValue, setDefaultValue] = useState(editing?.defaultValue ?? "")
  const [options, setOptions] = useState<string[]>(editing?.options ?? [])
  const [optQuery, setOptQuery] = useState("")
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const hasOptions = type === "DROPDOWN" || type === "MULTI_SELECT"

  function onNameChange(v: string) {
    setName(v)
    if (!internalTouched) setInternalName(slugify(v))
  }

  // Option list helpers
  const setOpt = (i: number, v: string) => setOptions((o) => o.map((x, idx) => (idx === i ? v : x)))
  const addOpt = () => setOptions((o) => [...o, ""])
  const removeOpt = (i: number) => setOptions((o) => o.filter((_, idx) => idx !== i))
  function moveOpt(from: number, to: number) {
    setOptions((o) => { const next = [...o]; const [m] = next.splice(from, 1); next.splice(to, 0, m); return next })
  }

  function submit() {
    if (!name.trim()) { setError("Property label is required."); setStep("details"); return }
    const cleanOpts = hasOptions ? options.map((o) => o.trim()).filter(Boolean) : []
    if (hasOptions && cleanOpts.length === 0) { setError("Add at least one option."); setStep("field"); return }
    const internal = slugify(internalName || name)
    const payload = {
      name: name.trim(), internalName: internal, required, unique,
      description: description.trim() || undefined,
      defaultValue: defaultValue || undefined, options: cleanOpts,
    }
    startTransition(async () => {
      const res = editing
        ? await updateCustomProperty({ id: editing.id, ...payload }) as any
        : await createCustomProperty({ ...payload, type: type as any, entityType: entityType as any }) as any
      if (res?.error) { setError(res.error); return }
      router.refresh(); onClose()
    })
  }

  const Toggle = ({ on, set, label, hint }: { on: boolean; set: (v: boolean) => void; label: string; hint: string }) => (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{hint}</p>
      </div>
      <button type="button" role="switch" aria-checked={on} onClick={() => set(!on)}
        className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors mt-0.5", on ? "bg-emerald-500" : "bg-slate-200")}>
        <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform", on ? "translate-x-4" : "translate-x-0.5")} />
      </button>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 h-14 bg-zinc-900 text-white shrink-0">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{editing ? name || "Edit property" : "Create new property"}</p>
          <p className="text-[11px] text-zinc-400 truncate">{entityLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="h-8 px-3 text-sm rounded-lg border border-zinc-700 hover:bg-zinc-800">Cancel</button>
          <button onClick={submit} disabled={isPending} className="h-8 px-4 text-sm font-medium rounded-lg bg-white text-zinc-900 hover:bg-zinc-100 disabled:opacity-50">
            {isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {error && <div className="px-5 py-2 bg-red-50 border-b border-red-100 text-sm text-red-600">{error}</div>}

      <div className="flex flex-1 min-h-0">
        {/* Left nav */}
        <aside className="w-56 shrink-0 border-r border-slate-100 bg-slate-50/60 py-4 px-3">
          <p className="px-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Manage</p>
          {STEPS.map((s) => (
            <button key={s.key} onClick={() => setStep(s.key)}
              className={cn("w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors", step === s.key ? "bg-white text-zinc-900 shadow-sm border border-slate-200" : "text-slate-600 hover:bg-white/70")}>
              {s.label}
            </button>
          ))}
        </aside>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-8 py-8">
            {step === "details" && (
              <div className="space-y-5">
                <h2 className="text-lg font-semibold text-slate-900">Add property details</h2>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Property label <span className="text-red-500">*</span></label>
                  <input value={name} onChange={(e) => onNameChange(e.target.value)} className={INPUT} placeholder="e.g. Insurance Plan" autoFocus />
                  <div className="mt-1.5 flex items-center gap-2">
                    <Code2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="text-xs text-slate-400 shrink-0">Internal name</span>
                    <input value={internalName} onChange={(e) => { setInternalName(slugify(e.target.value)); setInternalTouched(true) }}
                      placeholder="auto-filled" className="flex-1 min-w-0 font-mono text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-zinc-900/10" />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">Personalization token: <span className="font-mono">{`{${internalName || "field"}}`}</span></p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Object type</label>
                  <div className={INPUT + " bg-slate-50 text-slate-500"}>{entityLabel}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={INPUT + " resize-none"} placeholder="Optional — what this property is for" />
                </div>
                <div className="pt-2">
                  <button onClick={() => setStep("field")} className="h-9 px-4 text-sm font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800">Next: Field type</button>
                </div>
              </div>
            )}

            {step === "field" && (
              <div className="space-y-5">
                <h2 className="text-lg font-semibold text-slate-900">Choose a field type</h2>
                {editing ? (
                  <div className="flex items-center gap-2.5 p-3 border border-slate-200 rounded-xl bg-slate-50">
                    {(() => { const I = typeMeta(type).icon; return <I className="h-4 w-4 text-slate-500" /> })()}
                    <div><p className="text-sm font-medium text-slate-800">{typeMeta(type).label}</p><p className="text-xs text-slate-400">Field type can't be changed after creation</p></div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {FIELD_TYPES.map((ft) => {
                      const I = ft.icon
                      return (
                        <button key={ft.value} onClick={() => setType(ft.value)}
                          className={cn("flex flex-col items-start gap-1.5 p-3 rounded-xl border text-left transition-colors", type === ft.value ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900" : "border-slate-200 hover:border-slate-300")}>
                          <I className="h-4 w-4 text-slate-600" />
                          <span className="text-sm font-medium text-slate-800">{ft.label}</span>
                          <span className="text-[11px] text-slate-400">{ft.desc}</span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {hasOptions && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-slate-700">Options ({options.length})</label>
                      {options.length > 6 && (
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                          <input value={optQuery} onChange={(e) => setOptQuery(e.target.value)} placeholder="Search" className="pl-8 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-zinc-400" />
                        </div>
                      )}
                    </div>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="grid grid-cols-[24px_1fr_1fr_32px] gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                        <span></span><span>Label</span><span>Internal name</span><span></span>
                      </div>
                      {options.map((opt, i) => {
                        if (optQuery && !opt.toLowerCase().includes(optQuery.toLowerCase())) return null
                        return (
                          <div key={i} draggable onDragStart={() => setDragIdx(i)}
                            onDragOver={(e) => { e.preventDefault(); if (dragIdx !== null && dragIdx !== i) { moveOpt(dragIdx, i); setDragIdx(i) } }}
                            onDragEnd={() => setDragIdx(null)}
                            className="grid grid-cols-[24px_1fr_1fr_32px] gap-2 items-center px-3 py-1.5 border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                            <GripVertical className="h-4 w-4 text-slate-300 cursor-grab" />
                            <input value={opt} onChange={(e) => setOpt(i, e.target.value)} placeholder="Option label" className="text-sm border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:border-zinc-400" />
                            <span className="text-xs font-mono text-slate-400 truncate">{slugify(opt) || "—"}</span>
                            <button onClick={() => removeOpt(i)} className="text-slate-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        )
                      })}
                      <button onClick={addOpt} className="w-full px-3 py-2 text-sm text-blue-600 hover:bg-slate-50 flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" /> Add option</button>
                    </div>
                  </div>
                )}

                {type !== "CHECKBOX" && type !== "LONG_TEXT" && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Default value</label>
                    <p className="text-xs text-slate-400 mb-1.5">Suggested when filling this field on a record.</p>
                    {hasOptions ? (
                      <StyledSelect value={defaultValue} onChange={(e) => setDefaultValue(e.target.value)} className={INPUT}>
                        <option value="">No default</option>
                        {options.filter(Boolean).map((o) => <option key={o} value={o}>{o}</option>)}
                      </StyledSelect>
                    ) : (
                      <input type={type === "NUMBER" ? "number" : type === "DATE" ? "date" : type === "DATE_TIME" ? "datetime-local" : "text"}
                        value={defaultValue} onChange={(e) => setDefaultValue(e.target.value)} className={INPUT} placeholder="No default" />
                    )}
                  </div>
                )}
              </div>
            )}

            {step === "rules" && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-900">Rules</h2>
                <div className="border border-slate-200 rounded-xl px-4">
                  <Toggle on={required} set={setRequired} label="Required" hint="Records can't be saved without a value (where enforced)." />
                  <Toggle on={unique} set={setUnique} label="Require unique values" hint="No two records of this object can share the same value." />
                </div>
              </div>
            )}

            {step === "preview" && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-900">Preview</h2>
                <p className="text-sm text-slate-500">How this property appears on a record.</p>
                <div className="max-w-sm border border-slate-200 rounded-xl p-4">
                  <span className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">{name || "Property label"}{required && <span className="text-red-500"> *</span>}</span>
                  <PreviewField type={type} options={options} defaultValue={defaultValue} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewField({ type, options, defaultValue }: { type: string; options: string[]; defaultValue: string }) {
  const cls = "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-500"
  if (type === "CHECKBOX") return <div className="inline-flex items-center gap-2 text-sm text-slate-500"><span className="h-5 w-9 rounded-full bg-slate-200 relative"><span className="absolute h-4 w-4 rounded-full bg-white top-0.5 left-0.5" /></span> No</div>
  if (type === "LONG_TEXT") return <div className={cls + " h-16"}>{defaultValue || ""}</div>
  if (type === "DROPDOWN" || type === "MULTI_SELECT") return <div className={cls + " flex items-center justify-between"}><span>{defaultValue || (options.filter(Boolean)[0] ?? "Select…")}</span><ChevronDownCircle className="h-3.5 w-3.5" /></div>
  return <div className={cls}>{defaultValue || placeholderFor(type)}</div>
}
function placeholderFor(type: string) {
  return { EMAIL: "name@example.com", PHONE: "+1 555 123 4567", URL: "https://…", NUMBER: "0", DATE: "MM/DD/YYYY", DATE_TIME: "MM/DD/YYYY, 00:00" }[type] ?? "Text value"
}
