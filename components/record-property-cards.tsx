"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Settings, Plus, Check, Loader2 } from "lucide-react"
import { updateRecordField } from "@/app/actions/record-fields"
import LeftCardEditorModal from "@/components/left-card-editor-modal"
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

export default function RecordPropertyCards({ entityType, recordId, cards, catalog, values, canEdit, canEditCards, section = "LEFT" }: Props) {
  const router = useRouter()
  // null = closed; PropertyCard = editing that card; "new" = creating one.
  const [editing, setEditing] = useState<PropertyCard | "new" | null>(null)

  const byKey = Object.fromEntries(catalog.map((f) => [f.key, f]))
  // The same "Edit Card" modal Referrals uses, fed this object's own properties.
  const pool = catalog.map((f) => ({ id: f.key, label: f.label }))

  return (
    <div className="space-y-4">
      {canEditCards && (
        <div className="flex justify-end">
          <button onClick={() => setEditing("new")}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900">
            <Plus className="h-3.5 w-3.5" /> Add card
          </button>
        </div>
      )}

      {cards.map((card) => (
        <div key={card.cardName} className="bg-white border border-slate-200 rounded-xl">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">{card.title}</h2>
            {canEditCards && (
              <button onClick={() => setEditing(card)} title="Edit card"
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
        </div>
      ))}

      {editing && (
        <LeftCardEditorModal
          open
          onOpenChange={(o) => { if (!o) setEditing(null) }}
          entityType={entityType}
          existing={editing === "new" ? null : editing}
          fields={pool}
          section={section}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  )
}
