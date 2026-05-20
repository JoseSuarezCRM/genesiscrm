import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getSurgeryCases } from "@/app/actions/surgery"
import { SURGERY_STATUS_LABELS } from "@/lib/surgery-constants"
import SurgeryImportDialog from "@/components/surgery-import-dialog"
import SurgeryFilters from "@/components/surgery-filters"
import { Phone, FileText, Stethoscope, ChevronLeft, ChevronRight } from "lucide-react"
import { Suspense } from "react"

const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-zinc-100 text-zinc-700",
  SCHEDULED: "bg-blue-100 text-blue-700",
  PENDING_CONFIRMATION: "bg-amber-100 text-amber-700",
  PENDING_CLEARANCE: "bg-orange-100 text-orange-700",
  CANCELED: "bg-red-100 text-red-700",
  COMPLETED: "bg-green-100 text-green-700",
}

interface PageProps {
  searchParams: {
    search?: string
    status?: string | string[]
    statusMode?: string
    from?: string
    to?: string
    page?: string
  }
}

function toArray(val: string | string[] | undefined): string[] {
  if (!val) return []
  return Array.isArray(val) ? val : [val]
}

export default async function SurgeryPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session) redirect("/login")

  const statuses = toArray(searchParams.status)
  const statusMode: "any" | "none" = searchParams.statusMode === "none" ? "none" : "any"
  const page = Math.max(1, parseInt(searchParams.page ?? "1"))

  const { cases, total, pageSize } = await getSurgeryCases({
    search: searchParams.search,
    statuses,
    statusMode,
    from: searchParams.from,
    to: searchParams.to,
    page,
  })

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
        <SurgeryImportDialog />
      </div>

      {/* Filters */}
      <Suspense>
        <SurgeryFilters
          currentSearch={searchParams.search}
          currentStatuses={statuses}
          currentStatusMode={statusMode}
          currentFrom={searchParams.from}
          currentTo={searchParams.to}
        />
      </Suspense>

      {/* Table */}
      <div className="bg-white border rounded-xl overflow-hidden">
        {(cases as any[]).length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <Stethoscope className="h-10 w-10 text-slate-300 mx-auto" />
            <p className="text-slate-500 font-medium">
              {total === 0 && !searchParams.search && statuses.length === 0 && !searchParams.from && !searchParams.to
                ? "No surgery cases yet"
                : "No cases match the current filters"}
            </p>
            {total === 0 && !searchParams.search && statuses.length === 0 ? (
              <p className="text-slate-400 text-sm">Import a CSV or XLSX file to get started.</p>
            ) : null}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-semibold">Patient</th>
                <th className="text-left px-4 py-3 font-semibold">MRN</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-left px-4 py-3 font-semibold">Surgery Date</th>
                <th className="text-left px-4 py-3 font-semibold">Diagnosis</th>
                <th className="text-left px-4 py-3 font-semibold">Expires</th>
                <th className="text-left px-4 py-3 font-semibold">Calls</th>
                <th className="text-left px-4 py-3 font-semibold">Docs</th>
              </tr>
            </thead>
            <tbody>
              {(cases as any[]).map((c) => (
                <tr key={c.id} className="border-b hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/surgery/${c.id}`}
                      className="font-medium text-slate-900 hover:text-blue-600 transition-colors"
                    >
                      {c.patientName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{c.mrn ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_COLORS[c.status] ?? "bg-zinc-100 text-zinc-700"}`}>
                      {SURGERY_STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.surgeryDate ? new Date(c.surgeryDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">{c.diagnosis ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.expires ? new Date(c.expires).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {c._count.callAttempts > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                        <Phone className="h-3 w-3" />
                        {c._count.callAttempts}/4
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {c._count.documents > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                        <FileText className="h-3 w-3" />
                        {c._count.documents}
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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
                      ? "bg-zinc-900 text-white border-zinc-900"
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
