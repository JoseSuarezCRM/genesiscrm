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
  /** Pipeline + Stage columns only exist once the object has a pipeline. */
  hasPipelines = false,
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
    ...(hasPipelines ? [{ key: "__stage", label: "Stage" }, { key: "__pipeline", label: "Pipeline" }] : []),
    { key: "__owner", label: ownerLabel },
    { key: "__created", label: "Created" },
  ]
  const { columns: assocCols, byKey: assocByKey } = associationColumns(associations)
  return { primary, isPerson, nameParts, otherProps, baseCols, allCols: [...baseCols, ...assocCols], assocByKey }
}

/** Property ids whose values can carry a number — the candidates for a board metric. */
export function numericProperties(properties: ObjectProperty[]): ObjectProperty[] {
  return properties.filter((p) => p.type === "NUMBER")
}

/** DATE / DATE_TIME properties — the candidates for a calendar's date field. */
export function dateProperties(properties: ObjectProperty[]): ObjectProperty[] {
  return properties.filter((p) => p.type === "DATE" || p.type === "DATE_TIME")
}
