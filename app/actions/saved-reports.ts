"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { myTeamIds, sharedOrWhere, accessData, type ShareAccess } from "@/lib/share-access"

export interface SavedReportConfig {
  groupBy: string
  granularity: string
  range: string
  from?: string
  to?: string
  practiceIds: string[]
  pipelineIds: string[]
  viz: string
  sortKey: string
  sortDir: string
  limit?: number
}

export interface SavedReport {
  id: string
  name: string
  config: SavedReportConfig
  isPinned: boolean
  visibility?: string
  teamId?: string | null
  sharedUserIds?: string[]
  createdById: string
  createdAt: Date
  updatedAt: Date
}

export async function getSavedReports(): Promise<SavedReport[]> {
  const session = await auth()
  if (!session) return []
  const userId = session.user.id
  const teamIds = await myTeamIds(userId)

  const reports = await (prisma as any).savedReport.findMany({
    where: { OR: sharedOrWhere(userId, teamIds) },
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
  })

  return reports as SavedReport[]
}

export interface ReportListItem {
  id: string
  name: string
  ownerName: string
  dashboardCount: number
  visibility: string
  isPinned: boolean
  vizType: string
  updatedAt: Date
}

// Enriched saved-report rows for the My Reports list (owner name + used-in count).
export async function getReportsList(): Promise<ReportListItem[]> {
  const session = await auth()
  if (!session) return []
  const userId = session.user.id
  const teamIds = await myTeamIds(userId)

  const reports = await (prisma as any).savedReport.findMany({
    where: { OR: sharedOrWhere(userId, teamIds) },
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
    select: { id: true, name: true, config: true, isPinned: true, visibility: true, createdById: true, updatedAt: true },
  })

  const ownerIds = Array.from(new Set(reports.map((r: any) => r.createdById))) as string[]
  const owners = ownerIds.length
    ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true, email: true } })
    : []
  const ownerName = Object.fromEntries(owners.map((u) => [u.id, u.name || u.email]))

  const usage = await (prisma as any).dashboardReport.groupBy({ by: ["savedReportId"], _count: true }).catch(() => [])
  const usedIn = Object.fromEntries(usage.map((u: any) => [u.savedReportId, u._count]))

  return reports.map((r: any) => ({
    id: r.id,
    name: r.name,
    ownerName: ownerName[r.createdById] ?? "—",
    dashboardCount: usedIn[r.id] ?? 0,
    visibility: r.visibility ?? "PRIVATE",
    isPinned: !!r.isPinned,
    vizType: (r.config as any)?.viz ?? "table",
    updatedAt: r.updatedAt,
  }))
}

// Rail badge counts (owned OR shared), for both list views.
export async function getReportingCounts(): Promise<{ reports: number; dashboards: number }> {
  const session = await auth()
  if (!session) return { reports: 0, dashboards: 0 }
  const userId = session.user.id
  const teamIds = await myTeamIds(userId)
  const where = { OR: sharedOrWhere(userId, teamIds) }
  const [reports, dashboards] = await Promise.all([
    (prisma as any).savedReport.count({ where }),
    (prisma as any).dashboard.count({ where }),
  ])
  return { reports, dashboards }
}

export async function createSavedReport(
  name: string,
  config: SavedReportConfig,
  access?: ShareAccess,
): Promise<{ id: string }> {
  const session = await auth()
  if (!session) throw new Error("Unauthorized")

  const report = await (prisma as any).savedReport.create({
    data: {
      name,
      config,
      createdById: session.user.id,
      ...(access ? accessData(access) : {}),
    },
    select: { id: true },
  })

  revalidatePath("/reports/builder")
  revalidatePath("/reports/builder/classic")
  revalidatePath("/reports/dashboard")
  return report
}

// Change who can see a report (owner only).
export async function setSavedReportAccess(id: string, access: ShareAccess): Promise<void> {
  const session = await auth()
  if (!session) throw new Error("Unauthorized")
  await (prisma as any).savedReport.updateMany({
    where: { id, createdById: session.user.id },
    data: accessData(access),
  })
  revalidatePath("/reports/dashboard")
}

export async function updateSavedReport(
  id: string,
  name: string,
  config: SavedReportConfig,
  access?: ShareAccess,
): Promise<{ id: string }> {
  const session = await auth()
  if (!session) throw new Error("Unauthorized")

  await (prisma as any).savedReport.updateMany({
    where: { id, createdById: session.user.id },
    data: { name, config, ...(access ? accessData(access) : {}) },
  })

  revalidatePath("/reports/builder")
  revalidatePath("/reports/builder/classic")
  revalidatePath("/reports/dashboard")
  return { id }
}

export async function deleteSavedReport(id: string): Promise<void> {
  const session = await auth()
  if (!session) throw new Error("Unauthorized")

  await (prisma as any).savedReport.deleteMany({
    where: { id, createdById: session.user.id },
  })

  revalidatePath("/reports/builder")
  revalidatePath("/reports/builder/classic")
  revalidatePath("/reports/dashboard")
}

export async function togglePinSavedReport(id: string, isPinned: boolean): Promise<void> {
  const session = await auth()
  if (!session) throw new Error("Unauthorized")

  await (prisma as any).savedReport.updateMany({
    where: { id, createdById: session.user.id },
    data: { isPinned },
  })

  revalidatePath("/reports/builder")
  revalidatePath("/reports/builder/classic")
  revalidatePath("/reports/dashboard")
}

export async function renameSavedReport(id: string, name: string): Promise<void> {
  const session = await auth()
  if (!session) throw new Error("Unauthorized")

  await (prisma as any).savedReport.updateMany({
    where: { id, createdById: session.user.id },
    data: { name },
  })

  revalidatePath("/reports/builder")
  revalidatePath("/reports/builder/classic")
  revalidatePath("/reports/dashboard")
}
