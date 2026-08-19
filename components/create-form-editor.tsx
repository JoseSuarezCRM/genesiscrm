"use client"

import { useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { GripVertical, X, Plus, Loader2, Check, Search } from "lucide-react"
import { useCardReorder } from "@/components/use-card-reorder"
import { saveCreateForm, type CreateFormField } from "@/app/actions/create-form"
import { type RecordFieldDef } from "@/lib/record-field-catalog"
import { cn } from "@/lib/utils"

// Admin editor: pick which catalog fields appear in an object's create modal, in
// what order, and which are required at creation. Mirrors the card-layout editor.
export default function CreateFormEditor({ objectType, catalog, initial, onClose, onSaved }: {
  objectType: string
  catalog: RecordFieldDef[]
  initial: CreateFormField[]
  onClose: () => void
  onSaved: () => void
}) {
  const labelOf = (k: string) => catalog.find((c) => c.key === k)?.label ?? k
  const [fields, setFields] = useState<CreateFormField[]>(initial.filter((f) => catalog.some((c) => c.key === f.key)))
  const [q, setQ] = useState("")
  const [saving, startSave] = useTransition()

  const selectedKeys = new Set(fields.map((f) => f.key))
  const available = catalog.filter((c) => !selectedKeys.has(c.key) && (!q || c.label.toLowerCase().includes(q.toLowerCase())))
  const reorder = useCardReorder(fields, (f) => f.key, (ids) => setFields(ids.map((k) => fields.find((f) => f.key === k)!).filter(Boolean)))

  const add = (key: string) => setFields((p) => [...p, { key }])
  const remove = (key: string) => setFields((p) => p.filter((f) => f.key !== key))
  const toggleReq = (key: string) => setFields((p) => p.map((f) => f.key === key ? { ...f, required: !f.required } : f))

  function save() {
    startSave(async () => { await saveCreateForm(objectType, fields); onSaved() })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          const t = (e.detail as any)?.originalEvent?.target as HTMLElement | null
          if (t?.closest?.("[data-select-menu-open]")) e.preventDefault()
        }}>
        <DialogHeader><DialogTitle>Edit create form</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-500 -mt-2">Choose which fields appear when creating a record, their order, and which are required.</p>
        <div className="grid grid-cols-2 gap-4 min-h-0 flex-1">
          {/* Catalog */}
          <div className="flex flex-col min-h-0 border border-slate-200 rounded-xl">
            <div className="p-2 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search fields…" className="w-full h-8 pl-7 pr-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-zinc-400" />
              </div>
            </div>
            <div className="overflow-y-auto p-1.5 space-y-0.5">
              {available.length === 0 && <div className="px-2 py-3 text-sm text-slate-400">No fields.</div>}
              {available.map((c) => (
                <button key={c.key} onClick={() => add(c.key)} className="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-sm text-left rounded-md hover:bg-slate-50 text-slate-700">
                  <span className="truncate">{c.label}</span>
                  <Plus className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                </button>
              ))}
            </div>
          </div>
          {/* Selected */}
          <div className="flex flex-col min-h-0 border border-slate-200 rounded-xl">
            <div className="px-3 py-2 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">In the form ({fields.length})</div>
            <div className="overflow-y-auto p-1.5 space-y-0.5">
              {fields.length === 0 && <div className="px-2 py-3 text-sm text-slate-400">Add fields from the left. If empty, all fields show.</div>}
              {reorder.order.map((f) => (
                <div key={f.key} {...reorder.cardProps(f.key)} className={cn("flex items-center gap-2 px-2 py-1.5 rounded-md bg-white border border-transparent hover:border-slate-200", reorder.dragging === f.key && "opacity-50")}>
                  <span {...reorder.handleProps(f.key)} className="cursor-grab active:cursor-grabbing text-slate-300"><GripVertical className="h-4 w-4" /></span>
                  <span className="flex-1 truncate text-sm text-slate-700">{labelOf(f.key)}</span>
                  <button onClick={() => toggleReq(f.key)} title="Required at creation" className={cn("text-[11px] px-1.5 py-0.5 rounded font-medium", f.required ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-400 hover:text-slate-600")}>Required</button>
                  <button onClick={() => remove(f.key)} className="text-slate-300 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button onClick={onClose} className="h-9 px-3 text-sm text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving} className="h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1.5">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save form</button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
