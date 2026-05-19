"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { Search, ChevronDown, X, Check, AlertCircle, Calendar } from "lucide-react"

const STATUS_OPTIONS = [
  { id: "NEW", label: "New" },
  { id: "READY_FOR_CALL", label: "Ready for Call" },
  { id: "CONTACTED", label: "Contacted" },
  { id: "SCHEDULED", label: "Scheduled" },
  { id: "COMPLETED", label: "Completed" },
  { id: "NO_SHOW", label: "No Show" },
  { id: "LOST", label: "Lost" },
]

interface FilterOption {
  id: string
  label: string
  color?: string
}

interface ReferralFiltersProps {
  practices: FilterOption[]
  doctors: FilterOption[]
  tags: FilterOption[]
  incompleteCount: number
  currentSearch?: string
  currentStatuses: string[]
  currentStatusMode: "any" | "none"
  currentPractices: string[]
  currentPracticeMode: "any" | "none"
  currentDoctors: string[]
  currentDoctorMode: "any" | "none"
  currentTags: string[]
  currentTagMode: "any" | "none"
  currentFrom?: string
  currentTo?: string
  incompleteOnly: boolean
}

// ─── Multi-select dropdown ────────────────────────────────────────────────────

function MultiSelectDropdown({
  label,
  options,
  selected,
  onToggle,
  onClear,
  searchable,
  mode,
  onModeChange,
}: {
  label: string
  options: FilterOption[]
  selected: string[]
  onToggle: (id: string) => void
  onClear: () => void
  searchable?: boolean
  mode?: "any" | "none"
  onModeChange?: (mode: "any" | "none") => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered =
    searchable && search.trim()
      ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
      : options

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch("")
      }
    }
    if (open) {
      document.addEventListener("mousedown", handler)
      if (searchable) setTimeout(() => inputRef.current?.focus(), 0)
    }
    return () => document.removeEventListener("mousedown", handler)
  }, [open, searchable])

  const active = selected.length > 0
  const isExclude = mode === "none"

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm font-medium transition-all select-none ${
          active && isExclude
            ? "bg-rose-600 text-white border-rose-600 hover:bg-rose-700"
            : active
            ? "bg-zinc-900 text-white border-zinc-900 hover:bg-zinc-800"
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
        <div className="absolute top-full mt-2 left-0 z-50 min-w-[220px] max-w-[280px] bg-white border border-zinc-200 rounded-xl shadow-xl overflow-hidden">
          {/* Any of / None of toggle — only shown when this filter supports it */}
          {onModeChange && (
            <div className="flex items-center gap-1 p-2 border-b border-zinc-100">
              <button
                onClick={() => onModeChange("any")}
                className={`flex-1 h-7 text-xs rounded-md font-medium transition-colors ${
                  !isExclude ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-50"
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
          {searchable && (
            <div className="px-2 pt-2 pb-1">
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}...`}
                className="w-full h-8 px-2.5 text-sm bg-zinc-50 border border-zinc-200 rounded-lg outline-none focus:border-zinc-400 focus:bg-white transition-colors"
              />
            </div>
          )}
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2.5 text-sm text-zinc-400">No results</div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => onToggle(opt.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-zinc-50 transition-colors"
                >
                  <span
                    className={`shrink-0 w-[14px] h-[14px] rounded border flex items-center justify-center transition-all ${
                      selected.includes(opt.id)
                        ? isExclude ? "bg-rose-600 border-rose-600" : "bg-zinc-900 border-zinc-900"
                        : "border-zinc-300"
                    }`}
                  >
                    {selected.includes(opt.id) && (
                      <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                    )}
                  </span>
                  {opt.color ? (
                    <span className="flex items-center gap-2 text-zinc-800 text-left">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: opt.color }}
                      />
                      {opt.label}
                    </span>
                  ) : (
                    <span className="text-zinc-800 text-left">{opt.label}</span>
                  )}
                </button>
              ))
            )}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-zinc-100 px-3 py-1.5">
              <button
                onClick={() => {
                  onClear()
                  setOpen(false)
                }}
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

  useEffect(() => {
    setLocalFrom(from ?? "")
    setLocalTo(to ?? "")
  }, [from, to])

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
            ? "bg-zinc-900 text-white border-zinc-900 hover:bg-zinc-800"
            : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300 hover:text-zinc-900"
        }`}
      >
        <Calendar className="h-3.5 w-3.5 shrink-0" />
        Date Range
        {active && (
          <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-white/20 text-xs font-bold">
            ✓
          </span>
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
                onClick={() => {
                  onApply(localFrom || null, localTo || null)
                  setOpen(false)
                }}
                className="flex-1 h-8 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors"
              >
                Apply
              </button>
              {active && (
                <button
                  onClick={() => {
                    setLocalFrom("")
                    setLocalTo("")
                    onApply(null, null)
                    setOpen(false)
                  }}
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

export default function ReferralFilters({
  practices,
  doctors,
  tags,
  incompleteCount,
  currentSearch,
  currentStatuses,
  currentStatusMode,
  currentPractices,
  currentPracticeMode,
  currentDoctors,
  currentDoctorMode,
  currentTags,
  currentTagMode,
  currentFrom,
  currentTo,
  incompleteOnly,
}: ReferralFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  // Debounced search
  const [searchValue, setSearchValue] = useState(currentSearch ?? "")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMounted = useRef(false)

  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const p = new URLSearchParams(params.toString())
      if (searchValue.trim()) {
        p.set("search", searchValue.trim())
      } else {
        p.delete("search")
      }
      p.delete("page")
      router.push(`${pathname}?${p.toString()}`)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue])

  // Navigation helpers
  const navigate = (p: URLSearchParams) => router.push(`${pathname}?${p.toString()}`)

  const toggleMulti = (key: string, value: string) => {
    const p = new URLSearchParams(params.toString())
    const current = p.getAll(key)
    p.delete(key)
    if (current.includes(value)) {
      current.filter((v) => v !== value).forEach((v) => p.append(key, v))
    } else {
      [...current, value].forEach((v) => p.append(key, v))
    }
    p.delete("page")
    navigate(p)
  }

  const clearKey = (key: string) => {
    const p = new URLSearchParams(params.toString())
    p.delete(key)
    p.delete("page")
    navigate(p)
  }

  const setDateRange = (from: string | null, to: string | null) => {
    const p = new URLSearchParams(params.toString())
    if (from) p.set("from", from)
    else p.delete("from")
    if (to) p.set("to", to)
    else p.delete("to")
    p.delete("page")
    navigate(p)
  }

  const toggleIncomplete = () => {
    const p = new URLSearchParams(params.toString())
    if (incompleteOnly) p.delete("incomplete")
    else p.set("incomplete", "1")
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

  const setPracticeMode = (mode: "any" | "none") => {
    const p = new URLSearchParams(params.toString())
    if (mode === "any") p.delete("practiceMode")
    else p.set("practiceMode", "none")
    p.delete("page")
    navigate(p)
  }

  const setDoctorMode = (mode: "any" | "none") => {
    const p = new URLSearchParams(params.toString())
    if (mode === "any") p.delete("doctorMode")
    else p.set("doctorMode", "none")
    p.delete("page")
    navigate(p)
  }

  const setTagMode = (mode: "any" | "none") => {
    const p = new URLSearchParams(params.toString())
    if (mode === "any") p.delete("tagMode")
    else p.set("tagMode", "none")
    p.delete("page")
    navigate(p)
  }

  const clearAll = () => {
    setSearchValue("")
    navigate(new URLSearchParams())
  }

  // Active filter chips
  const chips: { key: string; value: string; label: string; color?: string; exclude?: boolean }[] = [
    ...currentStatuses.map((s) => ({
      key: "status",
      value: s,
      label: STATUS_OPTIONS.find((o) => o.id === s)?.label ?? s,
      exclude: currentStatusMode === "none",
    })),
    ...currentPractices.map((id) => ({
      key: "practice",
      value: id,
      label: practices.find((p) => p.id === id)?.label ?? id,
      exclude: currentPracticeMode === "none",
    })),
    ...currentDoctors.map((id) => ({
      key: "doctor",
      value: id,
      label: doctors.find((d) => d.id === id)?.label ?? id,
      exclude: currentDoctorMode === "none",
    })),
    ...currentTags.map((id) => ({
      key: "tag",
      value: id,
      label: tags.find((t) => t.id === id)?.label ?? id,
      color: tags.find((t) => t.id === id)?.color,
      exclude: currentTagMode === "none",
    })),
  ]

  const hasActiveFilters =
    chips.length > 0 || currentFrom || currentTo || !!currentSearch || incompleteOnly

  return (
    <div className="space-y-2.5">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
          <input
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Search patient, doctor or practice..."
            className="w-full h-9 pl-9 pr-3 text-sm border border-zinc-200 rounded-lg outline-none focus:border-zinc-400 transition-colors bg-white placeholder:text-zinc-400"
          />
        </div>

        {/* Status */}
        <MultiSelectDropdown
          label="Status"
          options={STATUS_OPTIONS}
          selected={currentStatuses}
          onToggle={(v) => toggleMulti("status", v)}
          onClear={() => { clearKey("status"); setStatusMode("any") }}
          mode={currentStatusMode}
          onModeChange={setStatusMode}
        />

        {/* Practices */}
        <MultiSelectDropdown
          label="Practices"
          options={practices}
          selected={currentPractices}
          onToggle={(v) => toggleMulti("practice", v)}
          onClear={() => { clearKey("practice"); setPracticeMode("any") }}
          searchable={practices.length > 8}
          mode={currentPracticeMode}
          onModeChange={setPracticeMode}
        />

        {/* Providers */}
        <MultiSelectDropdown
          label="Providers"
          options={doctors}
          selected={currentDoctors}
          onToggle={(v) => toggleMulti("doctor", v)}
          onClear={() => { clearKey("doctor"); setDoctorMode("any") }}
          searchable={doctors.length > 8}
          mode={currentDoctorMode}
          onModeChange={setDoctorMode}
        />

        {/* Tags */}
        {tags.length > 0 && (
          <MultiSelectDropdown
            label="Tags"
            options={tags}
            selected={currentTags}
            onToggle={(v) => toggleMulti("tag", v)}
            onClear={() => { clearKey("tag"); setTagMode("any") }}
            mode={currentTagMode}
            onModeChange={setTagMode}
          />
        )}

        {/* Date range */}
        <DateRangeFilter from={currentFrom} to={currentTo} onApply={setDateRange} />

        {/* Incomplete source */}
        <button
          onClick={toggleIncomplete}
          className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm font-medium transition-all select-none ${
            incompleteOnly
              ? "bg-amber-500 text-white border-amber-500 hover:bg-amber-600"
              : incompleteCount > 0
              ? "bg-white text-amber-700 border-amber-300 hover:bg-amber-50"
              : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300"
          }`}
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Incomplete source
          {incompleteCount > 0 && (
            <span
              className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-xs font-bold ${
                incompleteOnly ? "bg-white/25 text-white" : "bg-amber-500 text-white"
              }`}
            >
              {incompleteCount}
            </span>
          )}
        </button>

        {/* Clear all */}
        {hasActiveFilters && (
          <button
            onClick={clearAll}
            className="h-9 px-2 text-sm text-zinc-400 hover:text-zinc-700 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-zinc-400 font-medium">Active:</span>
          {chips.map((chip, i) =>
            chip.exclude ? (
              <span
                key={`${chip.key}-${chip.value}-${i}`}
                className="inline-flex items-center gap-1 h-6 pl-1.5 pr-1 rounded-md text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200"
              >
                <span className="text-rose-400 font-bold mr-0.5">≠</span>
                {chip.color && (
                  <span className="w-1.5 h-1.5 rounded-full shrink-0 opacity-60" style={{ backgroundColor: chip.color }} />
                )}
                {chip.label}
                <button onClick={() => toggleMulti(chip.key, chip.value)} className="ml-0.5 hover:opacity-60 transition-opacity">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ) : chip.color ? (
              <span
                key={`${chip.key}-${chip.value}-${i}`}
                className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-md text-xs font-medium border"
                style={{
                  backgroundColor: chip.color + "22",
                  color: chip.color,
                  borderColor: chip.color + "55",
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: chip.color }} />
                {chip.label}
                <button onClick={() => toggleMulti(chip.key, chip.value)} className="ml-0.5 hover:opacity-60 transition-opacity">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ) : (
              <span
                key={`${chip.key}-${chip.value}-${i}`}
                className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-md text-xs font-medium bg-zinc-100 text-zinc-700 border border-zinc-200"
              >
                {chip.label}
                <button onClick={() => toggleMulti(chip.key, chip.value)} className="ml-0.5 hover:opacity-60 transition-opacity">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )
          )}
        </div>
      )}
    </div>
  )
}
