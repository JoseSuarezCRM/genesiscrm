"use client"

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { Settings, Plus, Loader2, GripVertical, Search, ChevronDown, Check } from "lucide-react"
import { showToast } from "@/components/toast"
import { updateRecordField } from "@/app/actions/record-fields"
import { setRecordOwner } from "@/app/actions/record-owner"
import { replaceColumnCards } from "@/app/actions/record-card-actions"
import { useCardReorder } from "@/components/use-card-reorder"
import LeftCardEditorModal from "@/components/left-card-editor-modal"
import CallLogCard from "@/components/call-log-card"
import AttachmentsCard from "@/components/attachments-card"
import PhoneInput from "@/components/phone-input"
import { type RecordFieldDef, isPropertyVisible } from "@/lib/record-field-catalog"
import { OptionValue } from "@/components/option-value"
import StyledSelect from "@/components/ui/styled-select"
import { NotesTextarea } from "@/components/ui/notes-textarea"
import { useMenuFocusGuard } from "@/components/ui/use-menu-focus-guard"
import DatePicker from "@/components/ui/date-picker"
import { formatNumber } from "@/lib/number-format"
import { cn } from "@/lib/utils"

export interface PropertyCard {
  cardName: string
  title: string
  fields: string[]
  columns?: number
  kind?: string
  config?: any
}

interface UserOpt { id: string; label: string }

interface Props {
  entityType: string
  recordId: string
  cards: PropertyCard[]
  /** Every editable property of this object — base columns + custom properties + owner/audit. */
  catalog: RecordFieldDef[]
  values: Record<string, any>
  canEdit: boolean
  /** Card layouts are a Views permission, like on Referrals. */
  canEditCards: boolean
  /** Which column these cards belong to — new cards are created there. */
  section?: "LEFT" | "MIDDLE"
  /** Needed to render/edit the Record Owner field. */
  users?: UserOpt[]
  /** Renders the body of a functional card (kind other than PROPERTIES/CALL_LOG),
   *  e.g. Surgery's Status / Procedure / Call Attempts. Returns null to skip. */
  renderFunctional?: (card: PropertyCard) => React.ReactNode | null
}

function display(f: RecordFieldDef, v: any, userMap: Record<string, string>): ReactNode {
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) return "—"
  if (f.type === "user") return userMap[v] ?? String(v)
  if (f.type === "datetime") return new Date(v).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })
  // Date-only is stored at UTC midnight (a pure calendar day) — render its UTC
  // parts so the shown day matches the picker regardless of the viewer's timezone.
  if (f.type === "date") return new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
  if (f.type === "number") return formatNumber(v, f.numberFormat as any)
  if (f.type === "select") return <OptionValue value={v} optionLabels={f.optionLabels} optionColors={f.optionColors} optionStyle={f.optionStyle} />
  const lbl = f.optionLabels
  if (Array.isArray(v)) return v.map((x) => lbl?.[String(x)] ?? String(x)).join(", ")
  return String(v)
}

// MULTI_SELECT editor: a compact trigger (like the single-select StyledSelect)
// that opens a body-portaled panel — search header + checkbox list + footer — so
// it never stretches the card. Commits the array on "Done" or click-away; Escape cancels.
export function MultiSelectField({ options, optionLabels, value, onCommit, onCancel, autoOpen = true }: {
  options: string[]
  optionLabels?: Record<string, string>
  value: any
  onCommit: (v: string[]) => void
  onCancel: () => void
  // Inline click-to-edit opens immediately (default). A persistent form field
  // passes false so it renders a closed trigger that opens on click.
  autoOpen?: boolean
}) {
  const toArray = (v: any) => Array.isArray(v) ? v.map(String) : (v != null && v !== "" ? [String(v)] : [])
  const [sel, setSel] = useState<string[]>(() => toArray(value))
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(autoOpen)
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number }>({ left: 0, width: 0, maxHeight: 288 })
  const selRef = useRef(sel); selRef.current = sel
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  function place() {
    const r = triggerRef.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom
    const above = r.top
    const openUp = below < 260 && above > below
    setPos(openUp
      ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4, maxHeight: Math.min(320, above - 12) }
      : { left: r.left, width: r.width, top: r.bottom + 4, maxHeight: Math.min(320, below - 12) })
  }

  // Open on mount (one-click inline editing), then keep positioned on scroll/resize.
  useEffect(() => { place() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return
    setQ("")
    requestAnimationFrame(() => searchRef.current?.focus())
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return
      onCommit(selRef.current) // click-away commits (matches the old behaviour)
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") { setSel(toArray(value)); onCancel(); setOpen(false) } }
    function onMove() { place() }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    window.addEventListener("resize", onMove)
    window.addEventListener("scroll", onMove, true)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("resize", onMove)
      window.removeEventListener("scroll", onMove, true)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Inside a Radix modal Dialog the portaled panel would lose focus (search box
  // untypable) and its list wouldn't scroll. A capture-phase guard defeats the
  // Dialog's focus trap; the menu-level wheel/touchmove stop keeps it scrollable.
  useMenuFocusGuard(open, menuRef)
  useEffect(() => {
    if (!open) return
    const el = menuRef.current
    if (!el) return
    const stop = (e: Event) => e.stopPropagation()
    el.addEventListener("wheel", stop, { passive: false })
    el.addEventListener("touchmove", stop, { passive: false })
    return () => {
      el.removeEventListener("wheel", stop)
      el.removeEventListener("touchmove", stop)
    }
  }, [open])

  const toggle = (o: string) => setSel((prev) => (prev.includes(o) ? prev.filter((x) => x !== o) : [...prev, o]))
  const query = q.trim().toLowerCase()
  const shown = query ? options.filter((o) => `${optionLabels?.[o] ?? o} ${o}`.toLowerCase().includes(query)) : options
  const showSearch = options.length > 8
  const triggerLabel = sel.length ? sel.map((o) => optionLabels?.[o] ?? o).join(", ") : "Select…"

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { if (!open) place(); setOpen((o) => !o) }}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-slate-200 rounded-md bg-white text-sm text-left hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span className={cn("flex-1 truncate", sel.length ? "text-slate-800" : "text-slate-400")}>{triggerLabel}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          data-select-menu-open=""
          onPointerDown={(e) => e.stopPropagation()}
          className="fixed z-[999] bg-white border border-slate-200 rounded-md shadow-lg flex flex-col"
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxHeight, pointerEvents: "auto" }}
        >
          {showSearch && (
            <div className="shrink-0 bg-white px-2 pt-2 pb-1.5 border-b border-slate-100 rounded-t-md">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
                  className="w-full h-8 pl-7 pr-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-zinc-400" />
              </div>
            </div>
          )}
          <div className="overflow-y-auto py-1 min-h-0">
            {shown.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-400">{options.length === 0 ? "No options" : "No matches"}</p>
            ) : shown.map((o) => {
              const isSelected = sel.includes(o)
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => toggle(o)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50 transition-colors",
                    isSelected ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-800"
                  )}
                >
                  <span className="truncate">{optionLabels?.[o] ?? o}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              )
            })}
          </div>
          <div className="shrink-0 flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
            <span className="text-[11px] text-slate-400">{sel.length} selected</span>
            <div className="flex gap-3">
              <button type="button" onClick={() => { setSel(toArray(value)); onCancel(); setOpen(false) }} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
              <button type="button" onClick={() => { onCommit(sel); setOpen(false) }} className="text-xs font-medium text-blue-600 hover:text-blue-700">Done</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

// One property row — label on top, value underneath (matching Referrals). Click
// the value to edit it in place; the owner is a dropdown; audit fields are read-only.
// Exported so the "View all properties" panel edits fields the same way.
export function FieldRow({ f, value, values, recordId, entityType, canEdit, users, userMap }: {
  f: RecordFieldDef; value: any; values: Record<string, any>; recordId: string; entityType: string; canEdit: boolean; users: UserOpt[]; userMap: Record<string, string>
}) {
  // Dependent options: a controlling property's value narrows this select's options.
  const effectiveOptions = (() => {
    const c = f.conditional
    if (!c) return f.options ?? []
    const cv = String(values[`cp_${c.controllingPropertyId}`] ?? "")
    const allowed = c.rules[cv]
    return allowed ? (f.options ?? []).filter((o) => allowed.includes(o)) : (f.options ?? [])
  })()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<any>(value ?? "")
  // For select_or_other: the picked option, and the free text when "other".
  const [sel, setSel] = useState("")
  const [otherText, setOtherText] = useState("")
  // Guards a single commit per edit (Enter + blur can both fire).
  const doneRef = useRef(false)

  const Label = <span className="block text-xs font-medium text-slate-500 uppercase tracking-wide">{f.label}</span>

  function beginEdit() {
    // Empty custom fields start from their default value (HubSpot-style).
    const start = (value === null || value === undefined || value === "") && f.default ? f.default : (value ?? "")
    setDraft(start)
    if (f.type === "select_or_other") {
      const v = String(start ?? "")
      if (v && !(f.options ?? []).includes(v)) { setSel(f.otherOption ?? "Other"); setOtherText(v) }
      else { setSel(v); setOtherText("") }
    }
    doneRef.current = false
    setEditing(true)
  }
  function cancelEdit() { doneRef.current = true; setEditing(false) }

  // Record Owner: an always-on dropdown (built-in + custom objects go through setRecordOwner).
  if (f.type === "user") {
    if (!canEdit) return <div className="py-2 space-y-1">{Label}<span className="block text-sm text-slate-900 font-medium">{display(f, value, userMap)}</span></div>
    return (
      <div className="py-2 space-y-1">
        {Label}
        <StyledSelect
          value={String(value ?? "")}
          disabled={isPending}
          onChange={(e) => startTransition(async () => { await setRecordOwner(entityType, recordId, e.target.value || null); router.refresh(); showToast(`"${f.label}" saved`) })}
          className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-zinc-400">
          <option value="">— Unassigned —</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
        </StyledSelect>
      </div>
    )
  }

  if (!canEdit || f.readOnly) {
    return <div className="py-2 space-y-1">{Label}<span className="block text-sm text-slate-900 font-medium break-words">{display(f, value, userMap)}</span></div>
  }

  // Auto-save: no Save button — commit on select / Enter / blur. A "saved" toast
  // (with Undo) confirms it, matching HubSpot's inline editing.
  function commit(raw: any) {
    if (doneRef.current) return
    let val: any = raw
    if ((f.type === "date" || f.type === "datetime") && raw) val = new Date(String(raw)).toISOString()
    const prev = value ?? ""
    if (String(val ?? "") === String(prev ?? "")) { cancelEdit(); return }
    doneRef.current = true
    startTransition(async () => {
      const res = await updateRecordField(entityType as any, recordId, f.key, val)
      if ((res as any)?.error) { doneRef.current = false; return }
      setEditing(false); router.refresh()
      showToast(`"${f.label}" saved`, () => startTransition(async () => {
        await updateRecordField(entityType as any, recordId, f.key, prev); router.refresh()
      }))
    })
  }
  const commitOther = () => commit(sel === (f.otherOption ?? "Other") ? otherText : sel)

  if (!editing) {
    return (
      <button onClick={beginEdit}
        className="w-full py-2 space-y-1 text-left rounded-md hover:bg-slate-50 -mx-1 px-1 transition-colors group">
        {Label}
        <span className={cn("block text-sm break-words font-medium", value ? "text-slate-900" : "text-slate-400 group-hover:text-slate-600")}>
          {display(f, value, userMap)}
        </span>
      </button>
    )
  }

  const input = "w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-zinc-400"
  const otherLabel = f.otherOption ?? "Other"
  // Enter commits; Escape cancels (for single-line inputs).
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); commit(draft) }
    else if (e.key === "Escape") { e.preventDefault(); cancelEdit() }
  }
  return (
    <div className="py-2 space-y-1.5">
      {Label}
      {f.type === "select" && f.multi ? (
        <MultiSelectField options={effectiveOptions} optionLabels={f.optionLabels} value={value} onCommit={commit} onCancel={cancelEdit} />
      ) : f.type === "select" ? (
        <StyledSelect autoOpen searchable value={String(draft ?? "")} onChange={(e) => commit(e.target.value)} className={input}>
          <option value="">—</option>
          {effectiveOptions.map((o) => <option key={o} value={o}>{f.optionLabels?.[o] ?? o}</option>)}
        </StyledSelect>
      ) : f.type === "select_or_other" ? (
        <>
          <StyledSelect autoOpen={sel === ""} searchable value={sel}
            onChange={(e) => { const v = e.target.value; setSel(v); if (v !== otherLabel) commit(v) }} className={input}>
            <option value="">—</option>
            {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
            {!(f.options ?? []).includes(otherLabel) && <option value={otherLabel}>{otherLabel}…</option>}
          </StyledSelect>
          {sel === otherLabel && (
            <input value={otherText} onChange={(e) => setOtherText(e.target.value)} onBlur={commitOther}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitOther() } else if (e.key === "Escape") cancelEdit() }}
              placeholder={`${otherLabel} details…`} className={input} autoFocus />
          )}
        </>
      ) : f.type === "long_text" ? (
        <NotesTextarea rows={3} commit="input" value={String(draft ?? "")} onChange={setDraft} onBlur={(e) => commit(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === "Escape") cancelEdit() }} className={input + " min-h-0 resize-none"} autoFocus />
      ) : f.type === "phone" ? (
        <PhoneInput value={String(draft ?? "")} onChange={setDraft} onCommit={(v) => commit(v)} />
      ) : f.type === "date" || f.type === "datetime" ? (
        <DatePicker value={draft} withTime={f.type === "datetime"} onCommit={commit} onCancel={cancelEdit} />
      ) : (
        <input
          type={f.type === "number" ? "number" : "text"}
          value={String(draft ?? "")}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={onKey}
          className={input}
          autoFocus
        />
      )}
      {isPending && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
    </div>
  )
}

export default function RecordPropertyCards({ entityType, recordId, cards, catalog, values, canEdit, canEditCards, section = "LEFT", users = [], renderFunctional }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  // null = closed; PropertyCard = editing that card; "new" = creating one.
  const [editing, setEditing] = useState<PropertyCard | "new" | null>(null)

  const byKey = Object.fromEntries(catalog.map((f) => [f.key, f]))
  const userMap = Object.fromEntries(users.map((u) => [u.id, u.label]))
  // The same "Edit Card" modal Referrals uses, fed this object's own properties.
  const pool = catalog.map((f) => ({ id: f.key, label: f.label }))

  // Every card mutation persists the WHOLE column (materializing defaults), so
  // adding/deleting/reordering one card never drops the others.
  function persist(next: PropertyCard[]) {
    startTransition(async () => {
      await replaceColumnCards(entityType, section, next.map((c) => ({
        cardName: c.cardName, title: c.title, fields: c.fields, columns: c.columns ?? 1,
        kind: c.kind ?? "PROPERTIES", config: c.config ?? null,
      })))
      router.refresh()
    })
  }

  const byName = Object.fromEntries(cards.map((c) => [c.cardName, c]))
  const dnd = useCardReorder(cards, (c) => c.cardName, (keys) => persist(keys.map((k) => byName[k]).filter(Boolean)))

  function submitCard(data: { title: string; fields: string[]; columns: number; kind?: string; config?: any }) {
    const extra = { columns: data.columns, kind: data.kind ?? "PROPERTIES", config: data.config ?? null }
    if (editing === "new") {
      persist([...cards, { cardName: `card-${Date.now()}`, title: data.title, fields: data.fields, ...extra }])
    } else if (editing) {
      persist(cards.map((c) => (c.cardName === editing.cardName ? { ...c, title: data.title, fields: data.fields, ...extra } : c)))
    }
    setEditing(null)
  }

  function deleteCard() {
    if (editing && editing !== "new") persist(cards.filter((c) => c.cardName !== editing.cardName))
    setEditing(null)
  }

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

      {dnd.order.map((card) => {
        const isFunctional = !!card.kind && card.kind !== "PROPERTIES" && card.kind !== "CALL_LOG" && card.kind !== "ATTACHMENTS"
        return (
        <div key={card.cardName} {...dnd.cardProps(card.cardName)}
          className={cn("bg-white border border-slate-200 rounded-xl transition-shadow", dnd.dragging === card.cardName && "opacity-50 ring-2 ring-zinc-300")}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <div className="flex items-center gap-1.5 min-w-0">
              {canEditCards && (
                <span {...dnd.handleProps(card.cardName)} title="Drag to reorder" className="text-slate-300 hover:text-slate-500 shrink-0">
                  <GripVertical className="h-4 w-4" />
                </span>
              )}
              <h2 className="text-sm font-semibold text-slate-900 truncate">{card.title}</h2>
            </div>
            {canEditCards && !isFunctional && (
              <button onClick={() => setEditing(card)} title="Edit card" className="text-slate-300 hover:text-slate-600 shrink-0">
                <Settings className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {isFunctional ? (
            <div className="p-5">{renderFunctional?.(card)}</div>
          ) : card.kind === "CALL_LOG" ? (
            <CallLogCard recordType={entityType} recordId={recordId} maxCalls={card.config?.maxCalls ?? 3} canEdit={canEdit} />
          ) : card.kind === "ATTACHMENTS" ? (
            <AttachmentsCard recordType={entityType} recordId={recordId} canEdit={canEdit} />
          ) : (
            <div className={cn("p-5 text-sm", (card.columns ?? 1) > 1 && "grid gap-x-5",
              (card.columns ?? 1) === 2 && "sm:grid-cols-2", (card.columns ?? 1) >= 3 && "sm:grid-cols-3")}>
              {card.fields.length === 0 ? (
                <p className="text-sm text-slate-400">No properties on this card yet.</p>
              ) : (
                card.fields
                  .map((key) => byKey[key])
                  .filter(Boolean)
                  .filter((f) => isPropertyVisible(f.visibilityRule, values))
                  .map((f) => (
                    <div key={f.key} className={(card.columns ?? 1) > 1 ? "" : "border-b border-slate-50 last:border-0"}>
                      <FieldRow f={f} value={values[f.key]} values={values} recordId={recordId} entityType={entityType} canEdit={canEdit} users={users} userMap={userMap} />
                    </div>
                  ))
              )}
            </div>
          )}
        </div>
        )
      })}

      {editing && (
        <LeftCardEditorModal
          open
          onOpenChange={(o) => { if (!o) setEditing(null) }}
          entityType={entityType}
          existing={editing === "new" ? null : editing}
          fields={pool}
          section={section}
          columnsEnabled={section === "MIDDLE"}
          cardTypesEnabled
          onSubmit={submitCard}
          onDelete={deleteCard}
        />
      )}
    </div>
  )
}
