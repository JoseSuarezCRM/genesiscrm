"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"

async function requireAuth() {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  return session
}

// ─── Config ──────────────────────────────────────────────────────────────────

export async function getMarketingConfig() {
  await requireAuth()
  const cfg = await (prisma as any).marketingConfig.findUnique({ where: { id: "singleton" } })
  return cfg ?? { id: "singleton", notifyEmail: "" }
}

export async function saveMarketingConfig(notifyEmail: string) {
  await requireAuth()
  await (prisma as any).marketingConfig.upsert({
    where: { id: "singleton" },
    update: { notifyEmail },
    create: { id: "singleton", notifyEmail },
  })
  revalidatePath("/settings/marketing")
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function listCategories() {
  await requireAuth()
  return (prisma as any).marketingCategory.findMany({
    orderBy: { order: "asc" },
    include: { items: { orderBy: { createdAt: "asc" } } },
  })
}

export async function createCategory(name: string) {
  await requireAuth()
  const count = await (prisma as any).marketingCategory.count()
  await (prisma as any).marketingCategory.create({ data: { name: name.trim(), order: count } })
  revalidatePath("/settings/marketing")
}

export async function renameCategory(id: string, name: string) {
  await requireAuth()
  await (prisma as any).marketingCategory.update({ where: { id }, data: { name: name.trim() } })
  revalidatePath("/settings/marketing")
}

export async function deleteCategory(id: string) {
  await requireAuth()
  await (prisma as any).marketingCategory.delete({ where: { id } })
  revalidatePath("/settings/marketing")
}

// ─── Items ────────────────────────────────────────────────────────────────────

export async function createMarketingItem(data: {
  categoryId: string
  title: string
  description?: string
  fileUrl: string
  fileName: string
}) {
  await requireAuth()
  await (prisma as any).marketingItem.create({ data })
  revalidatePath("/settings/marketing")
}

export async function deleteMarketingItem(id: string) {
  await requireAuth()
  await (prisma as any).marketingItem.delete({ where: { id } })
  revalidatePath("/settings/marketing")
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export async function listMarketingOrders() {
  await requireAuth()
  return (prisma as any).marketingOrder.findMany({
    orderBy: { createdAt: "desc" },
    include: { item: { include: { category: true } } },
  })
}

export async function markOrderReviewed(id: string) {
  await requireAuth()
  await (prisma as any).marketingOrder.update({ where: { id }, data: { status: "REVIEWED" } })
  revalidatePath("/settings/marketing")
}

export async function deleteMarketingOrder(id: string) {
  await requireAuth()
  await (prisma as any).marketingOrder.delete({ where: { id } })
  revalidatePath("/settings/marketing")
}
