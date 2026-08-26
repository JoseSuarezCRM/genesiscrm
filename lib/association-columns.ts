// Association columns for list table views: pick a field from a directly-associated
// object (one level) and render its value. Reuses the report builder's join
// machinery so any native field or custom property of the associated object is
// available (and stays in sync automatically).
import { reportSchema, reportFieldsFor, reportObjectLabel } from "@/lib/reporting/objects"
import { prisma } from "@/lib/prisma"
import { delegateFor } from "@/lib/automation-records"
import type { ReportField } from "@/lib/reporting/types"

export interface AssociationGroup {
  path: string   // Prisma relation (FK associations) — e.g. "referringPractice"
  label: string  // "Referring practice"
  fields: ReportField[] // fields (key prefixed, carrying column/jsonBag + joinPath OR assocType)
  assocType?: string // set for generic (custom-object) associations
}

// One-level associations of an object with their choosable fields.
// Built-ins: direct FK relations (reportSchema). Custom objects: generic
// ObjectAssociation links (each field reads from row.__assoc[type]).
export async function associationColumnDefs(objectType: string): Promise<AssociationGroup[]> {
  if (!objectType.startsWith("CO:")) {
    const schema = await reportSchema(objectType).catch(() => ({ associations: [] as any[] }))
    return (schema.associations ?? []).map((a: any) => ({ path: a.path, label: a.label, fields: a.fields as ReportField[] }))
  }
  // Custom object: related types come from the data-model association defs.
  const defs = await (prisma as any).objectAssociationDef.findMany({ where: { OR: [{ typeA: objectType }, { typeB: objectType }] } }).catch(() => [])
  const others: string[] = Array.from(new Set(defs.map((d: any) => (d.typeA === objectType ? d.typeB : d.typeA))))
  const groups: AssociationGroup[] = []
  for (const other of others) {
    const fields = (await reportFieldsFor(other).catch(() => [])).filter((f) => !f.stageDuration && f.key !== "__id")
    groups.push({
      path: `assoc:${other}`,
      label: reportObjectLabel(other),
      assocType: other,
      fields: fields.map((f) => ({ ...f, key: `assoc:${other}:${f.key}`, assocType: other })),
    })
  }
  return groups
}

// Load associated records for a page of custom-object rows and attach them as
// `row.__assoc[<type>]` (the first linked record per related type — m2m).
export async function attachAssociatedRecords(objectType: string, rows: any[]): Promise<void> {
  if (!objectType.startsWith("CO:") || !rows.length) return
  const defs = await (prisma as any).objectAssociationDef.findMany({ where: { OR: [{ typeA: objectType }, { typeB: objectType }] } }).catch(() => [])
  if (!defs.length) return
  const ids = rows.map((r) => r.id)
  const idSet = new Set(ids)
  const links = await (prisma as any).objectAssociation.findMany({
    where: { OR: [{ fromType: objectType, fromId: { in: ids } }, { toType: objectType, toId: { in: ids } }] },
  }).catch(() => [])

  const rowOther = new Map<string, Map<string, string>>() // rowId → (otherType → first otherId)
  const wanted = new Map<string, Set<string>>()           // otherType → otherIds to load
  for (const l of links) {
    let rowId: string | null = null, otherType: string | null = null, otherId: string | null = null
    if (l.fromType === objectType && idSet.has(l.fromId)) { rowId = l.fromId; otherType = l.toType; otherId = l.toId }
    else if (l.toType === objectType && idSet.has(l.toId)) { rowId = l.toId; otherType = l.fromType; otherId = l.fromId }
    if (!rowId || !otherType || !otherId) continue
    const m = rowOther.get(rowId) ?? new Map(); if (!m.has(otherType)) m.set(otherType, otherId); rowOther.set(rowId, m)
    const s = wanted.get(otherType) ?? new Set(); s.add(otherId); wanted.set(otherType, s)
  }
  const recsByType = new Map<string, Map<string, any>>()
  for (const [type, idset] of Array.from(wanted.entries())) {
    const model = delegateFor(type); if (!model) continue
    const recs = await model.findMany({ where: { id: { in: Array.from(idset) } } }).catch(() => [])
    recsByType.set(type, new Map(recs.map((r: any) => [r.id, r])))
  }
  for (const r of rows) {
    const m = rowOther.get(r.id); if (!m) continue
    const assoc: Record<string, any> = {}
    for (const [type, oid] of Array.from(m.entries())) { const rec = recsByType.get(type)?.get(oid); if (rec) assoc[type] = rec }
    r.__assoc = assoc
  }
}

// Flatten association groups into ChooserColumn-shaped entries (grouped) for the
// column chooser + a lookup map (field key → field) for rendering.
export function associationColumns(groups: AssociationGroup[]): { columns: { key: string; label: string; group: string }[]; byKey: Record<string, ReportField> } {
  const columns: { key: string; label: string; group: string }[] = []
  const byKey: Record<string, ReportField> = {}
  for (const g of groups) {
    for (const f of g.fields) {
      columns.push({ key: f.key, label: f.label, group: g.label })
      byKey[f.key] = f
    }
  }
  return { columns, byKey }
}

// Read an association field's value from a loaded primary row (row[joinPath].<column>,
// or the customProperties bag). Returns a display string (or "" when empty).
export function readAssocValue(row: any, field: ReportField): string {
  // Generic (custom-object) association: read the attached associated record.
  const base = field.assocType ? row?.__assoc?.[field.assocType] : (field.joinPath ? row?.[field.joinPath] : row)
  if (base == null) return ""
  const raw = field.jsonBag ? base?.[field.jsonBag]?.[field.column] : base?.[field.column]
  if (raw == null || raw === "") return ""
  if (Array.isArray(raw)) return raw.filter(Boolean).join(", ")
  if (field.type === "date") { const d = new Date(raw as any); return isNaN(d.getTime()) ? String(raw) : d.toLocaleDateString() }
  // Map select option value → label when available.
  const opt = field.options?.find((o) => o.value === String(raw))
  return opt ? opt.label : String(raw)
}
