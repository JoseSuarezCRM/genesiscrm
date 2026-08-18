"use client"

import { useState, useTransition, type ReactNode } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, Check, Settings2 } from "lucide-react"
import { PropertyInput } from "@/components/ui/property-input"
import CreateFormEditor from "@/components/create-form-editor"
import { type RecordFieldDef } from "@/lib/record-field-catalog"
import { type CreateFormField } from "@/app/actions/create-form"
import { isPropertyVisible } from "@/lib/record-field-catalog"

// A configurable, data-driven create-record modal shared by every object. Renders
// the object's configured fields (or the full catalog when unconfigured) with the
// same controls the record detail uses, via PropertyInput. An admin gear opens the
// field-picker editor. `specialFields` lets an object inject a bespoke widget for a
// given field key (e.g. an association picker) instead of the generic input.
export default function CreateRecordModal({
  objectType, title, catalog, config, users = [], canEditForm = false, specialFields = {}, onSubmit, onClose, onSaved, onConfigChanged,
}: {
  objectType: string
  title: string
  catalog: RecordFieldDef[]
  config: CreateFormField[] | null
  users?: { id: string; label: string }[]
  canEditForm?: boolean
  specialFields?: Record<string, (value: any, set: (v: any) => void, values: Record<string, any>) => ReactNode>
  onSubmit: (values: Record<string, any>) => Promise<{ error?: string } | void>
  onClose: () => void
  onSaved: () => void
  onConfigChanged?: () => void
}) {
  const [values, setValues] = useState<Record<string, any>>(() => {
    const seed: Record<string, any> = {}
    for (const f of catalog) if (f.default != null && f.default !== "") seed[f.key] = f.default
    return seed
  })
  const [err, setErr] = useState("")
  const [editorOpen, setEditorOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const set = (k: string, v: any) => setValues((p) => ({ ...p, [k]: v }))

  const byKey = Object.fromEntries(catalog.map((c) => [c.key, c]))
  // Shown fields: the config's order (filtered to still-valid keys), else the whole catalog.
  const shown: { def: RecordFieldDef; required: boolean }[] = (config && config.length > 0)
    ? config.filter((f) => byKey[f.key]).map((f) => ({ def: byKey[f.key], required: !!f.required }))
    : catalog.map((c) => ({ def: c, required: !!c.required }))
  // Respect visibility rules (a field only shows when its controlling value matches).
  const visible = shown.filter(({ def }) => isPropertyVisible(def.visibilityRule, values))

  const isEmpty = (v: any) => v == null || v === "" || (Array.isArray(v) && v.length === 0)

  function save() {
    setErr("")
    const missing = visible.find(({ def, required }) => required && isEmpty(values[def.key]))
    if (missing) { setErr(`${missing.def.label} is required`); return }
    startTransition(async () => {
      const res = await onSubmit(values)
      if (res && (res as any).error) { setErr(typeof (res as any).error === "string" ? (res as any).error : "Could not create"); return }
      onSaved()
    })
  }

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <div className="flex items-center justify-between gap-2 pr-6">
              <DialogTitle>{title}</DialogTitle>
              {canEditForm && (
                <button onClick={() => setEditorOpen(true)} title="Edit create form" className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                  <Settings2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </DialogHeader>
          <div className="space-y-3">
            {visible.map(({ def, required }) => (
              <div key={def.key}>
                <label className="text-xs font-medium text-slate-600 block mb-1">{def.label}{required ? " *" : ""}</label>
                {specialFields[def.key]
                  ? specialFields[def.key](values[def.key], (v) => set(def.key, v), values)
                  : <PropertyInput def={def} value={values[def.key]} onChange={(v) => set(def.key, v)} users={users} values={values} />}
              </div>
            ))}
            {err && <p className="text-xs text-red-600">{err}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={save} disabled={isPending} className="h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1.5">
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Create
              </button>
              <button onClick={onClose} className="h-9 px-3 text-sm text-slate-500 hover:text-slate-800">Cancel</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {editorOpen && (
        <CreateFormEditor
          objectType={objectType}
          catalog={catalog}
          initial={config ?? []}
          onClose={() => setEditorOpen(false)}
          onSaved={() => { setEditorOpen(false); onConfigChanged?.() }}
        />
      )}
    </>
  )
}
