"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"

export interface DashboardSummary {
  id: string
  name: string
  reportCount: number
  createdAt: Date
  updatedAt: Date
}

export type DashboardLayout = Record<string, { x: number; y: number; w: number; h: number }>
export type DashboardDateRange = { preset: string; from?: string; to?: string }

export interface DashboardDetail {
  id: string
  name: string
  layout: DashboardLayout | null
  dateRange: DashboardDateRange | null
  createdAt: Date
  updatedAt: Date
  reports: {
    savedReportId: string
    order: number
    filters: any | null
    addedAt: Date
    savedReport: {
      id: string
      name: string
      config: any
      isPinned: boolean
      createdAt: Date
    }
  }[]
}

export async function getDashboards(): Promise<DashboardSummary[]> {
  const session = await auth()
  if (!session) return []

  const dashboards = await (prisma as any).dashboard.findMany({
    where: { createdById: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { reports: true } } },
  })

  return dashboards.map((d: any) => ({
    id: d.id,
    name: d.name,
    reportCount: d._count.reports,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }))
}

export async function getDashboard(id: string): Promise<DashboardDetail | null> {
  const session = await auth()
  if (!session) return null

  const dashboard = await (prisma as any).dashboard.findFirst({
    where: { id, createdById: session.user.id },
    include: {
      reports: {
        orderBy: { order: "asc" },
        select: {
          savedReportId: true, order: true, filters: true, addedAt: true,
          savedReport: {
            select: { id: true, name: true, config: true, isPinned: true, createdAt: true },
          },
        },
      },
    },
  })

  return dashboard ?? null
}

export async function createDashboard(name: string): Promise<{ id: string }> {
  const session = await auth()
  if (!session) throw new Error("Unauthorized")

  const dashboard = await (prisma as any).dashboard.create({
    data: { name, createdById: session.user.id },
    select: { id: true },
  })

  revalidatePath("/reports/dashboard")
  return dashboard
}

export async function renameDashboard(id: string, name: string): Promise<void> {
  const session = await auth()
  if (!session) throw new Error("Unauthorized")

  await (prisma as any).dashboard.updateMany({
    where: { id, createdById: session.user.id },
    data: { name },
  })

  revalidatePath("/reports/dashboard")
  revalidatePath(`/reports/dashboard/${id}`)
}

export async function deleteDashboard(id: string): Promise<void> {
  const session = await auth()
  if (!session) throw new Error("Unauthorized")

  await (prisma as any).dashboard.deleteMany({
    where: { id, createdById: session.user.id },
  })

  revalidatePath("/reports/dashboard")
}

export async function addReportToDashboard(dashboardId: string, savedReportId: string): Promise<void> {
  const session = await auth()
  if (!session) throw new Error("Unauthorized")

  // Verify ownership of the dashboard
  const dashboard = await (prisma as any).dashboard.findFirst({
    where: { id: dashboardId, createdById: session.user.id },
    select: { id: true },
  })
  if (!dashboard) throw new Error("Dashboard not found")

  await (prisma as any).dashboardReport.upsert({
    where: { dashboardId_savedReportId: { dashboardId, savedReportId } },
    update: {},
    create: { dashboardId, savedReportId },
  })

  await (prisma as any).dashboard.update({
    where: { id: dashboardId },
    data: { updatedAt: new Date() },
  })

  revalidatePath(`/reports/dashboard/${dashboardId}`)
}

export async function removeReportFromDashboard(dashboardId: string, savedReportId: string): Promise<void> {
  const session = await auth()
  if (!session) throw new Error("Unauthorized")

  await (prisma as any).dashboardReport.deleteMany({
    where: { dashboardId, savedReportId },
  })

  revalidatePath(`/reports/dashboard/${dashboardId}`)
}

// Persist the grid geometry (drag/resize). No revalidate — the client owns state.
export async function saveDashboardLayout(dashboardId: string, layout: DashboardLayout): Promise<void> {
  const session = await auth()
  if (!session) throw new Error("Unauthorized")

  await (prisma as any).dashboard.updateMany({
    where: { id: dashboardId, createdById: session.user.id },
    data: { layout },
  })
}

// Dashboard-level quick date filter (cascades to every card at render).
export async function saveDashboardDateRange(dashboardId: string, dateRange: DashboardDateRange | null): Promise<void> {
  const session = await auth()
  if (!session) throw new Error("Unauthorized")
  await (prisma as any).dashboard.updateMany({
    where: { id: dashboardId, createdById: session.user.id },
    data: { dateRange },
  })
}

// Per-card FilterState merged into that card's report at render.
export async function saveCardFilters(dashboardId: string, savedReportId: string, filters: any | null): Promise<void> {
  const session = await auth()
  if (!session) throw new Error("Unauthorized")
  const dash = await (prisma as any).dashboard.findFirst({ where: { id: dashboardId, createdById: session.user.id }, select: { id: true } })
  if (!dash) throw new Error("Dashboard not found")
  await (prisma as any).dashboardReport.updateMany({
    where: { dashboardId, savedReportId },
    data: { filters },
  })
}
