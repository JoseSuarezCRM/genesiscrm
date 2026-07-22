import { auth } from "@/lib/auth"
import { requireView } from "@/lib/auth-guard"
import { userCan, userCanLevel } from "@/lib/permissions"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getSurgeryCases } from "@/app/actions/surgery"
import { prisma } from "@/lib/prisma"
import SurgeryImportDialog from "@/components/surgery-import-dialog"
import SurgeryCreateDialog from "@/components/surgery-create-dialog"
import SurgeryFilters from "@/components/surgery-filters"
import SurgeryTable from "@/components/surgery-table"
import SurgeryViewsBar from "@/components/surgery-views-bar"
import { getSurgeryViews } from "@/app/actions/surgery-views"
import { getViewShareOptions } from "@/app/actions/view-share-options"
import { decodeFilterParam } from "@/lib/filters"
import { Stethoscope, ChevronLeft, ChevronRight } from "lucide-react"
import { Suspense } from "react"

interface PageProps {
  searchParams: {
    search?: string
    status?: string | string[]
    statusMode?: string
    from?: string
    to?: string
    filter?: string
    page?: string
    sort?: string
    dir?: string
  }
}

function toArray(val: string | string[] | undefined): string[] {
  if (!val) return []
  return Array.isArray(val) ? val : [val]
}

export default async function SurgeryPage({ searchParams }: PageProps) {
  const session = await requireView("SURGERY")
  if (!session) redirect("/login")
  const canManage = userCanLevel(session.user as any, "SURGERY", "EDIT")
  const canImport = userCan(session.user as any, "IMPORT_DATA")

  const statuses = toArray(searchParams.status)
  const statusMode: "any" | "none" = searchParams.statusMode === "none" ? "none" : "any"
  const page = Math.max(1, parseInt(searchParams.page ?? "1"))

  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc"
  const advancedFilter = decodeFilterParam(searchParams.filter)
  const { cases, total, allMatchingIds, pageSize } = await getSurgeryCases({
    search: searchParams.search,
    statuses,
    statusMode,
    from: searchParams.from,
    to: searchParams.to,
    filter: advancedFilter,
    page,
    sort: searchParams.sort,
    dir,
  })

  // Record Owner + Surgery custom properties are selectable filter criteria.
  const [filterUsers, surgeryCustomProps] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    prisma.customProperty.findMany({ where: { entityType: "SURGERY" }, orderBy: { createdAt: "asc" } }),
  ])

  const [savedViews, shareOptions] = await Promise.all([getSurgeryViews(), getViewShareOptions()])

  const totalPages = Math.ceil(total / pageSize)

  function buildUrl(overrides: Record<string, string | undefined>) {
    const p = new URLSearchParams()
    const merged = { ...searchParams, ...overrides }
    for (const [k, v] of Object.entries(merged)) {
      if (v == null) continue
      if (k === "status") continue // handled separately
      p.set(k, String(v))
    }
    // Re-add multi-value status
    const statArr = overrides.status !== undefined
      ? (overrides.status ? [overrides.status] : [])
      : statuses
    statArr.forEach((s) => p.append("status", s))
    return `/surgery?${p.toString()}`
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Surgery</h1>
          <p className="text-sm text-slate-500">{total} case{total !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && <SurgeryCreateDialog />}
          {canImport && <SurgeryImportDialog />}
        </div>
      </div>

      {/* Filters */}
      <Suspense>
        <SurgeryFilters
          currentSearch={searchParams.search}
          currentStatuses={statuses}
          currentStatusMode={statusMode}
          currentFrom={searchParams.from}
          currentTo={searchParams.to}
          users={filterUsers.map((u) => ({ id: u.id, label: u.name ?? u.email }))}
          customPropertyDefs={surgeryCustomProps.map((p) => ({ id: p.id, name: p.name, type: p.type, options: p.options }))}
        />
      </Suspense>

      {/* Saved views */}
      <Suspense>
        <SurgeryViewsBar
          views={savedViews as any}
          shareUsers={shareOptions.users as any}
          shareTeams={shareOptions.teams as any}
        />
      </Suspense>

      {/* Empty state when no cases at all */}
      {total === 0 && !searchParams.search && statuses.length === 0 && !searchParams.from && !searchParams.to ? (
        <div className="bg-white border rounded-xl py-20 text-center space-y-3">
          <Stethoscope className="h-10 w-10 text-slate-300 mx-auto" />
          <p className="text-slate-500 font-medium">No surgery cases yet</p>
          <p className="text-slate-400 text-sm">Add a case manually or import a CSV or XLSX file to get started.</p>
          <div className="flex items-center justify-center gap-2 pt-2">
            {canManage && <SurgeryCreateDialog />}
            {canImport && <SurgeryImportDialog />}
          </div>
        </div>
      ) : (
        <SurgeryTable cases={cases as any[]} total={total} allMatchingIds={allMatchingIds} />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Link
              href={page > 1 ? buildUrl({ page: String(page - 1) }) : "#"}
              className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${
                page <= 1
                  ? "border-zinc-100 text-zinc-300 pointer-events-none"
                  : "border-zinc-200 hover:border-zinc-400 hover:text-slate-900"
              }`}
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = i + 1
              return (
                <Link
                  key={p}
                  href={buildUrl({ page: String(p) })}
                  className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border text-sm font-medium transition-colors ${
                    p === page
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-zinc-200 hover:border-zinc-400 hover:text-slate-900"
                  }`}
                >
                  {p}
                </Link>
              )
            })}
            <Link
              href={page < totalPages ? buildUrl({ page: String(page + 1) }) : "#"}
              className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${
                page >= totalPages
                  ? "border-zinc-100 text-zinc-300 pointer-events-none"
                  : "border-zinc-200 hover:border-zinc-400 hover:text-slate-900"
              }`}
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
