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

export async function loadPropertyCards(entityType: string, record: Record<string, any>) {
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
