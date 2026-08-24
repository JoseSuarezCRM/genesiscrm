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
