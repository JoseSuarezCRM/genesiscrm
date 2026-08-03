// Server-side loader for a record's property cards — the same shape Referrals
// uses (saved card layouts + a property catalog), so every object gets
// configurable cards with inline click-to-edit values, in the left AND middle
// columns.
//
// Record Owner + the audit fields (created by/at, last updated by/at, Record ID)
// are part of the catalog too, so they can be placed on any card, moved, or
// hidden — they are not a separate hardcoded card.

import { prisma } from "@/lib/prisma"
import { getCardLayouts } from "@/app/actions/card-layouts"
import { RECORD_FIELDS, defaultCardFor, SURGERY_CLINICAL_FIELDS, type RecordFieldDef, type RecordFieldType } from "@/lib/record-field-catalog"

const CP_TYPE: Record<string, RecordFieldType> = {
  TEXT: "text", LONG_TEXT: "long_text", NUMBER: "number", EMAIL: "email",
  PHONE: "phone", DATE: "date", DATE_TIME: "datetime", CHECKBOX: "select", DROPDOWN: "select",
  MULTI_SELECT: "select", URL: "text",
}

// The owner + audit fields every ownable object shares. `__` keys never collide
// with a real column or a custom-property ("cp_") key.
function metaCatalog(ownerLabel: string, withRecordId: boolean): RecordFieldDef[] {
  return [
    { key: "__owner", label: ownerLabel, type: "user" },
    ...(withRecordId ? [{ key: "__recordId", label: "Record ID", type: "text" as RecordFieldType, readOnly: true }] : []),
    { key: "__createdBy", label: "Created by", type: "text", readOnly: true },
    { key: "__createdAt", label: "Created", type: "datetime", readOnly: true },
    { key: "__updatedBy", label: "Last updated by", type: "text", readOnly: true },
    { key: "__updatedAt", label: "Last updated", type: "datetime", readOnly: true },
  ]
}

const RECORD_DETAILS_FIELDS = ["__owner", "__createdBy", "__createdAt", "__updatedBy", "__updatedAt"]

// Custom objects: properties come from the object definition, values from the
// record's JSON bag, cards from RecordCard — identical shape to a built-in.
async function loadCustomObjectCards(objectType: string, record: Record<string, any>, ownerLabel: string) {
  const key = objectType.slice(3)
  const [def, rows] = await Promise.all([
    (prisma as any).customObjectDef.findUnique({ where: { key } }),
    (prisma as any).recordCard.findMany({ where: { objectType }, orderBy: { order: "asc" } }),
  ])
  const props: any[] = (def?.properties as any[]) ?? []

  const catalog: RecordFieldDef[] = [
    ...props.map((p) => ({ key: p.id, label: p.name, type: CP_TYPE[p.type] ?? "text", options: p.options ?? [], optionLabels: (p as any).optionLabels ?? undefined, visibilityRule: (p as any).visibilityRule ?? undefined, numberFormat: (p as any).numberFormat ?? undefined })),
    ...metaCatalog(ownerLabel || `${def?.singular ?? "Record"} Owner`, true),
  ]

  const values: Record<string, any> = { ...((record.values as Record<string, any>) ?? {}) }
  values.__owner = record.ownerId ?? null
  values.__recordId = record.recordNumber != null ? `#${record.recordNumber}` : "—"
  values.__createdBy = record.createdByName ?? null
  values.__createdAt = record.createdAt ?? null
  values.__updatedBy = record.updatedByName ?? null
  values.__updatedAt = record.updatedAt ?? null

  const toCards = (rs: any[]) => rs.map((r) => ({ cardName: r.cardName, title: r.title, fields: r.fields, columns: r.columns ?? 1, kind: r.kind ?? "PROPERTIES", config: r.config ?? null }))
  const left = rows.filter((r: any) => r.section === "LEFT")
  const middle = rows.filter((r: any) => r.section === "MIDDLE")

  return {
    cards: left.length ? toCards(left) : [
      { cardName: "info", title: `${def?.singular ?? "Record"} Information`, fields: props.map((p) => p.id) },
      { cardName: "record-details", title: "Record details", fields: ["__owner", "__recordId", "__createdBy", "__createdAt", "__updatedBy", "__updatedAt"] },
    ],
    middleCards: toCards(middle),
    catalog,
    values,
  }
}

export async function loadPropertyCards(entityType: string, record: Record<string, any>, ownerLabel?: string) {
  if (entityType.startsWith("CO:")) return loadCustomObjectCards(entityType, record, ownerLabel ?? "")

  const [leftLayouts, middleLayouts, customProps] = await Promise.all([
    getCardLayouts(entityType as any, "LEFT"),
    getCardLayouts(entityType as any, "MIDDLE"),
    prisma.customProperty.findMany({ where: { entityType: entityType as any }, orderBy: { createdAt: "asc" } }),
  ])

  // Referrals keep their own left-column component, so they don't get the shared
  // owner/audit meta (they have no owner). Everything else does.
  const hasMeta = entityType !== "REFERRAL" && !!ownerLabel

  // Referral pipeline: a dynamic select whose options come from the Pipeline table.
  let pipelineField: RecordFieldDef["options"] | null = null
  let pipelineLabels: Record<string, string> = {}
  if (entityType === "REFERRAL") {
    const pipelines = await prisma.pipeline.findMany({ where: { isActive: true }, orderBy: [{ order: "asc" }, { createdAt: "asc" }], select: { id: true, name: true } })
    pipelineField = pipelines.map((p) => p.id)
    pipelineLabels = Object.fromEntries(pipelines.map((p) => [p.id, p.name]))
  }

  const catalog: RecordFieldDef[] = [
    ...(RECORD_FIELDS[entityType] ?? []).map((f) =>
      f.key === "pipelineId" && pipelineField ? { ...f, options: pipelineField, optionLabels: pipelineLabels } : f
    ),
    ...customProps.map((c) => ({ key: `cp_${c.id}`, label: c.name, type: CP_TYPE[c.type] ?? "text", options: c.options, default: (c as any).defaultValue ?? undefined, conditional: (c as any).conditional ?? undefined, optionLabels: (c as any).optionLabels ?? undefined, visibilityRule: (c as any).visibilityRule ?? undefined, numberFormat: (c as any).numberFormat ?? undefined })),
    ...(hasMeta ? metaCatalog(ownerLabel!, false) : []),
  ]

  const bag = (record.customProperties as Record<string, any>) ?? {}
  const values: Record<string, any> = { ...record }
  for (const c of customProps) values[`cp_${c.id}`] = bag[c.id]

  // Referrals: pipelineId edits via the select (optionLabels render its name);
  // assignedTo is a read-only display string.
  if (entityType === "REFERRAL") {
    values.pipelineId = (record as any).pipelineId ?? ""
    values.assignedTo = (record.assignedTo as any)?.name ?? (record.assignedTo as any)?.email ?? null
  }

  if (hasMeta) {
    values.__owner = record.ownerId ?? null
    values.__createdBy = record.createdBy?.name ?? record.createdBy?.email ?? null
    values.__createdAt = record.createdAt ?? null
    values.__updatedBy = record.updatedBy?.name ?? record.updatedBy?.email ?? null
    values.__updatedAt = record.updatedAt ?? null
  }

  const toCards = (rows: any[]) =>
    rows.map((l) => ({ cardName: l.cardName, title: l.title, fields: l.fields, columns: l.columns ?? 1, kind: l.kind ?? "PROPERTIES", config: l.config ?? null }))

  // Defaults (used until someone customizes): an info card with the base
  // properties, plus a Record details card holding owner + audit.
  const defaultLeft = [
    defaultCardFor(entityType),
    ...(hasMeta ? [{ cardName: "record-details", title: "Record details", fields: RECORD_DETAILS_FIELDS }] : []),
  ]

  const cards = leftLayouts.length ? toCards(leftLayouts as any) : defaultLeft

  // Surgery's default middle: the editable Clinical card plus the functional cards
  // (Status / Procedure / Call Attempts / Documents), all reorderable together.
  const surgeryMiddle = [
    { cardName: "status", title: "Update Status", fields: [], kind: "SURGERY_STATUS" },
    { cardName: "clinical", title: "Clinical & Scheduling", fields: SURGERY_CLINICAL_FIELDS, columns: 2 },
    { cardName: "procedure", title: "Procedure", fields: [], kind: "SURGERY_PROCEDURE" },
    { cardName: "calls", title: "Call Attempts", fields: [], kind: "SURGERY_CALLS" },
    { cardName: "documents", title: "Documents", fields: [], kind: "SURGERY_DOCUMENTS" },
  ]

  let middleCards: any[]
  if (entityType === "SURGERY") {
    // Functional cards can't be deleted, so always ensure they're present — a case
    // customized before they existed would otherwise be missing them.
    const persisted = middleLayouts.length ? toCards(middleLayouts as any) : []
    const present = new Set(persisted.map((c: any) => c.cardName))
    const missing = surgeryMiddle.filter((c) => !present.has(c.cardName))
    middleCards = persisted.length ? [...persisted, ...missing] : surgeryMiddle
  } else {
    middleCards = middleLayouts.length ? toCards(middleLayouts as any) : []
  }

  return { cards, middleCards, catalog, values }
}
