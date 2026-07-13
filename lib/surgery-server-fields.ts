// Server-side surgery filter fields. The list and the CSV export both translate
// the FilterState into a Prisma `where`, so they need the tenant's Surgery custom
// properties in the field list — otherwise those criteria would be silently
// dropped and the results wouldn't match what the UI shows.

import { prisma } from "@/lib/prisma"
import type { FilterField } from "@/lib/filters"
import { surgeryFilterFields } from "@/lib/surgery-filter-fields"

export async function surgeryServerFilterFields(): Promise<FilterField[]> {
  const props = await prisma.customProperty.findMany({
    where: { entityType: "SURGERY" },
    orderBy: { createdAt: "asc" },
  })
  return surgeryFilterFields({
    customProps: props.map((p) => ({ id: p.id, name: p.name, type: p.type, options: p.options })),
  })
}
