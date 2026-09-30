/**
 * The call log's stats strip — the original tool's Today / Last 7 days /
 * Urgent, 7 days / Awaiting surgeon. Server component.
 *
 * "Today" is the clinic's day (a 9 pm Chicago call counts as today). The two
 * 7-day tiles use the same preset the list's "last 7 days" filter uses, so a
 * tile always equals the view it links to.
 */

import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { zonedParts, zonedWallToUtc } from "@/lib/tz"
import { resolvePreset } from "@/lib/reporting/date-presets"
import { RC_DEFAULT_STATUS, RC_OBJECT_KEY } from "@/lib/referral-calls/constants"

export default async function CallLogStats({ objectDefId }: { objectDefId: string }) {
  const now = new Date()
  const p = zonedParts(now)
  const today = zonedWallToUtc(p.year, p.month, p.day, 0, 0)
  const week = resolvePreset("last_7")!
  const inWeek = { gte: week.start, lte: week.end }
  const base = { objectDefId }

  const [todayCount, weekCount, urgentCount, awaitingCount, views] = await Promise.all([
    (prisma as any).customObjectRecord.count({ where: { ...base, createdAt: { gte: today } } }),
    (prisma as any).customObjectRecord.count({ where: { ...base, createdAt: inWeek } }),
    (prisma as any).customObjectRecord.count({ where: { ...base, createdAt: inWeek, values: { path: ["urgent"], equals: true } } }),
    (prisma as any).customObjectRecord.count({ where: { ...base, values: { path: ["status"], equals: RC_DEFAULT_STATUS } } }),
    (prisma as any).customObjectView.findMany({
      where: { objectKey: RC_OBJECT_KEY, visibility: "EVERYONE", name: { in: ["Awaiting surgeon", "Urgent · last 7 days"] } },
      select: { id: true, name: true },
    }) as Promise<{ id: string; name: string }[]>,
  ])
  const viewHref = (name: string) => {
    const v = views.find((x) => x.name === name)
    return v ? `/objects/${RC_OBJECT_KEY}?viewId=${v.id}` : undefined
  }

  const tiles: { label: string; value: number; href?: string; tone?: "urgent" }[] = [
    { label: "Today", value: todayCount },
    { label: "Last 7 days", value: weekCount },
    { label: "Urgent, 7 days", value: urgentCount, href: viewHref("Urgent · last 7 days"), tone: "urgent" },
    { label: "Awaiting surgeon", value: awaitingCount, href: viewHref("Awaiting surgeon") },
  ]

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {tiles.map((t) => {
        const body = (
          <>
            <span className={`block text-2xl font-semibold tabular-nums ${t.tone === "urgent" && t.value > 0 ? "text-red-600" : "text-zinc-900"}`}>{t.value}</span>
            <span className="block text-xs font-medium text-zinc-500">{t.label}</span>
          </>
        )
        return t.href ? (
          <Link key={t.label} href={t.href} className="rounded-xl border border-zinc-200 bg-white px-4 py-3 transition-colors hover:border-zinc-300 hover:bg-zinc-50">
            {body}
          </Link>
        ) : (
          <div key={t.label} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">{body}</div>
        )
      })}
    </div>
  )
}
