"use client"

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Check } from "lucide-react"
import { showToast } from "@/components/toast"
import { OptionValue } from "@/components/option-value"
import StyledSelect from "@/components/ui/styled-select"
import DatePicker from "@/components/ui/date-picker"
import PhoneInput from "@/components/phone-input"
import { MultiSelectField } from "@/components/record-property-cards"
import { formatNumber } from "@/lib/number-format"
import { type RecordFieldDef } from "@/lib/record-field-catalog"
import { cn } from "@/lib/utils"

interface UserOpt { id: string; label: string }

// The read-mode display for a value, given its field descriptor. Mirrors the
// detail property card's `display()` so a value looks identical in a list cell.
function displayValue(f: RecordFieldDef, v: any, userMap?: Record<string, string>): ReactNode {
  if (f.type === "checkbox") return v === true ? "Yes" : v === false ? "No" : "—"
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) return "—"
  if (f.type === "user") return userMap?.[v] ?? String(v)
  if (f.type === "datetime") return new Date(v).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })
  if (f.type === "date") return new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
  if (f.type === "number") return formatNumber(v, f.numberFormat as any)
  if (f.type === "select") return <OptionValue value={v} optionLabels={f.optionLabels} optionColors={f.optionColors} optionStyle={f.optionStyle} />
  const lbl = f.optionLabels
  if (Array.isArray(v)) return v.map((x) => lbl?.[String(x)] ?? String(x)).join(", ")
  return String(v)
}

/**
 * A single table cell that shows a value and, on click, becomes the
 * type-appropriate editor — the list counterpart of the detail page's FieldRow.
 * Auto-saves (no Save button) with an Undo toast, reusing the shared inputs
 * (all of which portal to <body>, so they are never clipped by the cell).
 */
export function EditableCell({
  def, value, values, canEdit, align, userMap, users, onSave, onSaveOwner, renderRead,
}: {
  def: RecordFieldDef
  value: any
  values?: Record<string, any>
  canEdit: boolean
  align?: "left" | "right"
  userMap?: Record<string, string>
  users?: UserOpt[]
  onSave: (value: any) => Promise<{ error?: string } | { success?: true } | void>
  onSaveOwner?: (userId: string | null) => Promise<any>
  // Custom read-mode node (e.g. a colored enum chip) shown when not editing;
  // edit mode still renders the type-appropriate control from `def`.
  renderRead?: ReactNode
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<any>(value ?? "")
  // select_or_other: the picked option + the free text when "other".
  const [sel, setSel] = useState("")
  const [otherText, setOtherText] = useState("")
  // Optimistic value shown immediately after a commit, cleared once the refreshed
  // `value` prop arrives (see effect below).
  const [optimistic, setOptimistic] = useState<{ v: any } | null>(null)
  const doneRef = useRef(false)

  useEffect(() => { setOptimistic(null) }, [value])

  const shown = optimistic ? optimistic.v : value
  const readOnly = !canEdit || def.readOnly || !def.type

  // Dependent options: a controlling property narrows this select's options.
  const effectiveOptions = (() => {
    const c = def.conditional
    if (!c) return def.options ?? []
    const cv = String((values?.[`cp_${c.controllingPropertyId}`] ?? values?.[c.controllingPropertyId]) ?? "")
    const allowed = c.rules[cv]
    return allowed ? (def.options ?? []).filter((o) => allowed.includes(o)) : (def.options ?? [])
  })()

  const otherLabel = def.otherOption ?? "Other"
  function beginEdit() {
    if (readOnly) return
    const start = (value === null || value === undefined || value === "") && def.default ? def.default : (value ?? "")
    setDraft(start)
    if (def.type === "select_or_other") {
      const v = String(start ?? "")
      if (v && !(def.options ?? []).includes(v)) { setSel(otherLabel); setOtherText(v) }
      else { setSel(v); setOtherText("") }
    }
    doneRef.current = false
    setEditing(true)
  }
  const commitOther = () => commit(sel === otherLabel ? otherText : sel)
  function cancelEdit() { doneRef.current = true; setEditing(false) }

  function runSave(val: any, prev: any, save: (v: any) => Promise<any>) {
    doneRef.current = true
    setEditing(false)
    setOptimistic({ v: val })
    startTransition(async () => {
      const res = await save(val)
      if (res && (res as any).error) { setOptimistic(null); doneRef.current = false; showToast((res as any).error); return }
      router.refresh()
      showToast(`"${def.label}" saved`, () => startTransition(async () => { await save(prev); router.refresh() }))
    })
  }

  function commit(raw: any) {
    if (doneRef.current) return
    let val: any = raw
    if ((def.type === "date" || def.type === "datetime") && raw) val = new Date(String(raw)).toISOString()
    else if (def.type === "number" || def.coerce === "number") val = raw === "" || raw === null || raw === undefined ? null : Number(raw)
    else if (def.type === "checkbox") val = !!raw
    const prev = value ?? ""
    if (def.type !== "checkbox" && String(val ?? "") === String(prev ?? "")) { cancelEdit(); return }
    runSave(val, value ?? "", onSave)
  }

  function commitOwner(uid: string) {
    const val = uid || null
    if (String(val ?? "") === String(value ?? "")) { cancelEdit(); return }
    runSave(val, value ?? null, (v) => (onSaveOwner ? onSaveOwner(v) : onSave(v)))
  }

  const cellPad = "px-3 py-2.5"
  const alignCls = align === "right" ? "text-right justify-end" : "text-left"

  // ── Read mode ────────────────────────────────────────────────────────────
  if (!editing) {
    const empty = shown === null || shown === undefined || shown === "" || (Array.isArray(shown) && shown.length === 0)
    return (
      <button
        type="button"
        onClick={beginEdit}
        disabled={readOnly}
        className={cn(
          "group/cell block w-full min-w-0 truncate transition-colors", cellPad, alignCls,
          readOnly ? "cursor-default" : "cursor-pointer hover:bg-slate-50 hover:ring-1 hover:ring-inset hover:ring-slate-200",
          empty && !readOnly ? "text-slate-300" : "text-slate-600",
        )}
      >
        {renderRead && !optimistic
          ? renderRead
          : def.type === "checkbox"
          ? <span className="inline-flex items-center gap-1.5">{shown === true && <Check className="h-3.5 w-3.5 text-emerald-600" />}{displayValue(def, shown, userMap)}</span>
          : displayValue(def, shown, userMap)}
      </button>
    )
  }

  // ── Edit mode ────────────────────────────────────────────────────────────
  const input = "w-full text-sm border border-blue-400 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); commit(draft) }
    else if (e.key === "Escape") { e.preventDefault(); cancelEdit() }
  }

  return (
    <div className="relative px-2 py-1.5">
      {def.type === "user" ? (
        <StyledSelect autoOpen searchable value={String(value ?? "")} onChange={(e) => commitOwner(e.target.value)} className={input}>
          <option value="">— Unassigned —</option>
          {(users ?? []).map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
        </StyledSelect>
      ) : def.type === "checkbox" ? (
        <StyledSelect autoOpen value={value === true ? "true" : value === false ? "false" : ""} onChange={(e) => commit(e.target.value === "" ? null : e.target.value === "true")} className={input}>
          <option value="">—</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </StyledSelect>
      ) : def.type === "select" && def.multi ? (
        <MultiSelectField options={effectiveOptions} optionLabels={def.optionLabels} value={value} onCommit={commit} onCancel={cancelEdit} />
      ) : def.type === "select" ? (
        <StyledSelect autoOpen searchable value={String(draft ?? "")} onChange={(e) => commit(e.target.value)} className={input}>
          <option value="">—</option>
          {effectiveOptions.map((o) => <option key={o} value={o}>{def.optionLabels?.[o] ?? o}</option>)}
        </StyledSelect>
      ) : def.type === "select_or_other" ? (
        <>
          <StyledSelect autoOpen={sel === ""} searchable value={sel}
            onChange={(e) => { const v = e.target.value; setSel(v); if (v !== otherLabel) commit(v) }} className={input}>
            <option value="">—</option>
            {(def.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
            {!(def.options ?? []).includes(otherLabel) && <option value={otherLabel}>{otherLabel}…</option>}
          </StyledSelect>
          {sel === otherLabel && (
            <input value={otherText} onChange={(e) => setOtherText(e.target.value)} onBlur={commitOther}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitOther() } else if (e.key === "Escape") cancelEdit() }}
              placeholder={`${otherLabel} details…`} className={input + " mt-1"} autoFocus />
          )}
        </>
      ) : def.type === "long_text" ? (
        <textarea rows={3} value={String(draft ?? "")} onChange={(e) => setDraft(e.target.value)} onBlur={() => commit(draft)}
          onKeyDown={(e) => { if (e.key === "Escape") cancelEdit() }} className={input + " resize-none"} autoFocus />
      ) : def.type === "phone" ? (
        <PhoneInput value={String(draft ?? "")} onChange={setDraft} onCommit={(v) => commit(v)} />
      ) : def.type === "date" || def.type === "datetime" ? (
        <DatePicker value={draft} withTime={def.type === "datetime"} onCommit={commit} onCancel={cancelEdit} />
      ) : (
        <input
          type={def.type === "number" ? "number" : def.type === "email" ? "email" : "text"}
          value={String(draft ?? "")}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={onKey}
          className={input}
          autoFocus
        />
      )}
      {isPending && <Loader2 className="absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-slate-400" />}
    </div>
  )
}

export default EditableCell
