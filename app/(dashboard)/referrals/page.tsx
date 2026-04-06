import { prisma } from "@/lib/prisma"
import { ReferralStatus } from "@prisma/client"
import Link from "next/link"
import { Suspense } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/status-badge"
import { STATUS_LABELS, formatDate, formatPhone } from "@/lib/utils"
import { Plus, Download, Phone, AlertCircle } from "lucide-react"
import ReferralSearch from "@/components/referral-search"

interface PageProps {
  searchParams: {
    search?: string
    status?: string
    from?: string
    to?: string
    practice?: string
    tag?: string
    page?: string
    incomplete?: string
  }
}

const PAGE_SIZE = 20

async function getReferrals(searchParams: PageProps["searchParams"]) {
  const page = Math.max(1, parseInt(searchParams.page ?? "1"))
  const skip = (page - 1) * PAGE_SIZE
  const status = searchParams.status as ReferralStatus | undefined
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
    ...(status && Object.values(ReferralStatus).includes(status)
      ? { status }
      : {}),
    ...(searchParams.practice
      ? { referringPracticeId: searchParams.practice }
      : {}),
    ...(searchParams.from || searchParams.to
      ? {
          referralDate: {
            ...(searchParams.from
              ? { gte: new Date(searchParams.from) }
              : {}),
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
          ],
        }
      : {}),
    ...(searchParams.tag
      ? { tags: { some: { tagId: searchParams.tag } } }
      : {}),
  }

  const [referrals, total, practices, allTags, incompleteCount] = await Promise.all([
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
  ])

  return { referrals, total, practices, allTags, page, incompleteCount, incompleteOnly }
}

export default async function ReferralsPage({ searchParams }: PageProps) {
  const { referrals, total, practices, allTags, page, incompleteCount, incompleteOnly } = await getReferrals(searchParams)
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const exportParams = new URLSearchParams()
  if (searchParams.status) exportParams.set("status", searchParams.status)
  if (searchParams.from) exportParams.set("from", searchParams.from)
  if (searchParams.to) exportParams.set("to", searchParams.to)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Referrals</h1>
          <p className="text-sm text-slate-500">{total} total referral{total !== 1 ? "s" : ""}</p>
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
      <div className="flex flex-wrap gap-3 bg-white border rounded-lg p-4">
        <Suspense fallback={null}>
          <ReferralSearch defaultValue={searchParams.search} />
        </Suspense>
        <form method="GET" className="contents">
        <select
          name="status"
          defaultValue={searchParams.status ?? ""}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Statuses</option>
          {Object.values(ReferralStatus).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          name="practice"
          defaultValue={searchParams.practice ?? ""}
          className="h-10 w-48 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Practices</option>
          {practices.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {allTags.length > 0 && (
          <select
            name="tag"
            defaultValue={searchParams.tag ?? ""}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All Tags</option>
            {allTags.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
        <Input
          name="from"
          type="date"
          defaultValue={searchParams.from}
          className="w-auto"
          title="From date"
        />
        <Input
          name="to"
          type="date"
          defaultValue={searchParams.to}
          className="w-auto"
          title="To date"
        />
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        <Button type="reset" variant="ghost" asChild>
          <Link href="/referrals">Clear</Link>
        </Button>
        </form>
        <Link
          href={incompleteOnly ? "/referrals" : "/referrals?incomplete=1"}
          className={`inline-flex items-center gap-1.5 h-10 px-3 rounded-md border text-sm font-medium transition-colors ${
            incompleteOnly
              ? "bg-amber-500 text-white border-amber-500 hover:bg-amber-600"
              : incompleteCount > 0
              ? "border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100"
              : "border-input text-slate-500 bg-background hover:bg-slate-50"
          }`}
        >
          <AlertCircle className="h-3.5 w-3.5" />
          Incomplete source
          {incompleteCount > 0 && (
            <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold ${incompleteOnly ? "bg-white text-amber-600" : "bg-amber-500 text-white"}`}>
              {incompleteCount}
            </span>
          )}
        </Link>
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
                        href={`/referrals/${r.id}`}
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
          <div className="flex items-center justify-between px-6 py-3 border-t bg-slate-50 text-sm">
            <span className="text-slate-500">
              Page {page} of {totalPages} ({total} results)
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Button size="sm" variant="outline" asChild>
                  <Link
                    href={`/referrals?${new URLSearchParams({
                      ...searchParams,
                      page: String(page - 1),
                    })}`}
                  >
                    Previous
                  </Link>
                </Button>
              )}
              {page < totalPages && (
                <Button size="sm" variant="outline" asChild>
                  <Link
                    href={`/referrals?${new URLSearchParams({
                      ...searchParams,
                      page: String(page + 1),
                    })}`}
                  >
                    Next
                  </Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
