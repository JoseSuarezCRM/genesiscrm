// The column catalog for a custom object, shared by the view shell (column chooser,
// sort menu, quick filters) and the table body — so they can't drift apart.

import { associationColumns, type AssociationGroup } from "@/lib/association-columns"
import type { ReportField } from "@/lib/reporting/types"
import { isPersonObject, personPartIds } from "@/lib/record-name"
import { customPropertyFilterFields, type FilterField } from "@/lib/filters"

export interface ObjectProperty {
  id: string
  name: string
  type: string
  primary?: boolean
  options?: string[]
  [k: string]: any
}

export interface ObjectColumn { key: string; label: string; group?: string }

export interface ObjectColumnCatalog {
  primary: ObjectProperty | undefined
  isPerson: boolean
  nameParts: string[]
  /** Properties that get their own column (primary + name parts are folded into Name). */
  otherProps: ObjectProperty[]
  /** Record ID + Name + properties + owner + created. */
  baseCols: ObjectColumn[]
  /** baseCols plus the one-level association columns. */
  allCols: ObjectColumn[]
  assocByKey: Record<string, ReportField>
}

export function buildObjectColumns(
  properties: ObjectProperty[],
  ownerLabel: string,
  associations: AssociationGroup[] = [],
): ObjectColumnCatalog {
  const primary = properties.find((p) => p.primary) ?? properties[0]
  const isPerson = isPersonObject(properties)
  const nameHeader = isPerson ? "Name" : (primary?.name ?? "Name")
  // The Name column already shows first+last for person objects — don't repeat them.
  const nameParts = personPartIds(properties)
  const otherProps = properties.filter((p) => p.id !== primary?.id && !nameParts.includes(p.id))

  const baseCols: ObjectColumn[] = [
    { key: "__id", label: "Record ID" },
    { key: "__name", label: nameHeader },
    ...otherProps.map((p) => ({ key: p.id, label: p.name })),
    { key: "__owner", label: ownerLabel },
    { key: "__created", label: "Created" },
  ]
  const { columns: assocCols, byKey: assocByKey } = associationColumns(associations)
  return { primary, isPerson, nameParts, otherProps, baseCols, allCols: [...baseCols, ...assocCols], assocByKey }
}

/** Filter fields for an object — the same list feeds FilterBuilder and the quick-filter chips. */
export function buildFilterFields(
  properties: ObjectProperty[],
  ownerLabel: string,
  users: { id: string; label: string }[],
): FilterField[] {
  return [
    { key: "__recordNumber", label: "Record ID", type: "number", getValue: (r: any) => r.recordNumber },
    { key: "__owner", label: ownerLabel, type: "select", options: users.map((u) => ({ value: u.id, label: u.label })), getValue: (r: any) => r.ownerId },
    { key: "__created", label: "Created", type: "date", getValue: (r: any) => r.createdAt },
    ...customPropertyFilterFields(
      properties.map((p) => ({ id: p.id, name: p.name, type: p.type, options: p.options })),
      "values",
    ),
  ]
}

/** Property ids whose values can carry a number — the candidates for a board metric. */
export function numericProperties(properties: ObjectProperty[]): ObjectProperty[] {
  return properties.filter((p) => p.type === "NUMBER")
}

/** DATE / DATE_TIME properties — the candidates for a calendar's date field. */
export function dateProperties(properties: ObjectProperty[]): ObjectProperty[] {
  return properties.filter((p) => p.type === "DATE" || p.type === "DATE_TIME")
}
