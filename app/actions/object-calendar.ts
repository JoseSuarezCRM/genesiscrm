"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { pipelinesForObject } from "@/lib/stages/core"

// Calendar data for a custom object: the records whose date property falls inside the
// visible range, and nothing else — a 13k-record object must not ship every row to
// render one month.
//
// DATES ARE READ LITERALLY. A date property holds a calendar day ("2026-09-04…"), so we
// compare its first 10 characters as text and never build a Date from it. Round-tripping
// through a Date/UTC is exactly what puts events on the wrong day.

// Events actually returned to the browser, and the raw rows we're willing to scan to
// find them (a US-format month prefix matches that month across every year).
const EVENT_CAP = 3000
const FETCH_CAP = 20000

export interface CalendarEvent {
  id: string
  title: string
  /** "yyyy-mm-dd", taken from the stored value verbatim. */
  day: string
  /** "h:mm AM" when the stored value carries a time, else null. */
  time: string | null
  /** Minutes past midnight, for ordering and for the week/day grids. */
  minutes: number | null
  stageId: string | null
  stageName: string | null
  stageColor: string | null
  ownerName: string | null
  /** Raw value of the colour-by property, when colouring by a property. */
  colorValue: string | null
}

export interface CalendarData {
  events: CalendarEvent[]
  truncated: boolean
  error?: string
}

/**
 * Value prefixes to narrow on in the database for a [from, to] day range.
 *
 * Date properties are NOT stored in one format: values written by the app are ISO
 * ("2026-08-24T00:00:00.000Z"), but imported ones are US calendar strings
 * ("12/08/2026") — on the Appointments object that's 11,089 of 11,429 rows. Matching
 * only ISO would quietly hide 97% of the records, so we narrow on both and then filter
 * exactly in JS. A US string can only be narrowed by its month ("8/" / "08/"), which
 * pulls that month across every year — a few hundred rows, trimmed straight after.
 */
function valuePrefixes(from: string, to: string): string[] {
  const iso: string[] = []
  const us = new Set<string>()
  let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7))
  const endY = Number(to.slice(0, 4)), endM = Number(to.slice(5, 7))
  while (y < endY || (y === endY && m <= endM)) {
    iso.push(`${y}-${String(m).padStart(2, "0")}`)
    us.add(`${m}/`); us.add(`${String(m).padStart(2, "0")}/`)
    us.add(`${m}-`); us.add(`${String(m).padStart(2, "0")}-`)
    m += 1
    if (m > 12) { m = 1; y += 1 }
    if (iso.length > 24) break // guard against a nonsense range
  }
  return [...iso, ...Array.from(us)]
}

/**
 * A stored date value → "yyyy-mm-dd", read from its literal parts.
 * Handles ISO ("2026-09-04T…", "2026-09-04") and US ("12/8/2026", "12-08-2026").
 */
function dayOf(v: unknown): string {
  if (v == null) return ""
  const s = String(v).trim()
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const us = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`
  return ""
}

/**
 * Clock time from a stored timestamp, read from the literal string so it isn't shifted
 * by the viewer's timezone. A DATE property never shows a time — its stored value only
 * carries a midnight/midday marker, not a real one.
 */
function timeOf(v: unknown, propType: string): { time: string; minutes: number } | null {
  if (propType !== "DATE_TIME") return null
  const m = String(v ?? "").match(/^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/)
  if (!m) return null
  const h = Number(m[1]), min = m[2]
  const ampm = h < 12 ? "AM" : "PM"
  const h12 = h % 12 === 0 ? 12 : h % 12
  return { time: `${h12}:${min} ${ampm}`, minutes: h * 60 + Number(min) }
}

export async function getObjectCalendarData(objectKey: string, opts: {
  datePropertyId: string
  titlePropertyId?: string | null
  colorByPropertyId?: string | null
  pipelineId?: string | null
  /** Inclusive "yyyy-mm-dd" bounds of the visible grid. */
  from: string
  to: string
}): Promise<CalendarData> {
  const session = await auth()
  if (!session?.user) return { events: [], truncated: false }

  const def = await (prisma as any).customObjectDef.findUnique({ where: { key: objectKey }, select: { id: true, properties: true } })
  if (!def) return { events: [], truncated: false, error: "Object not found." }
  const props = ((def.properties as any[]) ?? [])
  // Only ever query a property this object actually has.
  const dateProp = props.find((p) => p.id === opts.datePropertyId)
  if (!dateProp) {
    return { events: [], truncated: false, error: "Pick a date property for this calendar." }
  }
  const primary = props.find((p) => p.primary) ?? props[0]
  const titleId = opts.titlePropertyId && props.some((p) => p.id === opts.titlePropertyId)
    ? opts.titlePropertyId : primary?.id ?? null
  const colorId = opts.colorByPropertyId && props.some((p) => p.id === opts.colorByPropertyId)
    ? opts.colorByPropertyId : null

  // Narrow in the database by month prefix (a supported JSON string filter), then
  // trim to the exact range in JS. Cheap, and no raw SQL.
  const prefixes = valuePrefixes(opts.from, opts.to)
  const where: any = {
    objectDefId: def.id,
    OR: prefixes.map((p) => ({ values: { path: [opts.datePropertyId], string_starts_with: p } })),
  }
  if (opts.pipelineId) where.pipelineId = opts.pipelineId

  const rows = await (prisma as any).customObjectRecord.findMany({
    where,
    select: {
      id: true, recordNumber: true, values: true, stageId: true,
      owner: { select: { name: true, email: true } },
    },
    take: FETCH_CAP,
  }).catch(() => [])

  // Stage names/colours for the events (only when this object has pipelines).
  const stageMeta = new Map<string, { name: string; color: string | null }>()
  const pipelines = await pipelinesForObject(`CO:${objectKey}`).catch(() => [])
  for (const p of pipelines) for (const s of p.stages) stageMeta.set(s.id, { name: s.name, color: s.color })

  const events: CalendarEvent[] = []
  for (const r of rows) {
    const raw = (r.values ?? {})[opts.datePropertyId]
    const day = dayOf(raw)
    if (!day || day < opts.from || day > opts.to) continue
    const stage = r.stageId ? stageMeta.get(r.stageId) : undefined
    const titleRaw = titleId ? (r.values ?? {})[titleId] : null
    const t = timeOf(raw, dateProp.type)
    events.push({
      id: r.id,
      title: titleRaw != null && titleRaw !== "" ? String(titleRaw) : `#${r.recordNumber ?? ""}`,
      day,
      time: t?.time ?? null,
      minutes: t?.minutes ?? null,
      stageId: r.stageId ?? null,
      stageName: stage?.name ?? null,
      stageColor: stage?.color ?? null,
      ownerName: r.owner?.name || r.owner?.email || null,
      colorValue: colorId ? (((r.values ?? {})[colorId] ?? null) as any) : null,
    })
  }
  // Earliest time first within a day, matching how a day column reads.
  events.sort((a, b) => a.day.localeCompare(b.day) || (a.minutes ?? -1) - (b.minutes ?? -1))
  // Cap what's SENT, after trimming to the range — capping the raw rows would drop
  // in-range events just because a US-format month pulled in other years first.
  const truncated = events.length > EVENT_CAP
  return { events: truncated ? events.slice(0, EVENT_CAP) : events, truncated }
}
