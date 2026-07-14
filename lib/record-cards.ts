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
  const [layouts, customProps] = await Promise.all([
    getCardLayouts(entityType as any, "LEFT"),
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

  // Until someone customizes the layout, show one card with every base property.
  const cards = layouts.length
    ? layouts.map((l) => ({ cardName: l.cardName, title: l.title, fields: l.fields }))
    : [defaultCardFor(entityType)]

  return { cards, catalog, values }
}
