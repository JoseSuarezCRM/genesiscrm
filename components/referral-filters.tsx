"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { Search, AlertCircle } from "lucide-react"
import FilterBuilder from "@/components/ui/filter-builder"
import { decodeFilterParam, emptyFilter, activeConditionCount, type FilterState, type CustomPropDef } from "@/lib/filters"
import { referralFilterFields } from "@/lib/referral-filter-fields"

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
  // Advanced FilterBuilder inputs (serializable — fields are built client-side).
  users?: { id: string; label: string }[]
  pipelines?: { id: string; label: string }[]
  locations?: { id: string; label: string }[]
  customPropertyDefs?: CustomPropDef[]
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
  users = [],
  pipelines = [],
  locations = [],
  customPropertyDefs = [],
}: ReferralFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  // Every filterable field — native columns, relational selects (status, practice,
  // provider, location, pipeline, owner), Tags, and every custom property — is an
  // advanced FilterBuilder criterion. The old inline dropdowns are gone.
  const fields = useMemo(
    () => referralFilterFields({
      users, practices, doctors, locations, pipelines,
      tags: tags.map((t) => ({ id: t.id, label: t.label })),
      customProps: customPropertyDefs,
    }),
    [users, practices, doctors, locations, pipelines, tags, customPropertyDefs],
  )

  // Legacy quick-filter params (status/practice/doctor/tag/date) can arrive from
  // report drill-ins, bookmarks, or older saved views. Fold them into the advanced
  // `filter` on landing so the Filter button reflects them (visible + editable +
  // clearable), then strip the quick params. Runs once.
  const normalizedRef = useRef(false)
  useEffect(() => {
    if (normalizedRef.current) return
    const sp = new URLSearchParams(params.toString())
    const status = sp.getAll("status"), practice = sp.getAll("practice")
    const doctor = sp.getAll("doctor"), tag = sp.getAll("tag")
    const from = sp.get("from"), to = sp.get("to")
    if (!(status.length || practice.length || doctor.length || tag.length || from || to)) return
    normalizedRef.current = true
    const cid = () => "c" + Math.random().toString(36).slice(2, 8)
    const conds: any[] = []
    const addSel = (field: string, ids: string[], mode: string | null) => {
      if (ids.length) conds.push({ id: cid(), field, operator: mode === "none" ? "is_none_of" : "is_any_of", value: ids })
    }
    addSel("status", status, sp.get("statusMode"))
    addSel("referringPracticeId", practice, sp.get("practiceMode"))
    addSel("referringDoctorId", doctor, sp.get("doctorMode"))
    addSel("tags", tag, sp.get("tagMode"))
    if (from) conds.push({ id: cid(), field: "referralDate", operator: "on_or_after", value: from })
    if (to) conds.push({ id: cid(), field: "referralDate", operator: "on_or_before", value: to })
    const existing = decodeFilterParam(sp.get("filter"))
    const groups = existing?.groups ? [...existing.groups] : []
    groups.push({ id: "g" + Math.random().toString(36).slice(2, 8), combinator: "AND", conditions: conds })
    const next = { combinator: existing?.combinator ?? "AND", groups }
    const p = new URLSearchParams(params.toString())
    for (const k of ["status", "statusMode", "practice", "practiceMode", "doctor", "doctorMode", "tag", "tagMode", "from", "to"]) p.delete(k)
    p.set("filter", JSON.stringify(next))
    p.delete("page")
    router.replace(`${pathname}?${p.toString()}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Advanced filter state — held locally for responsive editing, synced (debounced)
  // to the `filter` URL param since referral filtering runs server-side.
  const filterParam = params.get("filter")
  const [filterState, setFilterState] = useState<FilterState>(() => decodeFilterParam(filterParam) ?? emptyFilter())
  const filterDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => { setFilterState(decodeFilterParam(filterParam) ?? emptyFilter()) }, [filterParam])
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

  const navigate = (p: URLSearchParams) => router.push(`${pathname}?${p.toString()}`)

  const toggleIncomplete = () => {
    const p = new URLSearchParams(params.toString())
    if (incompleteOnly) p.delete("incomplete")
    else p.set("incomplete", "1")
    p.delete("page")
    navigate(p)
  }

  const clearAll = () => {
    setSearchValue("")
    setFilterState(emptyFilter())
    navigate(new URLSearchParams())
  }

  const hasActiveFilters = incompleteOnly || !!currentSearch || advancedActive

  return (
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

      {/* Advanced filter — covers status, practice, provider, tags, dates, and every custom property */}
      <FilterBuilder fields={fields} value={filterState} onChange={onFilterChange} />

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
  )
}
