"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { Search, ChevronDown, X, Check, Calendar } from "lucide-react"
import FilterBuilder from "@/components/ui/filter-builder"
import { type FilterState, emptyFilter, activeConditionCount } from "@/lib/filters"
import { decodeFilterParam } from "@/lib/filters"
import { surgeryFilterFields } from "@/lib/surgery-filter-fields"
import type { CustomPropDef } from "@/lib/filters"

const STATUS_OPTIONS = [
  { id: "NEW",                  label: "New" },
  { id: "PENDING_CLEARANCE",    label: "Pending Clearance" },
  { id: "PENDING_CONFIRMATION", label: "Pending Confirmation" },
  { id: "SCHEDULED",            label: "Scheduled" },
  { id: "CANCELED",             label: "Canceled" },
  { id: "COMPLETED",            label: "Completed" },
]

interface SurgeryFiltersProps {
  currentSearch?: string
  currentStatuses: string[]
  currentStatusMode: "any" | "none"
  currentFrom?: string
  currentTo?: string
  users?: { id: string; label: string }[]
  customPropertyDefs?: CustomPropDef[]
}

// ─── Multi-select dropdown ────────────────────────────────────────────────────

function MultiSelectDropdown({
  label,
  options,
  selected,
  onToggle,
  onClear,
  mode,
  onModeChange,
}: {
  label: string
  options: { id: string; label: string }[]
  selected: string[]
  onToggle: (id: string) => void
  onClear: () => void
  mode?: "any" | "none"
  onModeChange?: (mode: "any" | "none") => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const active = selected.length > 0
  const isExclude = mode === "none"

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm font-medium transition-all select-none ${
          active && isExclude
            ? "bg-rose-600 text-white border-rose-600 hover:bg-rose-700"
            : active
            ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
            : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300 hover:text-zinc-900"
        }`}
      >
        <span>{label}</span>
        {active && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-white/20 text-xs font-bold tabular-nums">
            {isExclude ? "≠" : ""}{selected.length}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full mt-2 left-0 z-50 min-w-[220px] bg-white border border-zinc-200 rounded-xl shadow-xl overflow-hidden">
          {onModeChange && (
            <div className="flex items-center gap-1 p-2 border-b border-zinc-100">
              <button
                onClick={() => onModeChange("any")}
                className={`flex-1 h-7 text-xs rounded-md font-medium transition-colors ${
                  !isExclude ? "bg-blue-600 text-white" : "text-zinc-500 hover:bg-zinc-50"
                }`}
              >
                Any of
              </button>
              <button
                onClick={() => onModeChange("none")}
                className={`flex-1 h-7 text-xs rounded-md font-medium transition-colors ${
                  isExclude ? "bg-rose-600 text-white" : "text-zinc-500 hover:bg-zinc-50"
                }`}
              >
                None of
              </button>
            </div>
          )}
          <div className="max-h-60 overflow-y-auto py-1">
            {options.map((opt) => (
              <button
                key={opt.id}
                onClick={() => onToggle(opt.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-zinc-50 transition-colors"
              >
                <span
                  className={`shrink-0 w-[14px] h-[14px] rounded border flex items-center justify-center transition-all ${
                    selected.includes(opt.id)
                      ? isExclude ? "bg-rose-600 border-rose-600" : "bg-blue-600 border-blue-600"
                      : "border-zinc-300"
                  }`}
                >
                  {selected.includes(opt.id) && (
                    <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                  )}
                </span>
                <span className="text-zinc-800 text-left">{opt.label}</span>
              </button>
            ))}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-zinc-100 px-3 py-1.5">
              <button
                onClick={() => { onClear(); setOpen(false) }}
                className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Date range filter ────────────────────────────────────────────────────────

function DateRangeFilter({
  from,
  to,
  onApply,
}: {
  from?: string
  to?: string
  onApply: (from: string | null, to: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [localFrom, setLocalFrom] = useState(from ?? "")
  const [localTo, setLocalTo] = useState(to ?? "")
  const ref = useRef<HTMLDivElement>(null)
  const active = !!(from || to)

  useEffect(() => { setLocalFrom(from ?? ""); setLocalTo(to ?? "") }, [from, to])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm font-medium transition-all select-none ${
          active
            ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
            : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300 hover:text-zinc-900"
        }`}
      >
        <Calendar className="h-3.5 w-3.5 shrink-0" />
        Date Range
        {active && (
          <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-white/20 text-xs font-bold">✓</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full mt-2 left-0 z-50 bg-white border border-zinc-200 rounded-xl shadow-xl p-4 min-w-[220px]">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1.5">From</label>
              <input
                type="date"
                value={localFrom}
                onChange={(e) => setLocalFrom(e.target.value)}
                className="w-full h-8 px-2.5 text-sm border border-zinc-200 rounded-lg outline-none focus:border-zinc-400 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1.5">To</label>
              <input
                type="date"
                value={localTo}
                onChange={(e) => setLocalTo(e.target.value)}
                className="w-full h-8 px-2.5 text-sm border border-zinc-200 rounded-lg outline-none focus:border-zinc-400 transition-colors"
              />
            </div>
            <div className="flex gap-2 pt-0.5">
              <button
                onClick={() => { onApply(localFrom || null, localTo || null); setOpen(false) }}
                className="flex-1 h-8 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Apply
              </button>
              {active && (
                <button
                  onClick={() => { setLocalFrom(""); setLocalTo(""); onApply(null, null); setOpen(false) }}
                  className="h-8 px-3 text-sm text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SurgeryFilters({
  currentSearch,
  currentStatuses,
  currentStatusMode,
  currentFrom,
  currentTo,
  users = [],
  customPropertyDefs = [],
}: SurgeryFiltersProps) {
  // Record Owner + every Surgery custom property show up as filter criteria.
  const fields = useMemo(
    () => surgeryFilterFields({ users, customProps: customPropertyDefs }),
    [users, customPropertyDefs],
  )
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const [searchValue, setSearchValue] = useState(currentSearch ?? "")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMounted = useRef(false)

  useEffect(() => {
    if (!isMounted.current) { isMounted.current = true; return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const p = new URLSearchParams(params.toString())
      if (searchValue.trim()) p.set("search", searchValue.trim())
      else p.delete("search")
      p.delete("page")
      router.push(`${pathname}?${p.toString()}`)
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue])

  const navigate = (p: URLSearchParams) => router.push(`${pathname}?${p.toString()}`)

  // Advanced filter builder — held locally for responsive editing, then synced
  // to the URL (debounced) since surgery filtering runs server-side.
  const filterParam = params.get("filter")
  const [filterState, setFilterState] = useState<FilterState>(() => decodeFilterParam(filterParam) ?? emptyFilter())
  const filterDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    setFilterState(decodeFilterParam(filterParam) ?? emptyFilter())
  }, [filterParam])
  const advancedActive = activeConditionCount(filterState, fields) > 0
  const onFilterChange = (next: FilterState) => {
    setFilterState(next)
    if (filterDebounce.current) clearTimeout(filterDebounce.current)
    filterDebounce.current = setTimeout(() => {
      const p = new URLSearchParams(params.toString())
      if (activeConditionCount(next, fields) > 0) p.set("filter", JSON.stringify(next))
      else p.delete("filter")
      p.delete("page")
      router.push(`${pathname}?${p.toString()}`)
    }, 400)
  }

  const toggleStatus = (id: string) => {
    const p = new URLSearchParams(params.toString())
    const current = p.getAll("status")
    p.delete("status")
    if (current.includes(id)) current.filter((v) => v !== id).forEach((v) => p.append("status", v))
    else [...current, id].forEach((v) => p.append("status", v))
    p.delete("page")
    navigate(p)
  }

  const clearStatuses = () => {
    const p = new URLSearchParams(params.toString())
    p.delete("status")
    p.delete("statusMode")
    p.delete("page")
    navigate(p)
  }

  const setStatusMode = (mode: "any" | "none") => {
    const p = new URLSearchParams(params.toString())
    if (mode === "any") p.delete("statusMode")
    else p.set("statusMode", "none")
    p.delete("page")
    navigate(p)
  }

  const setDateRange = (from: string | null, to: string | null) => {
    const p = new URLSearchParams(params.toString())
    if (from) p.set("from", from); else p.delete("from")
    if (to) p.set("to", to); else p.delete("to")
    p.delete("page")
    navigate(p)
  }

  const hasFilters = !!currentSearch || currentStatuses.length > 0 || !!currentFrom || !!currentTo || advancedActive

  const clearAll = () => {
    setSearchValue("")
    setFilterState(emptyFilter())
    router.push(pathname)
  }

  // Active filter chips
  const chips: { label: string; onRemove: () => void }[] = []
  if (currentStatuses.length > 0) {
    const prefix = currentStatusMode === "none" ? "Status ≠ " : "Status: "
    chips.push({
      label: prefix + currentStatuses.map((s) => STATUS_OPTIONS.find((o) => o.id === s)?.label ?? s).join(", "),
      onRemove: clearStatuses,
    })
  }
  if (currentFrom || currentTo) {
    const label = currentFrom && currentTo
      ? `${currentFrom} → ${currentTo}`
      : currentFrom ? `From ${currentFrom}` : `Until ${currentTo}`
    chips.push({ label, onRemove: () => setDateRange(null, null) })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search patient or MRN..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="h-9 pl-9 pr-3 w-64 rounded-lg border border-zinc-200 bg-white text-sm placeholder:text-zinc-400 outline-none focus:border-zinc-400 transition-colors"
          />
          {searchValue && (
            <button
              onClick={() => setSearchValue("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Status */}
        <MultiSelectDropdown
          label="Status"
          options={STATUS_OPTIONS}
          selected={currentStatuses}
          onToggle={toggleStatus}
          onClear={clearStatuses}
          mode={currentStatusMode}
          onModeChange={setStatusMode}
        />

        {/* Date Range (creation date) */}
        <DateRangeFilter
          from={currentFrom}
          to={currentTo}
          onApply={setDateRange}
        />

        {/* Advanced filter builder */}
        <FilterBuilder fields={fields} value={filterState} onChange={onFilterChange} />

        {/* Clear all */}
        {hasFilters && (
          <button
            onClick={clearAll}
            className="inline-flex items-center gap-1 h-9 px-3 text-sm text-zinc-400 hover:text-zinc-700 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip.label}
              className="inline-flex items-center gap-1.5 h-6 pl-2.5 pr-1.5 rounded-full bg-zinc-100 text-xs text-zinc-700 font-medium"
            >
              {chip.label}
              <button onClick={chip.onRemove} className="text-zinc-400 hover:text-zinc-700 transition-colors">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
