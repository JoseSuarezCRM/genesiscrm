"use client"

import StyledSelect from "@/components/ui/styled-select"
import DatePicker from "@/components/ui/date-picker"
import PhoneInput from "@/components/phone-input"
import { MultiSelectField } from "@/components/record-property-cards"
import { type RecordFieldDef } from "@/lib/record-field-catalog"

interface UserOpt { id: string; label: string }

// A pure, controlled input that renders the type-appropriate control for a field
// (the same controls the record detail uses) WITHOUT auto-saving — value/onChange
// only. Used by the configurable create-record modal. Dates commit the same ISO
// storage value the detail/inline editors use (fixes the native <input type=date>
// format mismatch).
export function PropertyInput({ def, value, onChange, users = [], values, autoFocus }: {
  def: RecordFieldDef
  value: any
  onChange: (v: any) => void
  users?: UserOpt[]
  values?: Record<string, any>
  autoFocus?: boolean
}) {
  const input = "h-9 w-full px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"

  // Dependent options: narrow a select's options by the controlling field's value.
  const effectiveOptions = (() => {
    const c = def.conditional
    if (!c) return def.options ?? []
    const cv = String((values?.[`cp_${c.controllingPropertyId}`] ?? values?.[c.controllingPropertyId]) ?? "")
    const allowed = c.rules[cv]
    return allowed ? (def.options ?? []).filter((o) => allowed.includes(o)) : (def.options ?? [])
  })()

  if (def.type === "user") return (
    <StyledSelect className={input} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
      <option value="">— Select —</option>
      {users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
    </StyledSelect>
  )
  if (def.type === "checkbox") return (
    <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
  )
  if (def.type === "select" && def.multi) return (
    <MultiSelectField autoOpen={false} options={effectiveOptions} optionLabels={def.optionLabels} value={value} onCommit={(v) => onChange(v)} onCancel={() => {}} />
  )
  if (def.type === "select") return (
    <StyledSelect searchable className={input} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
      <option value="">— Select —</option>
      {effectiveOptions.map((o) => <option key={o} value={o}>{def.optionLabels?.[o] ?? o}</option>)}
    </StyledSelect>
  )
  if (def.type === "select_or_other") {
    const other = def.otherOption ?? "Other"
    const v = String(value ?? "")
    const isOther = v !== "" && !(def.options ?? []).includes(v)
    return (
      <div className="space-y-1.5">
        <StyledSelect className={input} value={isOther ? other : v} onChange={(e) => onChange(e.target.value === other ? "" : e.target.value)}>
          <option value="">— Select —</option>
          {(def.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          {!(def.options ?? []).includes(other) && <option value={other}>{other}…</option>}
        </StyledSelect>
        {isOther && <input className={input} value={v} onChange={(e) => onChange(e.target.value)} placeholder={`${other} details…`} autoFocus />}
      </div>
    )
  }
  if (def.type === "long_text") return (
    <textarea rows={3} autoFocus={autoFocus} className={input + " resize-none py-2 h-auto"} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
  )
  if (def.type === "phone") return <PhoneInput value={String(value ?? "")} onChange={onChange} />
  if (def.type === "date" || def.type === "datetime") return (
    <DatePicker value={value} withTime={def.type === "datetime"} autoOpen={false} onCommit={(v) => onChange(v)} onCancel={() => {}} />
  )
  return (
    <input
      type={def.type === "number" ? "number" : def.type === "email" ? "email" : "text"}
      autoFocus={autoFocus}
      className={input}
      value={String(value ?? "")}
      onChange={(e) => onChange(def.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
    />
  )
}

export default PropertyInput
