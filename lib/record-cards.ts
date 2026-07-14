// Server-side loader for a record's left-column property cards — the same shape
// Referrals uses (saved CardLayouts + a property catalog), so every object gets
// configurable cards with inline click-to-edit values.

import { prisma } from "@/lib/prisma"
import { getCardLayouts } from "@/app/actions/card-layouts"
import { RECORD_FIELDS, defaultCardFor, type RecordFieldDef, type RecordFieldType } from "@/lib/record-field-catalog"

const CP_TYPE: Record<string, RecordFieldType> = {
  TEXT: "text", LONG_TEXT: "long_text", NUMBER: "number", EMAIL: "email",
  PHONE: "phone", DATE: "date", CHECKBOX: "select", DROPDOWN: "select",
  MULTI_SELECT: "select", URL: "text",
}

// Custom objects: properties come from the object definition, values from the
// record's JSON bag, and cards from RecordCard — but the shape returned here is
// identical to a built-in object's, so the page renders the same components.
async function loadCustomObjectCards(objectType: string, record: Record<string, any>) {
  const key = objectType.slice(3)
  const [def, rows] = await Promise.all([
    (prisma as any).customObjectDef.findUnique({ where: { key } }),
    (prisma as any).recordCard.findMany({ where: { objectType }, orderBy: { order: "asc" } }),
  ])
  const props: any[] = (def?.properties as any[]) ?? []

  const catalog: RecordFieldDef[] = props.map((p) => ({
    key: p.id,
    label: p.name,
    type: CP_TYPE[p.type] ?? "text",
    options: p.options ?? [],
  }))

  const values: Record<string, any> = (record.values as Record<string, any>) ?? {}
  const toCards = (rs: any[]) => rs.map((r) => ({ cardName: r.cardName, title: r.title, fields: r.fields }))
  const left = rows.filter((r: any) => r.section === "LEFT")
  const middle = rows.filter((r: any) => r.section === "MIDDLE")

  return {
    cards: left.length
      ? toCards(left)
      : [{ cardName: "info", title: `${def?.singular ?? "Record"} Information`, fields: props.map((p) => p.id) }],
    middleCards: toCards(middle),
    catalog,
    values,
  }
}

export async function loadPropertyCards(entityType: string, record: Record<string, any>) {
  if (entityType.startsWith("CO:")) return loadCustomObjectCards(entityType, record)

  const [leftLayouts, middleLayouts, customProps] = await Promise.all([
    getCardLayouts(entityType as any, "LEFT"),
    getCardLayouts(entityType as any, "MIDDLE"),
    prisma.customProperty.findMany({ where: { entityType: entityType as any }, orderBy: { createdAt: "asc" } }),
  ])

  const catalog: RecordFieldDef[] = [
    ...(RECORD_FIELDS[entityType] ?? []),
    ...customProps.map((c) => ({
      key: `cp_${c.id}`,
      label: c.name,
      type: CP_TYPE[c.type] ?? "text",
      options: c.options,
    })),
  ]

  const bag = (record.customProperties as Record<string, any>) ?? {}
  const values: Record<string, any> = { ...record }
  for (const c of customProps) values[`cp_${c.id}`] = bag[c.id]

  const toCards = (rows: { cardName: string; title: string; fields: string[] }[]) =>
    rows.map((l) => ({ cardName: l.cardName, title: l.title, fields: l.fields }))

  // Until someone customizes the layout, the left column shows one card with every
  // base property. The middle column starts empty — add cards to put properties there.
  const cards = leftLayouts.length ? toCards(leftLayouts as any) : [defaultCardFor(entityType)]
  const middleCards = toCards(middleLayouts as any)

  return { cards, middleCards, catalog, values }
}
