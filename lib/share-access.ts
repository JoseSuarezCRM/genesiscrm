// Shared visibility scoping for owner-created records that can be shared with
// EVERYONE / a TEAM / specific users (same model as saved Views). Used by saved
// reports and dashboards.
import { prisma } from "@/lib/prisma"

export interface ShareAccess {
  visibility: "PRIVATE" | "EVERYONE" | "TEAM" | "CUSTOM"
  teamId?: string | null
  sharedUserIds?: string[]
}

export async function myTeamIds(userId: string): Promise<string[]> {
  const m = await (prisma as any).teamMember.findMany({ where: { userId }, select: { teamId: true } })
  return m.map((x: any) => x.teamId)
}

// OR clauses: records the user owns or that are shared to them.
export function sharedOrWhere(userId: string, teamIds: string[]): Record<string, unknown>[] {
  return [
    { createdById: userId },
    { visibility: "EVERYONE" },
    { visibility: "TEAM", teamId: { in: teamIds.length ? teamIds : ["__none__"] } },
    { visibility: "CUSTOM", sharedUserIds: { has: userId } },
  ]
}

// Normalize a ShareAccess into the columns to persist (clears fields not in use).
export function accessData(access: ShareAccess): { visibility: string; teamId: string | null; sharedUserIds: string[] } {
  return {
    visibility: access.visibility,
    teamId: access.visibility === "TEAM" ? access.teamId ?? null : null,
    sharedUserIds: access.visibility === "CUSTOM" ? access.sharedUserIds ?? [] : [],
  }
}
