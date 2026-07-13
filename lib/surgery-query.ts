// Pure query helpers for the surgery list + export, shared by the server action
// (app/actions/surgery.ts) and the export route. No "use server" so it can
// export synchronous functions.

import type { FilterState, FilterField } from "./filters"
import { filterStateToWhere } from "./filter-to-prisma"
import { SURGERY_FILTER_FIELDS } from "./surgery-filter-fields"

export interface SurgeryFilters {
  search?: string
  statuses?: string[]
  statusMode?: "any" | "none"
  from?: string
  to?: string
  filter?: FilterState | null // advanced FilterBuilder state
  page?: number
  sort?: string
  dir?: "asc" | "desc"
}

export const SURGERY_PAGE_SIZE = 20

// Shared Prisma `where` so the list and the export filter identically. The quick
// controls (search / status / date range) and the advanced FilterBuilder are
// AND-ed together.
// `fields` defaults to the fixed columns; callers that know the tenant's Surgery
// custom properties pass surgeryFilterFields({ customProps }) so those criteria
// (and Record Owner) translate too.
export function buildSurgeryWhere(filters: SurgeryFilters, fields: FilterField[] = SURGERY_FILTER_FIELDS): Record<string, unknown> {
  const { search, statuses = [], statusMode = "any", from, to, filter } = filters
  const clauses: Record<string, unknown>[] = []

  if (statuses.length > 0) {
    clauses.push({ status: statusMode === "none" ? { notIn: statuses } : { in: statuses } })
  }
  if (from || to) {
    clauses.push({
      creationDate: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      },
    })
  }
  if (search?.trim()) {
    clauses.push({
      OR: [
        { patientName: { contains: search.trim(), mode: "insensitive" } },
        { mrn: { contains: search.trim(), mode: "insensitive" } },
      ],
    })
  }

  const advanced = filterStateToWhere(filter, fields)
  if (Object.keys(advanced).length > 0) clauses.push(advanced)

  if (clauses.length === 0) return {}
  if (clauses.length === 1) return clauses[0]
  return { AND: clauses }
}

// Map a sort key from the UI to a Prisma orderBy; defaults to newest first.
export function surgeryOrderBy(sort?: string, dir: "asc" | "desc" = "desc"): Record<string, unknown> {
  switch (sort) {
    case "patient": return { patientName: dir }
    case "status": return { status: dir }
    case "surgeryDate": return { surgeryDate: { sort: dir, nulls: "last" } }
    default: return { createdAt: "desc" }
  }
}
