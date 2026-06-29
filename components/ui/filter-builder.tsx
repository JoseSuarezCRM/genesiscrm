"use client"

import { useState, useRef, useEffect } from "react"
import { Filter, X, Plus, ChevronDown, Check, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import StyledSelect from "@/components/ui/styled-select"
import {
  FilterField, FilterState, FilterGroup, Condition, Combinator,
  OPERATORS, activeConditionCount, emptyCondition, emptyGroup, emptyFilter, defaultOperator,
} from "@/lib/filters"

interface Props {
  fields: FilterField[]
  value: FilterState
  onChange: (next: FilterState) => void
}

// ─── Searchable multi-select (for `is any of` / `is none of`) ────────────────
function MultiSelect({ options, value, onChange }: {
  options: { label: string; value: string }[]
  value: string[]
  onChange: (v: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options
  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  }
  return (
    <div className="relative flex-1 min-w-0" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full h-9 px-3 inline-flex items-center justify-between gap-1 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:border-slate-300">
        <span className="truncate">{value.length === 0 ? "Select…" : value.length === 1 ? (options.find((o) => o.value === value[0])?.label ?? value[0]) : `${value.length} selected`}</span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute left-0 top-10 z-50 w-72 max-h-72 overflow-hidden bg-white border border-slate-200 rounded-xl shadow-xl flex flex-col">
          <div className="relative border-b border-slate-100 p-1.5">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
              className="w-full pl-7 pr-2 py-1.5 text-sm rounded-md focus:outline-none" />
          </div>
          <div className="overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-400">No matches</p>
            ) : filtered.map((o) => {
              const on = value.includes(o.value)
              return (
                <button key={o.value} type="button" onClick={() => toggle(o.value)}
                  className="w-full text-left px-2.5 py-1.5 flex items-center gap-2 hover:bg-slate-50">
                  <span className={cn("h-4 w-4 rounded border flex items-center justify-center shrink-0", on ? "bg-zinc-900 border-zinc-900" : "border-slate-300")}>
                    {on && <Check className="h-3 w-3 text-white" />}
                  </span>
                  <span className="text-sm text-slate-700 truncate">{o.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Combinator toggle (And / Or) ────────────────────────────────────────────
function CombinatorToggle({ value, onChange }: { value: Combinator; onChange: (c: Combinator) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-[11px] font-medium">
      {(["AND", "OR"] as Combinator[]).map((c) => (
        <button key={c} type="button" onClick={() => onChange(c)}
          className={cn("px-2 py-1 transition-colors", value === c ? "bg-zinc-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50")}>
          {c === "AND" ? "And" : "Or"}
        </button>
      ))}
    </div>
  )
}

export default function FilterBuilder({ fields, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  const count = activeConditionCount(value, fields)

  function setGroups(groups: FilterGroup[]) { onChange({ ...value, groups }) }
  function patchGroup(gid: string, patch: Partial<FilterGroup>) {
    setGroups(value.groups.map((g) => (g.id === gid ? { ...g, ...patch } : g)))
  }
  function patchCondition(gid: string, cid: string, patch: Partial<Condition>) {
    patchGroup(gid, {
      conditions: value.groups.find((g) => g.id === gid)!.conditions.map((c) => (c.id === cid ? { ...c, ...patch } : c)),
    })
  }
  function addCondition(gid: string) {
    const g = value.groups.find((x) => x.id === gid)!
    patchGroup(gid, { conditions: [...g.conditions, emptyCondition()] })
  }
  function removeCondition(gid: string, cid: string) {
    const g = value.groups.find((x) => x.id === gid)!
    const next = g.conditions.filter((c) => c.id !== cid)
    if (next.length === 0) {
      // drop the whole group, but never go below one group
      const groups = value.groups.filter((x) => x.id !== gid)
      setGroups(groups.length ? groups : [emptyGroup()])
    } else {
      patchGroup(gid, { conditions: next })
    }
  }
  function onFieldChange(gid: string, cid: string, key: string) {
    const field = fields.find((f) => f.key === key)
    patchCondition(gid, cid, { field: key, operator: field ? defaultOperator(field) : "", value: "" })
  }

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-xs font-medium transition-colors",
          count > 0 ? "border-zinc-900 bg-zinc-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
        )}>
        <Filter className="h-3.5 w-3.5" /> Filter
        {count > 0 && <span className="ml-0.5 h-4 min-w-4 px-1 rounded-full bg-white/20 text-[10px] inline-flex items-center justify-center">{count}</span>}
      </button>

      {open && (
        <div className="absolute left-0 top-11 z-50 w-[740px] max-w-[94vw] bg-white border border-slate-200 rounded-xl shadow-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-slate-800">Filters</p>
            {count > 0 && (
              <button onClick={() => onChange(emptyFilter())} className="text-xs text-slate-500 hover:text-slate-700">Clear all</button>
            )}
          </div>

          <div className="space-y-2">
            {value.groups.map((group, gi) => (
              <div key={group.id}>
                {gi > 0 && (
                  <div className="flex items-center gap-2 my-2 pl-1">
                    <CombinatorToggle value={value.combinator} onChange={(c) => onChange({ ...value, combinator: c })} />
                    <span className="text-[11px] text-slate-400">between groups</span>
                  </div>
                )}
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                  {group.conditions.map((cond, ci) => {
                    const field = fields.find((f) => f.key === cond.field)
                    const ops = field ? OPERATORS[field.type] : []
                    const op = ops.find((o) => o.value === cond.operator)
                    return (
                      <div key={cond.id}>
                        {ci > 0 && (
                          <div className="py-1 pl-1">
                            <CombinatorToggle value={group.combinator} onChange={(c) => patchGroup(group.id, { combinator: c })} />
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <StyledSelect value={cond.field} onChange={(e) => onFieldChange(group.id, cond.id, e.target.value)} className="w-48 h-9 shrink-0">
                            <option value="">Select field…</option>
                            {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                          </StyledSelect>
                          {field && (
                            <StyledSelect value={cond.operator} onChange={(e) => patchCondition(group.id, cond.id, { operator: e.target.value, value: "" })} className="w-44 h-9 shrink-0">
                              {ops.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </StyledSelect>
                          )}
                          {field && op && !op.noValue && (
                            op.multi && field.type === "select" ? (
                              <MultiSelect
                                options={field.options ?? []}
                                value={Array.isArray(cond.value) ? cond.value : cond.value ? [cond.value] : []}
                                onChange={(v) => patchCondition(group.id, cond.id, { value: v })}
                              />
                            ) : field.type === "number" ? (
                              <input type="number" value={cond.value as string} onChange={(e) => patchCondition(group.id, cond.id, { value: e.target.value })}
                                placeholder="Value" className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            ) : field.type === "date" ? (
                              <input type="date" value={cond.value as string} onChange={(e) => patchCondition(group.id, cond.id, { value: e.target.value })}
                                className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            ) : (
                              <input type="text" value={cond.value as string} onChange={(e) => patchCondition(group.id, cond.id, { value: e.target.value })}
                                placeholder="Value" className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            )
                          )}
                          <button type="button" onClick={() => removeCondition(group.id, cond.id)}
                            className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  <button type="button" onClick={() => addCondition(group.id)}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 px-1 py-0.5">
                    <Plus className="h-3.5 w-3.5" /> Add condition
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button type="button" onClick={() => setGroups([...value.groups, emptyGroup()])}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 px-2 py-1.5 rounded-lg border border-dashed border-slate-300 hover:border-slate-400">
            <Plus className="h-3.5 w-3.5" /> Add filter group
          </button>
        </div>
      )}
    </div>
  )
}
