"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown, Plus, Pencil, Check, Search, X, SlidersHorizontal } from "lucide-react"
import { DATE_PRESET_GROUPS } from "@/lib/reporting/date-presets"
import { OPERATORS, uid, type Condition, type FilterField, type FilterState } from "@/lib/filters"
import { cn } from "@/lib/utils"

// The row of property dropdowns under the toolbar ("Deal owner ⌄ · Create date ⌄ …").
//
// A chip is NOT a second filter model: it reads and writes a condition in the first
// group of the same FilterState the advanced FilterBuilder edits, so a value picked
// here shows up there and vice-versa.

/** The operator a chip uses for a field type — the plainest one that takes a value. */
function quickOperator(type: FilterField["type"]): string {
  switch (type) {
    case "select": return "is_any_of"
    case "date": return "relative"
    case "number": return "eq"
    case "boolean": return "is_true"
    default: return "contains"
  }
}

function conditionFor(state: FilterState, key: string): Condition | undefined {
  return state.groups[0]?.conditions.find((c) => c.field === key)
}

/** Write (or clear) this field's condition in the first group. */
function withCondition(state: FilterState, key: string, operator: string, value: string | string[] | null): FilterState {
  const groups = [...state.groups]
  const g0 = groups[0] ?? { id: uid("g"), combinator: state.combinator, conditions: [] }
  const existing = g0.conditions.find((c) => c.field === key)
  let conditions: Condition[]
  if (value === null || (Array.isArray(value) && value.length === 0) || value === "") {
    conditions = g0.conditions.filter((c) => c.field !== key)
    // A group must never be left empty — the builder renders one blank row.
    if (conditions.length === 0) conditions = [{ id: uid("c"), field: "", operator: "", value: "" }]
  } else if (existing) {
    conditions = g0.conditions.map((c) => (c.field === key ? { ...c, operator, value } : c))
  } else {
    // Drop the placeholder blank row when adding the first real condition.
    const kept = g0.conditions.filter((c) => c.field)
    conditions = [...kept, { id: uid("c"), field: key, operator, value }]
  }
  groups[0] = { ...g0, conditions }
  return { ...state, groups }
}

function summarize(field: FilterField, cond: Condition | undefined): string | null {
  if (!cond || !cond.operator) return null
  const v = cond.value
  if (Array.isArray(v)) {
    if (v.length === 0) return null
    if (v.length === 1) return field.options?.find((o) => o.value === v[0])?.label ?? String(v[0])
    return `${v.length} selected`
  }
  if (v === "" || v == null) return null
  if (field.type === "date") return DATE_PRESET_GROUPS.find((p) => p.value === v)?.label ?? String(v)
  if (field.type === "select") return field.options?.find((o) => o.value === v)?.label ?? String(v)
  return String(v)
}

function Popover({ children, onClose, align = "left" }: { children: React.ReactNode; onClose: () => void; align?: "left" | "right" }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [onClose])
  return (
    <div ref={ref} className={cn("absolute top-9 z-50 flex max-h-80 w-64 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl", align === "right" ? "right-0" : "left-0")}>
      {children}
    </div>
  )
}

function Chip({ field, state, onChange, onRemove }: {
  field: FilterField
  state: FilterState
  onChange: (next: FilterState) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const cond = conditionFor(state, field.key)
  const summary = summarize(field, cond)
  const op = cond?.operator || quickOperator(field.type)

  function set(value: string | string[] | null) {
    onChange(withCondition(state, field.key, op, value))
  }

  const listOptions = field.type === "date"
    ? DATE_PRESET_GROUPS.map((p) => ({ value: p.value, label: p.label }))
    : (field.options ?? [])
  const isMulti = !!OPERATORS[field.type].find((o) => o.value === op)?.multi
  const selected: string[] = Array.isArray(cond?.value) ? (cond!.value as string[]) : cond?.value ? [String(cond.value)] : []
  const filtered = q ? listOptions.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : listOptions

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)}
        className={cn(
          "group inline-flex h-8 max-w-[15rem] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium",
          summary ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
        )}>
        <span className="truncate">{field.label}{summary ? `: ${summary}` : ""}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
      </button>

      {open && (
        <Popover onClose={() => setOpen(false)}>
          <div className="flex items-center justify-between border-b border-slate-100 px-2.5 py-1.5">
            <span className="text-xs font-semibold text-slate-700">{field.label}</span>
            <button onClick={() => { onRemove(); setOpen(false) }} title="Remove this quick filter" className="text-slate-300 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
          </div>

          {field.type === "boolean" ? (
            <div className="p-1">
              {[{ v: "is_true", l: "Yes" }, { v: "is_false", l: "No" }].map(({ v, l }) => (
                <button key={v} onClick={() => { onChange(withCondition(state, field.key, v, "true")); setOpen(false) }}
                  className={cn("flex w-full items-center justify-between px-2.5 py-1.5 text-left text-sm hover:bg-slate-50", cond?.operator === v && "font-medium")}>
                  {l} {cond?.operator === v && <Check className="h-3.5 w-3.5 text-blue-600" />}
                </button>
              ))}
            </div>
          ) : listOptions.length > 0 ? (
            <>
              {listOptions.length > 8 && (
                <div className="relative border-b border-slate-100 p-2">
                  <Search className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
                    className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-slate-400" />
                </div>
              )}
              <div className="overflow-y-auto py-1">
                {filtered.map((o) => {
                  const on = selected.includes(o.value)
                  return (
                    <button key={o.value}
                      onClick={() => {
                        if (isMulti) set(on ? selected.filter((s) => s !== o.value) : [...selected, o.value])
                        else { set(o.value); setOpen(false) }
                      }}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-slate-50">
                      {isMulti && (
                        <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-blue-600 bg-blue-600" : "border-slate-300")}>
                          {on && <Check className="h-3 w-3 text-white" />}
                        </span>
                      )}
                      <span className="truncate text-sm text-slate-700">{o.label}</span>
                      {!isMulti && on && <Check className="ml-auto h-3.5 w-3.5 text-blue-600" />}
                    </button>
                  )
                })}
                {filtered.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">No matches</p>}
              </div>
            </>
          ) : (
            <div className="p-2">
              <input autoFocus defaultValue={typeof cond?.value === "string" ? cond.value : ""}
                onKeyDown={(e) => { if (e.key === "Enter") { set((e.target as HTMLInputElement).value); setOpen(false) } }}
                onBlur={(e) => set(e.target.value)}
                placeholder={field.type === "number" ? "Value…" : "Contains…"}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-slate-400" />
            </div>
          )}

          {summary && (
            <button onClick={() => { set(null); setOpen(false) }}
              className="border-t border-slate-100 px-2.5 py-2 text-left text-xs text-slate-500 hover:text-slate-800">Clear</button>
          )}
        </Popover>
      )}
    </div>
  )
}

export default function QuickFilterBar({ fields, keys, value, onChange, onKeysChange, onOpenAdvanced }: {
  fields: FilterField[]
  keys: string[]
  value: FilterState
  onChange: (next: FilterState) => void
  onKeysChange: (next: string[]) => void
  onOpenAdvanced: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)
  const [q, setQ] = useState("")

  const chips = keys.map((k) => fields.find((f) => f.key === k)).filter((f): f is FilterField => !!f)
  const addable = fields.filter((f) => !keys.includes(f.key) && (!q || f.label.toLowerCase().includes(q.toLowerCase())))

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((f) => (
        <Chip key={f.key} field={f} state={value} onChange={onChange}
          onRemove={() => { onChange(withCondition(value, f.key, quickOperator(f.type), null)); onKeysChange(keys.filter((k) => k !== f.key)) }} />
      ))}

      <div className="relative">
        <button onClick={() => { setAdding((o) => !o); setQ("") }} title="Add a quick filter"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-400 hover:border-slate-500 hover:text-slate-600">
          <Plus className="h-3.5 w-3.5" />
        </button>
        {adding && (
          <Popover onClose={() => setAdding(false)}>
            <div className="relative border-b border-slate-100 p-2">
              <Search className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search properties…"
                className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-slate-400" />
            </div>
            <div className="overflow-y-auto py-1">
              {addable.map((f) => (
                <button key={f.key} onClick={() => { onKeysChange([...keys, f.key]); setAdding(false) }}
                  className="w-full px-2.5 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50">{f.label}</button>
              ))}
              {addable.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">Nothing left to add</p>}
            </div>
          </Popover>
        )}
      </div>

      <div className="relative">
        <button onClick={() => setEditing((o) => !o)} title="Edit quick filters"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:border-slate-400 hover:text-slate-600">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        {editing && (
          <Popover onClose={() => setEditing(false)}>
            <p className="border-b border-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700">Quick filters</p>
            <div className="overflow-y-auto py-1">
              {chips.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">None yet — use ＋ to add one.</p>}
              {chips.map((f) => (
                <div key={f.key} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-sm text-slate-700">
                  <span className="truncate">{f.label}</span>
                  <button onClick={() => { onChange(withCondition(value, f.key, quickOperator(f.type), null)); onKeysChange(keys.filter((k) => k !== f.key)) }}
                    className="text-slate-300 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </Popover>
        )}
      </div>

      <button onClick={onOpenAdvanced}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-500 hover:text-slate-900">
        <SlidersHorizontal className="h-3.5 w-3.5" /> Advanced filters
      </button>
    </div>
  )
}
