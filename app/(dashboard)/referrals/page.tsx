import { prisma } from "@/lib/prisma"
import { ReferralStatus } from "@prisma/client"
import Link from "next/link"
import { Suspense } from "react"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import { formatDate, formatPhone } from "@/lib/utils"
import { Plus, Download, Phone } from "lucide-react"
import ReferralFilters from "@/components/referral-filters"

interface PageProps {
  searchParams: {
    search?: string
    status?: string | string[]
    from?: string
    to?: string
    practice?: string | string[]
    tag?: string | string[]
    doctor?: string | string[]
    page?: string
    incomplete?: string
  }
}

function toArray(val: string | string[] | undefined): string[] {
  if (!val) return []
  return Array.isArray(val) ? val : [val]
}

const PAGE_SIZE = 20

async function getReferrals(searchParams: PageProps["searchParams"]) {
  const page = Math.max(1, parseInt(searchParams.page ?? "1"))
  const skip = (page - 1) * PAGE_SIZE

  const statuses = toArray(searchParams.status).filter((s) =>
    Object.values(ReferralStatus).includes(s as ReferralStatus)
  ) as ReferralStatus[]
  const practiceIds = toArray(searchParams.practice)
  const tagIds = toArray(searchParams.tag)
  const doctorIds = toArray(searchParams.doctor)
  const search = searchParams.search?.trim()
  const incompleteOnly = searchParams.incomplete === "1"

  const where = {
    ...(incompleteOnly
      ? {
          OR: [
            { referringPracticeId: null },
            { referringLocationId: null },
            { referringDoctorId: null },
          ],
        }
      : {}),
    ...(statuses.length > 0 ? { status: { in: statuses } } : {}),
    ...(practiceIds.length > 0 ? { referringPracticeId: { in: practiceIds } } : {}),
    ...(doctorIds.length > 0 ? { referringDoctorId: { in: doctorIds } } : {}),
    ...(searchParams.from || searchParams.to
      ? {
          referralDate: {
            ...(searchParams.from ? { gte: new Date(searchParams.from) } : {}),
            ...(searchParams.to ? { lte: new Date(searchParams.to) } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { patientFirstName: { contains: search, mode: "insensitive" as const } },
            { patientLastName: { contains: search, mode: "insensitive" as const } },
            { referringDoctorName: { contains: search, mode: "insensitive" as const } },
            { referringPractice: { name: { contains: search, mode: "insensitive" as const } } },
            { genesisMrn: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(tagIds.length > 0 ? { tags: { some: { tagId: { in: tagIds } } } } : {}),
  }

  const [referrals, total, practices, allTags, incompleteCount, allDoctors] = await Promise.all([
    prisma.referral.findMany({
      where,
      take: PAGE_SIZE,
      skip,
      orderBy: { referralDate: "desc" },
      include: {
        referringPractice: true,
        tags: { include: { tag: true } },
        _count: { select: { callAttempts: true } },
      },
    }),
    prisma.referral.count({ where }),
    prisma.referringPractice.findMany({ orderBy: { name: "asc" } }),
    prisma.tag.findMany({ orderBy: { name: "asc" } }),
    prisma.referral.count({
      where: { OR: [{ referringPracticeId: null }, { referringLocationId: null }, { referringDoctorId: null }] },
    }),
    prisma.referringDoctor.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, title: true },
    }),
  ])

  return {
    referrals,
    total,
    practices,
    allTags,
    allDoctors,
    page,
    incompleteCount,
    incompleteOnly,
    statuses,
    practiceIds,
    tagIds,
    doctorIds,
  }
}

export default async function ReferralsPage({ searchParams }: PageProps) {
  const {
    referrals,
    total,
    practices,
    allTags,
    allDoctors,
    page,
    incompleteCount,
    incompleteOnly,
    statuses,
    practiceIds,
    tagIds,
    doctorIds,
  } = await getReferrals(searchParams)

  const listUrl = `/referrals?${new URLSearchParams(
    Object.fromEntries(
      Object.entries(searchParams).flatMap(([k, v]) =>
        v == null ? [] : Array.isArray(v) ? v.map((val) => [k, val]) : [[k, v]]
      )
    )
  )}`
  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Build export URL preserving all active filters
  const exportParams = new URLSearchParams()
  statuses.forEach((s) => exportParams.append("status", s))
  practiceIds.forEach((id) => exportParams.append("practice", id))
  doctorIds.forEach((id) => exportParams.append("doctor", id))
  tagIds.forEach((id) => exportParams.append("tag", id))
  if (searchParams.from) exportParams.set("from", searchParams.from)
  if (searchParams.to) exportParams.set("to", searchParams.to)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Referrals</h1>
          <p className="text-sm text-slate-500">
            {total} total referral{total !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href={`/api/referrals/export?${exportParams}`} download>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </a>
          </Button>
          <Button asChild>
            <Link href="/referrals/new">
              <Plus className="h-4 w-4 mr-2" />
              New Referral
            </Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm">
        <Suspense fallback={null}>
          <ReferralFilters
            practices={practices.map((p) => ({ id: p.id, label: p.name }))}
            doctors={allDoctors.map((d) => ({
              id: d.id,
              label: d.title ? `${d.name}, ${d.title}` : d.name,
            }))}
            tags={allTags.map((t) => ({ id: t.id, label: t.name, color: t.color }))}
            incompleteCount={incompleteCount}
            currentSearch={searchParams.search}
            currentStatuses={statuses}
            currentPractices={practiceIds}
            currentDoctors={doctorIds}
            currentTags={tagIds}
            currentFrom={searchParams.from}
            currentTo={searchParams.to}
            incompleteOnly={incompleteOnly}
          />
        </Suspense>
      </div>

      {/* Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <th className="text-left px-6 py-3 font-semibold">Patient</th>
                <th className="text-left px-6 py-3 font-semibold">Phone</th>
                <th className="text-left px-6 py-3 font-semibold">Referring Practice</th>
                <th className="text-left px-6 py-3 font-semibold">Tags</th>
                <th className="text-left px-6 py-3 font-semibold">Referral Date</th>
                <th className="text-left px-6 py-3 font-semibold">Appt Date</th>
                <th className="text-left px-6 py-3 font-semibold">Calls</th>
                <th className="text-left px-6 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {referrals.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-12 text-center text-slate-400"
                  >
                    No referrals found.{" "}
                    <Link
                      href="/referrals/new"
                      className="text-blue-600 hover:underline"
                    >
                      Create one
                    </Link>
                    .
                  </td>
                </tr>
              ) : (
                referrals.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-3">
                      <Link
                        href={`/referrals/${r.id}?from=${encodeURIComponent(listUrl)}`}
                        className="font-medium text-slate-900 hover:text-blue-600"
                      >
                        {r.patientFirstName} {r.patientLastName}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {formatPhone(r.patientPhone)}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {r.referringPractice?.name ?? "—"}
                    </td>
                    <td className="px-6 py-3">
                      {r.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {r.tags.map(({ tag }) => (
                            <span
                              key={tag.id}
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium text-white"
                              style={{ backgroundColor: tag.color }}
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {formatDate(r.referralDate)}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {formatDate(r.appointmentDate)}
                    </td>
                    <td className="px-6 py-3">
                      {r._count.callAttempts > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                          <Phone className="h-3 w-3" />
                          {r._count.callAttempts}/3
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            baseParams={Object.entries(searchParams).flatMap(([k, v]) =>
              v == null || k === "page" ? [] : Array.isArray(v) ? v.map((val): [string, string] => [k, val]) : [[k, v] as [string, string]]
            )}
          />
        )}
      </div>
    </div>
  )
}

function Pagination({ page, totalPages, total, baseParams }: {
  page: number
  totalPages: number
  total: number
  baseParams: [string, string][]
}) {
  function href(p: number) {
    const params = new URLSearchParams(baseParams)
    params.set("page", String(p))
    return `/referrals?${params.toString()}`
  }

  // Build page number list with ellipsis: always show first, last, current ±2
  const pages: (number | "…")[] = []
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
      pages.push(i)
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…")
    }
  }

  const btnBase = "inline-flex items-center justify-center h-8 min-w-[2rem] px-2 rounded-md text-sm font-medium transition-colors border"
  const btnActive = "bg-blue-600 text-white border-blue-600"
  const btnInactive = "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
  const btnDisabled = "bg-white text-slate-300 border-slate-200 cursor-not-allowed"

  return (
    <div className="flex items-center justify-between px-6 py-3 border-t bg-slate-50 text-sm flex-wrap gap-2">
      <span className="text-slate-500 shrink-0">
        Page {page} of {totalPages} &middot; {total} results
      </span>
      <div className="flex items-center gap-1 flex-wrap">
        {/* First */}
        {page > 1 ? (
          <Link href={href(1)} className={`${btnBase} ${btnInactive}`}>«</Link>
        ) : (
          <span className={`${btnBase} ${btnDisabled}`}>«</span>
        )}
        {/* Prev */}
        {page > 1 ? (
          <Link href={href(page - 1)} className={`${btnBase} ${btnInactive}`}>‹</Link>
        ) : (
          <span className={`${btnBase} ${btnDisabled}`}>‹</span>
        )}
        {/* Page numbers */}
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`ellipsis-${i}`} className="px-1 text-slate-400">…</span>
          ) : (
            <Link key={p} href={href(p)} className={`${btnBase} ${p === page ? btnActive : btnInactive}`}>
              {p}
            </Link>
          )
        )}
        {/* Next */}
        {page < totalPages ? (
          <Link href={href(page + 1)} className={`${btnBase} ${btnInactive}`}>›</Link>
        ) : (
          <span className={`${btnBase} ${btnDisabled}`}>›</span>
        )}
        {/* Last */}
        {page < totalPages ? (
          <Link href={href(totalPages)} className={`${btnBase} ${btnInactive}`}>»</Link>
        ) : (
          <span className={`${btnBase} ${btnDisabled}`}>»</span>
        )}
      </div>
    </div>
  )
}
