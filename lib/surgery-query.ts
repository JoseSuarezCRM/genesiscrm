// Pure query helpers for the surgery list + export, shared by the server action
// (app/actions/surgery.ts) and the export route. No "use server" so it can
// export synchronous functions.

export interface SurgeryFilters {
  search?: string
  statuses?: string[]
  statusMode?: "any" | "none"
  from?: string
  to?: string
  page?: number
  sort?: string
  dir?: "asc" | "desc"
}

export const SURGERY_PAGE_SIZE = 20

// Shared Prisma `where` so the list and the export filter identically.
export function buildSurgeryWhere(filters: SurgeryFilters): Record<string, unknown> {
  const { search, statuses = [], statusMode = "any", from, to } = filters
  const where: Record<string, unknown> = {}

  if (statuses.length > 0) {
    where.status = statusMode === "none" ? { notIn: statuses } : { in: statuses }
  }
  if (from || to) {
    where.creationDate = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    }
  }
  if (search?.trim()) {
    where.OR = [
      { patientName: { contains: search.trim(), mode: "insensitive" } },
      { mrn: { contains: search.trim(), mode: "insensitive" } },
    ]
  }
  return where
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
