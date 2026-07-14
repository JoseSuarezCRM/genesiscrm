"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Settings, Plus, Check, X, Trash2, Loader2 } from "lucide-react"
import { updateRecordField } from "@/app/actions/record-fields"
import { createCardLayout, updateCardLayout, deleteCardLayout } from "@/app/actions/card-layouts"
import type { RecordFieldDef } from "@/lib/record-field-catalog"
import StyledSelect from "@/components/ui/styled-select"
import { cn } from "@/lib/utils"

export interface PropertyCard {
  cardName: string
  title: string
  fields: string[]
}

interface Props {
  entityType: string
  recordId: string
  cards: PropertyCard[]
  /** Every editable property of this object — base columns + custom properties. */
  catalog: RecordFieldDef[]
  values: Record<string, any>
  canEdit: boolean
  /** Card layouts are a Views permission, like on Referrals. */
  canEditCards: boolean
  /** Which column these cards belong to — new cards are created there. */
  section?: "LEFT" | "MIDDLE"
}

function display(f: RecordFieldDef, v: any): string {
  if (v === null || v === undefined || v === "") return "—"
  if (f.type === "date") return new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  if (Array.isArray(v)) return v.join(", ")
  return String(v)
}

// One property row: click the value to edit it in place.
function FieldRow({ f, value, recordId, entityType, canEdit }: {
  f: RecordFieldDef; value: any; recordId: string; entityType: string; canEdit: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<any>(value ?? "")

  function save() {
    startTransition(async () => {
      const res = await updateRecordField(entityType as any, recordId, f.key, draft)
      if (!(res as any)?.error) { setEditing(false); router.refresh() }
    })
  }

  if (!canEdit || f.readOnly) {
    return (
      <div className="flex justify-between gap-4 py-1.5">
        <span className="text-slate-500 shrink-0">{f.label}</span>
        <span className="text-slate-900 font-medium text-right break-words">{display(f, value)}</span>
      </div>
    )
  }

  if (!editing) {
    return (
      <button onClick={() => { setDraft(value ?? ""); setEditing(true) }}
        className="w-full flex justify-between gap-4 py-1.5 text-left rounded-md hover:bg-slate-50 -mx-1 px-1 transition-colors group">
        <span className="text-slate-500 shrink-0">{f.label}</span>
        <span className={cn("text-right break-words font-medium", value ? "text-slate-900" : "text-slate-400 group-hover:text-slate-600")}>
          {display(f, value)}
        </span>
      </button>
    )
  }

  const input = "w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-zinc-400"
  return (
    <div className="py-1.5 space-y-1.5">
      <span className="text-xs text-slate-500">{f.label}</span>
      {f.type === "select" ? (
        <StyledSelect value={String(draft ?? "")} onChange={(e) => setDraft(e.target.value)} className={input}>
          <option value="">—</option>
          {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </StyledSelect>
      ) : f.type === "long_text" ? (
        <textarea rows={3} value={String(draft ?? "")} onChange={(e) => setDraft(e.target.value)} className={input + " resize-none"} />
      ) : (
        <input
          type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
          value={String(draft ?? "")}
          onChange={(e) => setDraft(e.target.value)}
          className={input}
          autoFocus
        />
      )}
      <div className="flex items-center gap-1">
        <button onClick={save} disabled={isPending}
          className="inline-flex items-center gap-1 h-7 px-2 rounded-lg bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 disabled:opacity-50">
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
        </button>
        <button onClick={() => setEditing(false)} className="h-7 px-2 text-xs text-slate-500 hover:text-slate-800">Cancel</button>
      </div>
    </div>
  )
}

// Gear → rename the card, add/remove its properties, or delete it.
function CardEditor({ card, catalog, entityType, onDone }: {
  card: PropertyCard; catalog: RecordFieldDef[]; entityType: string; onDone: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [title, setTitle] = useState(card.title)
  const [fields, setFields] = useState<string[]>(card.fields)

  function toggle(key: string) {
    setFields((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key])
  }

  function save() {
    startTransition(async () => {
      await updateCardLayout(entityType as any, card.cardName, title.trim() || card.title, fields)
      onDone(); router.refresh()
    })
  }

  function remove() {
    if (!confirm(`Delete the "${card.title}" card?`)) return
    startTransition(async () => {
      await deleteCardLayout(entityType as any, card.cardName)
      onDone(); router.refresh()
    })
  }

  return (
    <div className="p-4 space-y-3">
      <input value={title} onChange={(e) => setTitle(e.target.value)}
        className="w-full text-sm font-semibold border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-zinc-400" />
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {catalog.map((f) => (
          <button key={f.key} onClick={() => toggle(f.key)}
            className="w-full flex items-center gap-2 px-1 py-1.5 text-sm text-left rounded-md hover:bg-slate-50">
            <span className={cn("shrink-0 w-[14px] h-[14px] rounded border flex items-center justify-center",
              fields.includes(f.key) ? "bg-zinc-900 border-zinc-900" : "border-slate-300")}>
              {fields.includes(f.key) && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
            </span>
            <span className="text-slate-700">{f.label}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={isPending}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50">
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
        </button>
        <button onClick={onDone} className="h-8 px-2 text-sm text-slate-500 hover:text-slate-800">Cancel</button>
        <button onClick={remove} disabled={isPending}
          className="ml-auto h-8 w-8 inline-flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

export default function RecordPropertyCards({ entityType, recordId, cards, catalog, values, canEdit, canEditCards, section = "LEFT" }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editingCard, setEditingCard] = useState<string | null>(null)

  const byKey = Object.fromEntries(catalog.map((f) => [f.key, f]))

  function addCard() {
    startTransition(async () => {
      await createCardLayout(entityType as any, "New card", [], section)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {canEditCards && (
        <div className="flex justify-end">
          <button onClick={addCard} disabled={isPending}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900">
            <Plus className="h-3.5 w-3.5" /> Add card
          </button>
        </div>
      )}

      {cards.map((card) => (
        <div key={card.cardName} className="bg-white border border-slate-200 rounded-xl">
          {editingCard === card.cardName ? (
            <CardEditor card={card} catalog={catalog} entityType={entityType} onDone={() => setEditingCard(null)} />
          ) : (
            <>
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-900">{card.title}</h2>
                {canEditCards && (
                  <button onClick={() => setEditingCard(card.cardName)} title="Customize card"
                    className="text-slate-300 hover:text-slate-600">
                    <Settings className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="p-5 text-sm">
                {card.fields.length === 0 ? (
                  <p className="text-sm text-slate-400">No properties on this card yet.</p>
                ) : (
                  card.fields
                    .map((key) => byKey[key])
                    .filter(Boolean)
                    .map((f) => (
                      <FieldRow key={f.key} f={f} value={values[f.key]} recordId={recordId} entityType={entityType} canEdit={canEdit} />
                    ))
                )}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
