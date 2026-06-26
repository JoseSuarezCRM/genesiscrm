import { prisma } from "@/lib/prisma"
import { ReferralStatus } from "@prisma/client"
import { auth } from "@/lib/auth"
import { requireView } from "@/lib/auth-guard"
import { userCan, userCanLevel } from "@/lib/permissions"
import Link from "next/link"
import { Suspense } from "react"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import ReferralFilters from "@/components/referral-filters"
import ReferralTable from "@/components/referral-table"
import ReferralsExportButton from "@/components/referrals-export-button"

interface PageProps {
  searchParams: {
    search?: string
    status?: string | string[]
    statusMode?: string
    from?: string
    to?: string
    practice?: string | string[]
    practiceMode?: string
    tag?: string | string[]
    tagMode?: string
    doctor?: string | string[]
    doctorMode?: string
    page?: string
    incomplete?: string
    pipeline?: string
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
  const statusMode: "any" | "none" = searchParams.statusMode === "none" ? "none" : "any"
  const practiceIds = toArray(searchParams.practice)
  const practiceMode: "any" | "none" = searchParams.practiceMode === "none" ? "none" : "any"
  const tagIds = toArray(searchParams.tag)
  const tagMode: "any" | "none" = searchParams.tagMode === "none" ? "none" : "any"
  const doctorIds = toArray(searchParams.doctor)
  const doctorMode: "any" | "none" = searchParams.doctorMode === "none" ? "none" : "any"
  const search = searchParams.search?.trim()
  const incompleteOnly = searchParams.incomplete === "1"
  const pipelineId = searchParams.pipeline ?? null

  const where = {
    ...(pipelineId ? { pipelineId } : {}),
    ...(incompleteOnly
      ? {
          OR: [
            { referringPracticeId: null },
            { referringLocationId: null },
            { referringDoctorId: null },
          ],
        }
      : {}),
    ...(statuses.length > 0 ? { status: statusMode === "none" ? { notIn: statuses } : { in: statuses } } : {}),
    ...(practiceIds.length > 0 ? { referringPracticeId: practiceMode === "none" ? { notIn: practiceIds } : { in: practiceIds } } : {}),
    ...(doctorIds.length > 0 ? { referringDoctorId: doctorMode === "none" ? { notIn: doctorIds } : { in: doctorIds } } : {}),
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
    ...(tagIds.length > 0
      ? { tags: tagMode === "none"
          ? { none: { tagId: { in: tagIds } } }
          : { some: { tagId: { in: tagIds } } } }
      : {}),
  }

  const [referrals, total, allMatchingIds, practices, allTags, incompleteCount, allDoctors, pipelines] = await Promise.all([
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
    (prisma as any).referral.findMany({ where, select: { id: true }, orderBy: { referralDate: "desc" } }),
    prisma.referringPractice.findMany({ orderBy: { name: "asc" } }),
    prisma.tag.findMany({ orderBy: { name: "asc" } }),
    prisma.referral.count({
      where: { OR: [{ referringPracticeId: null }, { referringLocationId: null }, { referringDoctorId: null }] },
    }),
    prisma.referringDoctor.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, title: true },
    }),
    (prisma as any).pipeline.findMany({
      where: { isActive: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: { _count: { select: { referrals: true } } },
    }),
  ])

  return {
    referrals,
    total,
    allMatchingIds: (allMatchingIds as { id: string }[]).map((r) => r.id),
    practices,
    allTags,
    allDoctors,
    pipelines,
    page,
    incompleteCount,
    incompleteOnly,
    statuses,
    statusMode,
    practiceIds,
    practiceMode,
    tagIds,
    tagMode,
    doctorIds,
    doctorMode,
    pipelineId,
  }
}

export default async function ReferralsPage({ searchParams }: PageProps) {
  const session = await requireView("REFERRALS")
  const canCreate = userCanLevel(session?.user as any, "REFERRALS", "EDIT")
  const canExport = userCan(session?.user as any, "EXPORT_DATA")
  const {
    referrals,
    total,
    allMatchingIds,
    practices,
    allTags,
    allDoctors,
    pipelines,
    page,
    incompleteCount,
    incompleteOnly,
    statuses,
    statusMode,
    practiceIds,
    practiceMode,
    tagIds,
    tagMode,
    doctorIds,
    doctorMode,
    pipelineId,
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
  if (statusMode === "none") exportParams.set("statusMode", "none")
  practiceIds.forEach((id) => exportParams.append("practice", id))
  if (practiceMode === "none") exportParams.set("practiceMode", "none")
  doctorIds.forEach((id) => exportParams.append("doctor", id))
  if (doctorMode === "none") exportParams.set("doctorMode", "none")
  tagIds.forEach((id) => exportParams.append("tag", id))
  if (tagMode === "none") exportParams.set("tagMode", "none")
  if (pipelineId) exportParams.set("pipeline", pipelineId)
  if (searchParams.from) exportParams.set("from", searchParams.from)
  if (searchParams.to) exportParams.set("to", searchParams.to)

  // Build a tab href that resets page but keeps other filters
  function pipelineTabHref(id: string | null) {
    const p = new URLSearchParams()
    statuses.forEach((s) => p.append("status", s))
    practiceIds.forEach((pid) => p.append("practice", pid))
    doctorIds.forEach((did) => p.append("doctor", did))
    tagIds.forEach((tid) => p.append("tag", tid))
    if (id) p.set("pipeline", id)
    return `/referrals?${p.toString()}`
  }

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
          {canExport && <ReferralsExportButton exportParams={exportParams.toString()} />}
          {canCreate && (
            <Button asChild>
              <Link href={`/referrals/new${pipelineId ? `?pipeline=${pipelineId}` : ""}`}>
                <Plus className="h-4 w-4 mr-2" />
                New Referral
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Pipeline tabs */}
      {pipelines.length > 0 && (
        <div className="flex gap-1 border-b border-zinc-200">
          <Link
            href={pipelineTabHref(null)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              !pipelineId
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
          >
            All
          </Link>
          {(pipelines as any[]).map((p) => (
            <Link
              key={p.id}
              href={pipelineTabHref(p.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                pipelineId === p.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              }`}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: p.color }}
              />
              {p.name}
              <span className="ml-1 text-xs text-slate-400">
                {(p as any)._count.referrals}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm">
        <Suspense fallback={null}>
          <ReferralFilters
            practices={(practices as any[]).map((p) => ({ id: p.id, label: p.name }))}
            doctors={(allDoctors as any[]).map((d) => ({
              id: d.id,
              label: d.title ? `${d.name}, ${d.title}` : d.name,
            }))}
            tags={(allTags as any[]).map((t) => ({ id: t.id, label: t.name, color: t.color }))}
            incompleteCount={incompleteCount}
            currentSearch={searchParams.search}
            currentStatuses={statuses}
            currentStatusMode={statusMode}
            currentPractices={practiceIds}
            currentPracticeMode={practiceMode}
            currentDoctors={doctorIds}
            currentDoctorMode={doctorMode}
            currentTags={tagIds}
            currentTagMode={tagMode}
            currentFrom={searchParams.from}
            currentTo={searchParams.to}
            incompleteOnly={incompleteOnly}
          />
        </Suspense>
      </div>

      {/* Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <ReferralTable referrals={referrals} pipelines={pipelines} allTags={(allTags as any[]).map((t) => ({ id: t.id, name: t.name, color: t.color }))} listUrl={listUrl} total={total} allMatchingIds={allMatchingIds} />

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
