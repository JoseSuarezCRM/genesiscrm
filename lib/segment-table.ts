// The columns a segment's record list can show, and the rows behind them.
//
// Built on the report layer rather than beside it: reportFieldsFor already lists
// every native field, custom property and owner name of any object (custom
// objects included), and readValue reads any of them off a row. This adds what a
// list needs that a report doesn't — a few name joins, the custom-object owner,
// labels instead of stored option values, and a sensible default set.

import { prisma } from "@/lib/prisma"
import { delegateFor, isCustomObject, recordLabel } from "@/lib/automation-records"
import { reportFieldsFor, REPORT_OBJECTS } from "@/lib/reporting/objects"
import { readValue } from "@/lib/reporting/query"
import type { ReportField } from "@/lib/reporting/types"
import { personPartIds, recordName } from "@/lib/record-name"
import { zonedParts } from "@/lib/tz"

export interface SegmentColumn extends ReportField {
  group?: string
}

export interface SegmentTableRow {
  id: string
  label: string
  cells: string[]
}

export const MAX_SEGMENT_COLUMNS = 30
const DEFAULT_COUNT = 4

// Associated records that carry a `name` — shown as "Practice", "Referring provider", …
const NAMED_TARGETS = new Set(["PRACTICE", "PROVIDER", "LOCATION"])

/** Every column a segment of `objectType` can show, in chooser order. */
export async function segmentColumnCatalog(objectType: string): Promise<SegmentColumn[]> {
  // Time-in-stage fields come from the StageTransition log, not a column on the row.
  const base = (await reportFieldsFor(objectType)).filter((f) => !f.stageDuration)
  const userPaths = new Set((REPORT_OBJECTS[objectType]?.associations ?? []).filter((a) => a.target === "USER").map((a) => a.path))
  const out: SegmentColumn[] = base.map((f) => ({
    ...f,
    group: f.jsonBag === "customProperties" ? "Custom properties" : undefined,
  }))

  if (isCustomObject(objectType)) {
    // The report catalog has no owner for custom objects; every list shows one.
    const def = await (prisma as any).customObjectDef
      .findUnique({ where: { key: objectType.slice(3) }, select: { singular: true, ownerLabel: true } })
      .catch(() => null)
    out.push({
      key: "owner.name", label: def?.ownerLabel || `${def?.singular ?? "Record"} Owner`,
      type: "text", source: objectType, column: "name", joinPath: "owner",
    })
  }
  for (const a of REPORT_OBJECTS[objectType]?.associations ?? []) {
    if (!NAMED_TARGETS.has(a.target) || userPaths.has(a.path)) continue
    out.push({ key: `${a.path}.name`, label: a.label, type: "text", source: objectType, column: "name", joinPath: a.path, group: "Associations" })
  }
  return out
}

/**
 * The fields that already make up a row's name (what recordLabel reads), so the
 * default columns don't repeat it.
 */
async function nameKeys(objectType: string): Promise<Set<string>> {
  if (isCustomObject(objectType)) {
    const def = await (prisma as any).customObjectDef
      .findUnique({ where: { key: objectType.slice(3) }, select: { properties: true } })
      .catch(() => null)
    const props = ((def?.properties as any[]) ?? [])
    const primary = props.find((p) => p.primary) ?? props[0]
    return new Set([...personPartIds(props), ...(primary ? [primary.id] : [])])
  }
  // recordLabel reads patientName ?? name ?? title — only the one each object has.
  if (objectType === "REFERRAL") return new Set(["patientFirstName", "patientLastName"])
  if (objectType === "SURGERY") return new Set(["patientName"])
  if (objectType === "TASK") return new Set(["title"])
  return new Set(["name"])
}

/** The columns shown until someone picks some: the first few that aren't the name, id or created date. */
export async function defaultSegmentColumns(objectType: string, catalog: SegmentColumn[]): Promise<SegmentColumn[]> {
  const skip = await nameKeys(objectType)
  return catalog
    .filter((f) => f.key !== "__id" && !skip.has(f.key) && !/^(createdAt|creationDate)$/.test(f.column) && !f.joinPath)
    .slice(0, DEFAULT_COUNT)
}

/**
 * A segment's chosen columns, or the default set when it has never been given
 * any. A saved empty list is a choice too — just the name — so "Remove all
 * columns" in the chooser does what it says. Saved keys whose property has since
 * been deleted are dropped.
 */
export async function resolveSegmentColumns(objectType: string, saved: unknown, catalog: SegmentColumn[]): Promise<SegmentColumn[]> {
  if (!Array.isArray(saved)) return defaultSegmentColumns(objectType, catalog)
  const byKey = new Map(catalog.map((f) => [f.key, f]))
  return saved
    .filter((k): k is string => typeof k === "string")
    .map((k) => byKey.get(k))
    .filter((f): f is SegmentColumn => !!f)
}

/**
 * The rows for `ids`, in that order, with their name and display cells. One
 * query, joining only what the chosen columns read. A record that no longer
 * exists keeps its place with its id as the name.
 */
export async function loadSegmentRows(objectType: string, ids: string[], columns: SegmentColumn[]): Promise<SegmentTableRow[]> {
  const model = delegateFor(objectType)
  if (!model || !ids.length) return []

  const include: Record<string, { select: Record<string, true> }> = {}
  for (const f of columns) {
    if (!f.joinPath) continue
    include[f.joinPath] ??= { select: {} }
    include[f.joinPath].select[f.column] = true
    // A user without a name shows their email instead.
    if (f.column === "name") include[f.joinPath].select.email = true
  }
  // Only users carry `email`; other joined objects would reject the select.
  const userPaths = new Set((REPORT_OBJECTS[objectType]?.associations ?? []).filter((a) => a.target === "USER").map((a) => a.path))
  if (isCustomObject(objectType)) userPaths.add("owner")
  for (const [path, inc] of Object.entries(include)) if (!userPaths.has(path)) delete inc.select.email

  let where: Record<string, unknown> = { id: { in: ids } }
  let coDef: { id: string; singular: string; properties: any[] } | null = null
  if (isCustomObject(objectType)) {
    coDef = await (prisma as any).customObjectDef
      .findUnique({ where: { key: objectType.slice(3) }, select: { id: true, singular: true, properties: true } })
      .catch(() => null)
    if (!coDef) return []
    where = { ...where, objectDefId: coDef.id }
  }

  const rows: any[] = await model.findMany({ where, ...(Object.keys(include).length ? { include } : {}) })
  for (const r of rows) {
    userPaths.forEach((path) => {
      const u = r[path]
      if (u && u.name == null && u.email) u.name = u.email
    })
  }
  const byId = new Map(rows.map((r) => [r.id, r]))

  return Promise.all(ids.map(async (id) => {
    const r = byId.get(id)
    if (!r) return { id, label: id, cells: columns.map(() => "") }
    const label = coDef
      ? recordName(coDef.properties ?? [], (r.values as Record<string, unknown>) ?? {}, `${coDef.singular} #${r.recordNumber ?? ""}`)
      : await recordLabel(objectType, id, r)
    return { id, label, cells: columns.map((f) => displayCell(readValue(r, f), f)) }
  }))
}

const optionLabel = (f: ReportField, v: unknown) => f.options?.find((o) => o.value === String(v))?.label ?? String(v)

function displayDate(v: unknown): string {
  const d = new Date(v as string)
  if (Number.isNaN(d.getTime())) return String(v)
  // A calendar day is stored at noon (or, in older rows, midnight) UTC; read it
  // in UTC so it never shifts. Anything else is an instant — show its clinic day.
  const iso = d.toISOString()
  if (iso.endsWith("T12:00:00.000Z") || iso.endsWith("T00:00:00.000Z")) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
  }
  const p = zonedParts(d) // month is 0-based
  return new Date(Date.UTC(p.year, p.month, p.day, 12))
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
}

/** One cell as text: option labels rather than stored values, Yes/No, readable dates. */
export function displayCell(v: unknown, f: ReportField): string {
  if (v == null || v === "") return ""
  if (Array.isArray(v)) return v.filter((x) => x != null && x !== "").map((x) => optionLabel(f, x)).join(", ")
  if (f.key === "__id" && typeof v === "number") return `#${v}`
  if (f.type === "boolean") return v === true || v === "true" ? "Yes" : v === false || v === "false" ? "No" : String(v)
  if (f.type === "date") return displayDate(v)
  if (f.type === "number") {
    const n = Number(v)
    if (Number.isNaN(n)) return String(v)
    return f.numberFormat === "currency"
      ? n.toLocaleString("en-US", { style: "currency", currency: "USD" })
      : n.toLocaleString("en-US")
  }
  if (f.type === "select") return optionLabel(f, v)
  return String(v)
}
