// ─── Segments: resolving membership ──────────────────────────────────────────
// A segment is a named set of records of one object. Two kinds:
//
//   ACTIVE  — stores a FilterState and is re-evaluated on read, so it always
//             reflects the data now.
//   STATIC  — its membership was materialised into SegmentMember rows and does
//             not change afterwards.
//
// Everything here resolves to record ids through lib/object-query, which is the
// single place a filtered set is built — so a segment's size can never be
// computed over a different set than the records it lists.

import { prisma } from "@/lib/prisma"
import type { FilterState } from "@/lib/filters"
import { fieldsFor } from "@/lib/object-fields-server"
import { toFilterFields, describeFilter, type ObjectFieldDef } from "@/lib/object-fields"
import { queryObjectIds, type ObjectQueryResult } from "@/lib/object-query"
import { delegateFor, isCustomObject } from "@/lib/automation-records"

export type SegmentKind = "ACTIVE" | "STATIC"
export type SegmentSource = "FILTER" | "IMPORT" | "MANUAL"

/** How long a cached ACTIVE size is shown before it's flagged as stale. */
export const SIZE_TTL_MS = 15 * 60 * 1000

export interface SegmentRow {
  id: string
  name: string
  description: string | null
  objectType: string
  kind: SegmentKind
  source: SegmentSource
  filter: FilterState | null
  sourceConfig: { importRunIds?: string[] } | null
  size: number | null
  sizeAt: Date | null
  sizeExact: boolean
  lastBuiltAt: Date | null
  userId: string
  visibility: string
  teamId: string | null
  sharedUserIds: string[]
  createdAt: Date
  updatedAt: Date
}

/**
 * The record ids a segment currently contains.
 *
 * STATIC reads its frozen membership; ACTIVE re-evaluates the filter. An import
 * segment is ACTIVE by default because provenance is immutable — undoing the
 * import empties the segment with no reconciliation code.
 */
export async function segmentRecordIds(
  segment: Pick<SegmentRow, "id" | "objectType" | "kind" | "filter" | "source" | "sourceConfig">,
  defs?: ObjectFieldDef[],
): Promise<ObjectQueryResult> {
  if (segment.kind === "STATIC") {
    const rows = await (prisma as any).segmentMember.findMany({
      where: { segmentId: segment.id }, select: { recordId: true },
    })
    const ids = rows.map((r: any) => r.recordId)
    // Frozen membership can outlive the records themselves (a deleted record, an
    // undone import), so it's intersected with what still exists rather than
    // reported as a count of rows in a table.
    const alive = await liveIds(segment.objectType, ids)
    return { ids: alive, total: alive.length, exact: true, warnings: [] }
  }

  if (segment.source === "IMPORT") {
    const ids = await importRunRecordIds(segment.sourceConfig?.importRunIds ?? [], segment.objectType)
    return { ids, total: ids.length, exact: true, warnings: [] }
  }

  return queryObjectIds(segment.objectType, segment.filter, { defs })
}

/** Which of these ids still exist. Chunked — an id list can be tens of thousands. */
export async function liveIds(objectType: string, ids: string[]): Promise<string[]> {
  if (!ids.length) return []
  const model = delegateFor(objectType)
  if (!model) return []
  let scope: Record<string, unknown> = {}
  if (isCustomObject(objectType)) {
    const def = await (prisma as any).customObjectDef
      .findUnique({ where: { key: objectType.slice(3) }, select: { id: true } }).catch(() => null)
    if (!def) return []
    scope = { objectDefId: def.id }
  }
  const out: string[] = []
  for (let i = 0; i < ids.length; i += 5000) {
    const rows = await model.findMany({
      where: { ...scope, id: { in: ids.slice(i, i + 5000) } }, select: { id: true },
    })
    for (const r of rows) out.push(r.id)
  }
  return out
}

/**
 * Records created OR updated by a set of import runs.
 *
 * Both kinds, per the product decision — the question is "what did this file do
 * to my data", not just what it added. Only `active` runs count: undoing a run
 * deletes its records but deliberately KEEPS the change rows, so an undone run's
 * ids point at records that no longer exist (measured: 54% of sampled change
 * rows were already dangling). The intersect with live records handles the rest.
 */
export async function importRunRecordIds(runIds: string[], objectType: string): Promise<string[]> {
  if (!runIds.length) return []
  const runs = await (prisma as any).importRun.findMany({
    where: { id: { in: runIds }, status: "active" }, select: { id: true },
  })
  if (!runs.length) return []
  const changes = await (prisma as any).importRunChange.findMany({
    where: { runId: { in: runs.map((r: any) => r.id) } }, select: { recordId: true },
  })
  const candidates = Array.from(new Set<string>(changes.map((c: any) => String(c.recordId))))
  return liveIds(objectType, candidates)
}

/** A one-line description of what a segment selects, for the list and header. */
export async function segmentSummary(segment: SegmentRow, defs?: ObjectFieldDef[]): Promise<string> {
  if (segment.source === "IMPORT") {
    const n = segment.sourceConfig?.importRunIds?.length ?? 0
    return n === 1 ? "Records from 1 import" : `Records from ${n} imports`
  }
  if (segment.kind === "STATIC") return "A fixed list of records"
  const d = defs ?? (await fieldsFor(segment.objectType))
  return describeFilter(segment.filter, d)
}

/** Is a cached ACTIVE size old enough to show as stale? */
export function sizeIsStale(sizeAt: Date | null | undefined): boolean {
  if (!sizeAt) return true
  return Date.now() - new Date(sizeAt).getTime() > SIZE_TTL_MS
}

export { toFilterFields }
