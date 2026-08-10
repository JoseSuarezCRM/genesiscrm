"use client"

import { useState, useTransition } from "react"
import {
  createRecordCard,
  updateRecordCard,
  deleteRecordCard,
} from "@/app/actions/record-card-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Trash2, GripVertical, X, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { referralLeftFieldPool } from "@/lib/card-field-definitions"

interface CardLayout {
  cardName: string
  title: string
  fields: string[]
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Any object key — a built-in ("PROVIDER") or a custom object ("CO:visits").
  entityType: string
  // null = creating a new card
  existing: CardLayout | null
  // custom properties defined in Settings, selectable like built-in fields
  customProperties?: { id: string; name: string }[]
  // The object's own properties. When omitted, the Referral pool is used.
  fields?: { id: string; label: string }[]
  // Which column a newly created card belongs to.
  section?: "LEFT" | "MIDDLE"
  onSaved?: () => void
  // When provided, the modal delegates persistence to the parent (which saves the
  // whole column) instead of writing this one card directly.
  columnsEnabled?: boolean
  // Offer a card-type choice (Properties vs Call log).
  cardTypesEnabled?: boolean
  onSubmit?: (data: { title: string; fields: string[]; columns: number; kind: string; config: any }) => void
  onDelete?: () => void
}

export default function LeftCardEditorModal({
  open,
  onOpenChange,
  entityType,
  existing,
  customProperties = [],
  fields: fieldDefs,
  section = "LEFT",
  onSaved,
  onSubmit,
  onDelete,
  columnsEnabled = false,
  cardTypesEnabled = false,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [title, setTitle] = useState(existing?.title ?? "")
  const [fields, setFields] = useState<string[]>(existing?.fields ?? [])
  const [columns, setColumns] = useState<number>((existing as any)?.columns ?? 1)
  const [kind, setKind] = useState<string>((existing as any)?.kind ?? "PROPERTIES")
  const [maxCalls, setMaxCalls] = useState<number>((existing as any)?.config?.maxCalls ?? 3)
  const [dragId, setDragId] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  const fieldPool = fieldDefs ?? [
    ...referralLeftFieldPool,
    ...customProperties.map((p) => ({ id: `custom:${p.id}`, label: p.name })),
  ]
  const labelFor = (id: string) => fieldPool.find((f) => f.id === id)?.label ?? id

  // Selected fields, in display order; available = the rest of the pool (filtered by search).
  const selected = fields.filter((id) => fieldPool.some((f) => f.id === id))
  const available = fieldPool
    .filter((f) => !fields.includes(f.id))
    .filter((f) => f.label.toLowerCase().includes(query.trim().toLowerCase()))

  const addField = (id: string) => setFields((prev) => [...prev, id])
  const removeField = (id: string) => setFields((prev) => prev.filter((f) => f !== id))

  // Drag-to-reorder: live-move the dragged field ahead of the one it's over.
  const reorder = (fromId: string, toId: string) =>
    setFields((prev) => {
      const arr = [...prev]
      const from = arr.indexOf(fromId)
      const to = arr.indexOf(toId)
      if (from < 0 || to < 0 || from === to) return prev
      arr.splice(to, 0, arr.splice(from, 1)[0])
      return arr
    })

  const handleSave = () => {
    const trimmed = title.trim()
    if (!trimmed) return
    // Parent-managed mode: hand the edited card back; it persists the whole column.
    if (onSubmit) { onSubmit({ title: trimmed, fields, columns, kind, config: kind === "CALL_LOG" ? { maxCalls } : null }); onOpenChange(false); return }
    startTransition(async () => {
      if (existing) {
        await updateRecordCard(entityType, existing.cardName, trimmed, fields)
      } else {
        await createRecordCard(entityType, trimmed, fields, section)
      }
      onSaved?.()
      onOpenChange(false)
    })
  }

  const handleDelete = () => {
    if (!existing) return
    if (onDelete) { onDelete(); onOpenChange(false); return }
    startTransition(async () => {
      await deleteRecordCard(entityType, existing.cardName)
      onSaved?.()
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{existing ? "Edit Card" : "Create Card"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4 flex-1 overflow-y-auto min-h-0">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Card name</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Key Information"
            />
          </div>

          {cardTypesEnabled && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Card type</label>
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
                {[["PROPERTIES", "Properties"], ["CALL_LOG", "Call log"], ["ATTACHMENTS", "Attachments"]].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setKind(v)}
                    className={cn("h-8 px-3 rounded-md text-sm font-medium transition-colors",
                      kind === v ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100")}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}

          {kind === "CALL_LOG" ? (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Number of call slots</label>
              <Input type="number" min={1} max={20} value={maxCalls}
                onChange={(e) => setMaxCalls(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} className="w-28" />
              <p className="text-xs text-slate-400">Log up to {maxCalls} call{maxCalls > 1 ? "s" : ""} on this card.</p>
            </div>
          ) : kind === "ATTACHMENTS" ? (
            <p className="text-xs text-slate-500">Upload documents and files directly on the record. No properties to configure — just name the card.</p>
          ) : (
          <>
          {columnsEnabled && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Layout</label>
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
                {[1, 2, 3].map((n) => (
                  <button key={n} type="button" onClick={() => setColumns(n)}
                    className={cn("h-8 px-3 rounded-md text-sm font-medium transition-colors",
                      columns === n ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100")}>
                    {n} column{n > 1 ? "s" : ""}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400">Properties are laid out {columns} across.</p>
            </div>
          )}

          <div className="border rounded-lg p-4 border-slate-200 bg-white space-y-3">
            <p className="text-xs text-slate-500">
              {selected.length} of {fieldPool.length} properties shown · drag to reorder
            </p>

            {/* Selected, in display order — drag the handle to reorder */}
            {selected.length > 0 && (
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {selected.map((id) => (
                  <div
                    key={id}
                    draggable
                    onDragStart={() => setDragId(id)}
                    onDragEnd={() => setDragId(null)}
                    onDragOver={(e) => { e.preventDefault(); if (dragId && dragId !== id) reorder(dragId, id) }}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 transition-shadow",
                      dragId === id ? "opacity-50" : "hover:border-slate-300",
                    )}
                  >
                    <GripVertical className="h-4 w-4 text-slate-300 cursor-grab shrink-0" />
                    <span className="flex-1 text-sm text-slate-700 truncate">{labelFor(id)}</span>
                    <button
                      type="button"
                      onClick={() => removeField(id)}
                      className="text-slate-300 hover:text-red-500 shrink-0"
                      title="Remove from card"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Available to add */}
            {fieldPool.some((f) => !fields.includes(f.id)) && (
              <div className="pt-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1.5">Add a property</p>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search properties…"
                  className="w-full mb-2 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
                />
                {available.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {available.map((field) => (
                      <button
                        key={field.id}
                        type="button"
                        onClick={() => addField(field.id)}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
                      >
                        <Plus className="h-3 w-3" /> {field.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 py-1">No properties match “{query}”.</p>
                )}
              </div>
            )}
          </div>
          </>
          )}
        </div>

        <DialogFooter className="border-t pt-4 shrink-0">
          {existing && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
              className="mr-auto"
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Delete Card
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending || !title.trim()}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
