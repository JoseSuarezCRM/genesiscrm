// Pure query helper for the referrals list + export, shared by the page server
// component and the export route so both filter identically. No "use server".

import type { FilterState, FilterField } from "./filters"
import { filterStateToWhere } from "./filter-to-prisma"
import { REFERRAL_FILTER_FIELDS } from "./referral-filter-fields"

export interface ReferralFilters {
  search?: string
  statuses?: string[]
  statusMode?: "any" | "none"
  practiceIds?: string[]
  practiceMode?: "any" | "none"
  doctorIds?: string[]
  doctorMode?: "any" | "none"
  tagIds?: string[]
  tagMode?: "any" | "none"
  from?: string
  to?: string
  incompleteOnly?: boolean
  pipelineId?: string | null
  filter?: FilterState | null // advanced FilterBuilder state
}

// Shared Prisma `where` for the referrals list, count, and export. The quick
// controls (search / status / practice / provider / tags / date / incomplete /
// pipeline) and the advanced FilterBuilder are AND-ed together. `fields` defaults
// to the fixed columns; callers that know the referral custom properties pass
// referralFilterFields({ customProps, … }) so those criteria translate too.
export function buildReferralWhere(
  filters: ReferralFilters,
  fields: FilterField[] = REFERRAL_FILTER_FIELDS,
): Record<string, unknown> {
  const {
    search, statuses = [], statusMode = "any", practiceIds = [], practiceMode = "any",
    doctorIds = [], doctorMode = "any", tagIds = [], tagMode = "any",
    from, to, incompleteOnly, pipelineId, filter,
  } = filters
  const clauses: Record<string, unknown>[] = []

  if (pipelineId) clauses.push({ pipelineId })
  if (incompleteOnly) {
    clauses.push({ OR: [{ referringPracticeId: null }, { referringLocationId: null }, { referringDoctorId: null }] })
  }
  if (statuses.length > 0) clauses.push({ status: statusMode === "none" ? { notIn: statuses } : { in: statuses } })
  if (practiceIds.length > 0) clauses.push({ referringPracticeId: practiceMode === "none" ? { notIn: practiceIds } : { in: practiceIds } })
  if (doctorIds.length > 0) clauses.push({ referringDoctorId: doctorMode === "none" ? { notIn: doctorIds } : { in: doctorIds } })
  if (from || to) {
    clauses.push({
      referralDate: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      },
    })
  }
  if (search?.trim()) {
    const s = search.trim()
    clauses.push({
      OR: [
        { patientFirstName: { contains: s, mode: "insensitive" } },
        { patientLastName: { contains: s, mode: "insensitive" } },
        { referringDoctorName: { contains: s, mode: "insensitive" } },
        { referringPractice: { name: { contains: s, mode: "insensitive" } } },
        { genesisMrn: { contains: s, mode: "insensitive" } },
      ],
    })
  }
  if (tagIds.length > 0) {
    clauses.push(tagMode === "none"
      ? { tags: { none: { tagId: { in: tagIds } } } }
      : { tags: { some: { tagId: { in: tagIds } } } })
  }

  const advanced = filterStateToWhere(filter, fields)
  if (Object.keys(advanced).length > 0) clauses.push(advanced)

  if (clauses.length === 0) return {}
  if (clauses.length === 1) return clauses[0]
  return { AND: clauses }
}
