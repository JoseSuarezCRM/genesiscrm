// Association columns for list table views: pick a field from a directly-associated
// object (one level) and render its value. Reuses the report builder's join
// machinery so any native field or custom property of the associated object is
// available (and stays in sync automatically).
import { reportSchema } from "@/lib/reporting/objects"
import type { ReportField } from "@/lib/reporting/types"

export interface AssociationGroup {
  path: string   // Prisma relation on the primary row (e.g. "referringPractice")
  label: string  // "Referring practice"
  fields: ReportField[] // joined fields (key prefixed with path, carrying column/jsonBag/joinPath)
}

// Direct (one-level) associations of a built-in object with their choosable fields.
// Built-ins only for now — custom objects (ObjectAssociationDef) come later.
export async function associationColumnDefs(objectType: string): Promise<AssociationGroup[]> {
  if (objectType.startsWith("CO:")) return []
  const schema = await reportSchema(objectType).catch(() => ({ associations: [] as any[] }))
  return (schema.associations ?? []).map((a: any) => ({ path: a.path, label: a.label, fields: a.fields as ReportField[] }))
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
  const base = field.joinPath ? row?.[field.joinPath] : row
  if (base == null) return ""
  const raw = field.jsonBag ? base?.[field.jsonBag]?.[field.column] : base?.[field.column]
  if (raw == null || raw === "") return ""
  if (Array.isArray(raw)) return raw.filter(Boolean).join(", ")
  if (field.type === "date") { const d = new Date(raw as any); return isNaN(d.getTime()) ? String(raw) : d.toLocaleDateString() }
  // Map select option value → label when available.
  const opt = field.options?.find((o) => o.value === String(raw))
  return opt ? opt.label : String(raw)
}
