"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, Pencil, Search, GripVertical, Box } from "lucide-react"
import StyledSelect from "@/components/ui/styled-select"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import PropertyEditor, { type PropertyDraft } from "@/components/property-editor"
import { useCardReorder } from "@/components/use-card-reorder"
import { createCustomProperty, updateCustomProperty, deleteCustomProperty, getNativeVisibilityControllers } from "@/app/actions/custom-properties"
import { saveCustomObjectProperties, type CustomObjectProperty, type CustomPropType } from "@/app/actions/custom-objects"
import { cn } from "@/lib/utils"

// ── Data the page hands down ──────────────────────────────────────────────────

/** A built-in field, defined in code (lib/record-field-catalog.ts RECORD_FIELDS). */
export interface NativeFieldRow {
  key: string
  label: string
  type: string
  options: string[]
  optionLabels?: Record<string, string>
  readOnly: boolean
}

/** A custom property on a built-in object (a CustomProperty row). */
export interface BuiltinPropRow {
  id: string
  name: string
  internalName: string | null
  type: string
  required: boolean
  unique: boolean
  description: string | null
  defaultValue: string | null
  options: string[]
  optionLabels: Record<string, string> | null
  optionColors: Record<string, string> | null
  optionStyle: string | null
  conditional: any
  visibilityRule: any
  numberFormat: string | null
}

export type PropertiesObject =
  | { kind: "builtin"; key: string; label: string; icon: string; native: NativeFieldRow[]; custom: BuiltinPropRow[] }
  | { kind: "custom"; key: string; label: string; icon: null; defId: string; properties: CustomObjectProperty[] }

// Type pills: custom property types, and the built-in catalog's own types.
const TYPE_LABELS: Record<string, string> = {
  TEXT: "Text", LONG_TEXT: "Long text", NUMBER: "Number", EMAIL: "Email", PHONE: "Phone", DATE: "Date",
  DATE_TIME: "Date & time", CHECKBOX: "Checkbox", DROPDOWN: "Dropdown", MULTI_SELECT: "Multi-select", URL: "URL", USER: "User",
  text: "Text", long_text: "Long text", number: "Number", email: "Email", phone: "Phone", date: "Date",
  datetime: "Date & time", checkbox: "Checkbox", select: "Dropdown", select_or_other: "Dropdown + other", user: "User",
}
const typeLabel = (t: string) => TYPE_LABELS[t] ?? t
const optionsLine = (options?: string[] | null, labels?: Record<string, string> | null) =>
  (options ?? []).length ? `Options: ${(options ?? []).map((o) => labels?.[o] ?? o).join(", ")}` : null
const matches = (q: string, ...texts: (string | null | undefined)[]) => !q || texts.some((t) => (t ?? "").toLowerCase().includes(q))

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PropertiesSettings({ objects, initialObject }: { objects: PropertiesObject[]; initialObject?: string }) {
  const router = useRouter()
  const [selectedKey, setSelectedKey] = useState(objects.find((o) => o.key === initialObject)?.key ?? objects[0]?.key ?? "")
  const [query, setQuery] = useState("")
  // Bumped by the toolbar's Create property; the panel opens the editor on change.
  const [createSignal, setCreateSignal] = useState(0)
  const selected = objects.find((o) => o.key === selectedKey) ?? objects[0]

  function choose(key: string) {
    setSelectedKey(key)
    setQuery("")
    // Keep the address in step, so a link reproduces the object on screen.
    router.replace(`/settings/properties?object=${encodeURIComponent(key)}`, { scroll: false })
  }

  if (!selected) return null
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-500">Object</span>
          <StyledSelect searchable value={selected.key} onChange={(e) => choose(e.target.value)} className="min-w-[220px]">
            {objects.map((o) => (
              <option key={o.key} value={o.key}>{o.icon ? `${o.icon}  ` : ""}{o.label}{o.kind === "custom" ? " · custom" : ""}</option>
            ))}
          </StyledSelect>
        </div>
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${selected.label} properties…`}
            className="w-full rounded-lg border border-zinc-200 py-2 pl-9 pr-3 text-sm focus:border-zinc-400 focus:outline-none" />
        </div>
        <button onClick={() => setCreateSignal((n) => n + 1)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 text-sm font-medium text-white hover:bg-blue-700">
          <Plus className="h-4 w-4" /> Create property
        </button>
      </div>

      {selected.kind === "builtin"
        ? <BuiltinPanel key={selected.key} object={selected} query={query.trim().toLowerCase()} createSignal={createSignal} />
        : <CustomPanel key={selected.key} object={selected} query={query.trim().toLowerCase()} createSignal={createSignal} />}
    </div>
  )
}

/** Opens the editor when the toolbar's signal changes after this panel mounted. */
function useCreateSignal(signal: number, open: () => void) {
  const seen = useRef(signal)
  useEffect(() => {
    if (signal !== seen.current) { seen.current = signal; open() }
  }, [signal, open])
}

// ── Shared list chrome (the Custom Objects design) ────────────────────────────

function Card({ icon, label, count, total, children, footer }: {
  icon: React.ReactNode; label: string; count: number; total: number; children: React.ReactNode; footer?: React.ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-2.5">
        <span className="text-base">{icon}</span>
        <h2 className="text-sm font-semibold text-zinc-800">{label}</h2>
        <span className="text-xs text-zinc-400">{count === total ? total : `${count} of ${total}`}</span>
      </div>
      <div className="divide-y divide-zinc-100">{children}</div>
      {footer}
    </div>
  )
}

function Row({ name, sub, type, tags, grip, onEdit, onDelete, rowProps, dimmed }: {
  name: string; sub?: string | null; type: string; tags?: React.ReactNode
  grip?: React.HTMLAttributes<HTMLSpanElement> & { draggable?: boolean }
  onEdit?: () => void; onDelete?: () => void
  rowProps?: React.HTMLAttributes<HTMLDivElement>; dimmed?: boolean
}) {
  return (
    <div {...rowProps} className={cn("group flex items-center gap-2 px-3 py-2", dimmed && "opacity-50")}>
      {grip ? (
        <span {...grip} className={cn("text-zinc-300 hover:text-zinc-500", grip.className)}><GripVertical className="h-3.5 w-3.5" /></span>
      ) : <span className="w-3.5 shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-800">{name || <span className="text-zinc-400">Untitled</span>}</p>
        {sub && <p className="truncate text-xs text-zinc-400">{sub}</p>}
      </div>
      <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">{type}</span>
      {tags}
      {onEdit ? (
        <button onClick={onEdit} title="Edit" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      ) : <span className="w-8 shrink-0" />}
      {onDelete ? (
        <button onClick={onDelete} title="Delete" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-500 hover:bg-red-50">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : <span className="w-8 shrink-0" />}
    </div>
  )
}

const Tag = ({ children, title, tone = "zinc" }: { children: React.ReactNode; title?: string; tone?: "zinc" | "amber" }) => (
  <span title={title} className={cn("shrink-0 text-[10px] font-medium uppercase", tone === "amber" ? "text-amber-600" : "text-zinc-500")}>{children}</span>
)

// ── Built-in objects: code-defined fields + CustomProperty rows ───────────────

function BuiltinPanel({ object, query, createSignal }: { object: Extract<PropertiesObject, { kind: "builtin" }>; query: string; createSignal: number }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [editing, setEditing] = useState<BuiltinPropRow | "new" | null>(null)
  useCreateSignal(createSignal, () => setEditing("new"))

  // Native fields (Pipeline, Status…) usable as visibility controllers for this object.
  const [nativeCtrls, setNativeCtrls] = useState<{ key: string; name: string; options: string[]; optionLabels?: Record<string, string> }[]>([])
  useEffect(() => { getNativeVisibilityControllers(object.key as any).then(setNativeCtrls).catch(() => setNativeCtrls([])) }, [object.key])

  const native = object.native.filter((f) => matches(query, f.label, f.key))
  const custom = object.custom.filter((p) => matches(query, p.name, p.internalName, p.description))
  const total = object.native.length + object.custom.length
  const editingId = editing && editing !== "new" ? editing.id : null

  async function remove(p: BuiltinPropRow) {
    if (!(await confirmDialog(`Delete "${p.name}"? Existing data isn't removed, but the field stops appearing.`))) return
    startTransition(async () => { await deleteCustomProperty(p.id); router.refresh() })
  }

  return (
    <>
      <Card icon={object.icon} label={object.label} count={native.length + custom.length} total={total}>
        {native.length + custom.length === 0 && <p className="px-4 py-10 text-center text-sm text-zinc-400">No properties match.</p>}
        {native.map((f) => (
          <Row key={f.key} name={f.label} sub={optionsLine(f.options, f.optionLabels)} type={typeLabel(f.type)}
            tags={<>
              <Tag title="Defined by the CRM. It can't be deleted or retyped.">Built-in</Tag>
              {f.readOnly && <Tag title="Set by the CRM, not edited by hand.">Read-only</Tag>}
            </>} />
        ))}
        {custom.map((p) => (
          <Row key={p.id} name={p.name} sub={p.description || optionsLine(p.options, p.optionLabels)} type={typeLabel(p.type)}
            tags={p.required ? <Tag tone="amber">Required</Tag> : undefined}
            onEdit={() => setEditing(p)} onDelete={() => remove(p)} />
        ))}
      </Card>

      {editing && (
        <PropertyEditor
          entityLabel={object.label}
          editing={editing === "new" ? null : editing}
          controllingProps={object.custom.filter((p) => p.type === "DROPDOWN" && p.id !== editingId).map((p) => ({ id: p.id, name: p.name, options: p.options }))}
          visibilityControllers={[
            ...object.custom.filter((p) => p.id !== editingId).map((p) => ({
              key: `cp_${p.id}`, name: p.name,
              options: (p.type === "DROPDOWN" || p.type === "MULTI_SELECT") ? p.options : [],
              optionLabels: p.optionLabels ?? undefined,
            })),
            ...nativeCtrls,
          ]}
          onSave={async (d: PropertyDraft) => {
            const fields = {
              name: d.name, internalName: d.internalName, type: d.type as any, required: d.required, unique: d.unique,
              description: d.description, defaultValue: d.defaultValue, options: d.options, optionLabels: d.optionLabels,
              optionColors: d.optionColors, optionStyle: d.optionStyle, conditional: d.conditional, visibilityRule: d.visibilityRule,
              numberFormat: d.numberFormat,
            }
            const res = editing === "new"
              ? await createCustomProperty({ ...fields, entityType: object.key as any })
              : await updateCustomProperty({ id: editing.id, ...fields })
            if (!(res as any)?.error) router.refresh()
            return res as any
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

// ── Custom objects: the CustomObjectDef.properties JSON ───────────────────────

function newPropId() { return `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }

function CustomPanel({ object, query, createSignal }: { object: Extract<PropertiesObject, { kind: "custom" }>; query: string; createSignal: number }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [props, setProps] = useState<CustomObjectProperty[]>(object.properties)
  // A server refusal — mostly a locked property someone tried to change. The
  // stored list is re-read, so the screen never keeps a change that was refused.
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState<CustomObjectProperty | "new" | null>(null)
  useCreateSignal(createSignal, () => setEditing("new"))

  // Follow the server after a refresh (another save, or a refused one).
  const signature = JSON.stringify(object.properties)
  useEffect(() => { setProps(object.properties) /* eslint-disable-next-line */ }, [signature])

  async function persist(next: CustomObjectProperty[]): Promise<{ error?: string }> {
    setProps(next)
    const res = await saveCustomObjectProperties(object.defId, next).catch((e: any) => ({ error: e?.message ?? "Failed to save." }))
    const error = res && "error" in res ? (res.error ?? undefined) : undefined
    setErr(error ?? null)
    router.refresh()
    return error ? { error } : {}
  }

  // Drag to reorder — the order is the array order, used wherever the object's
  // properties are listed. Off while searching (a filtered list has no order).
  const reorder = useCardReorder(props, (p) => p.id, (keys) => {
    const byId = new Map(props.map((p) => [p.id, p]))
    startTransition(async () => { await persist(keys.map((k) => byId.get(k)!).filter(Boolean)) })
  })
  const searching = query.length > 0
  const list = searching ? props.filter((p) => matches(query, p.name, p.internalName, p.description)) : reorder.order

  async function remove(p: CustomObjectProperty) {
    if (p.primary || p.locked) return
    if (!(await confirmDialog(`Delete "${p.name}"? Existing data isn't removed, but the field stops appearing.`))) return
    startTransition(async () => { await persist(props.filter((x) => x.id !== p.id)) })
  }

  async function saveProp(draft: PropertyDraft, existing: CustomObjectProperty | null) {
    // Type is fixed after creation, except DROPDOWN ↔ MULTI_SELECT (shared options).
    const optType = (t?: string) => t === "DROPDOWN" || t === "MULTI_SELECT"
    const nextType = existing && optType(existing.type) && optType(draft.type) ? draft.type : (existing?.type ?? draft.type)
    const prop: CustomObjectProperty = {
      id: existing?.id ?? newPropId(),
      name: draft.name, type: nextType as CustomPropType,
      options: draft.options, optionLabels: draft.optionLabels, optionColors: draft.optionColors, optionStyle: draft.optionStyle,
      required: draft.required, primary: existing?.primary,
      internalName: draft.internalName, description: draft.description,
      unique: draft.unique, defaultValue: draft.defaultValue, conditional: draft.conditional,
      visibilityRule: draft.visibilityRule, numberFormat: draft.numberFormat,
      // Carried through: the editor doesn't know about it, and dropping it here
      // would read to the server as an attempt to unlock.
      ...(existing?.locked ? { locked: true } : {}),
    }
    return persist(existing ? props.map((p) => (p.id === existing.id ? prop : p)) : [...props, prop])
  }

  const editingId = editing && editing !== "new" ? editing.id : null
  return (
    <>
      {err && <p role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}
      <Card icon={<Box className="h-4 w-4 text-zinc-400" />} label={object.label} count={list.length} total={props.length}>
        {list.length === 0 && <p className="px-4 py-10 text-center text-sm text-zinc-400">{props.length ? "No properties match." : "No properties yet."}</p>}
        {list.map((p) => (
          <Row key={p.id} name={p.name} sub={p.description || optionsLine(p.options, p.optionLabels)} type={typeLabel(p.type)}
            grip={searching ? undefined : reorder.handleProps(p.id)}
            rowProps={searching ? undefined : reorder.cardProps(p.id)}
            dimmed={reorder.dragging === p.id}
            tags={<>
              {p.primary && <Tag title="The record's name">Primary</Tag>}
              {p.locked && <Tag title="Used by a built-in feature: you can rename it, but not delete it or change its type.">Locked</Tag>}
              {p.required && !p.primary && <Tag tone="amber">Required</Tag>}
            </>}
            onEdit={() => setEditing(p)}
            onDelete={p.primary || p.locked ? undefined : () => remove(p)} />
        ))}
      </Card>

      {editing && (
        <PropertyEditor
          entityLabel={object.label}
          editing={editing === "new" ? null : {
            id: editing.id, name: editing.name, internalName: editing.internalName, type: editing.type,
            required: editing.required, unique: editing.unique, description: editing.description,
            defaultValue: editing.defaultValue, options: editing.options, optionLabels: editing.optionLabels,
            optionColors: editing.optionColors, optionStyle: editing.optionStyle,
            conditional: editing.conditional, visibilityRule: editing.visibilityRule, numberFormat: editing.numberFormat,
          }}
          controllingProps={props.filter((p) => p.type === "DROPDOWN" && p.id !== editingId).map((p) => ({ id: p.id, name: p.name, options: p.options ?? [] }))}
          visibilityControllers={props.filter((p) => p.id !== editingId).map((p) => ({
            key: p.id, name: p.name,
            options: (p.type === "DROPDOWN" || p.type === "MULTI_SELECT") ? (p.options ?? []) : [],
            optionLabels: p.optionLabels,
          }))}
          onSave={(d) => saveProp(d, editing === "new" ? null : editing)}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
