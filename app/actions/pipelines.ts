"use server"

import { requireAccess, requireDelete } from "@/lib/auth-guard"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"

async function requireAdmin() {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  if ((session.user as { role?: string }).role !== "ADMIN") throw new Error("Admin access required")
}

export async function getPipelines() {
  return prisma.pipeline.findMany({
    where: { isActive: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  })
}

export async function createPipeline(data: { name: string; color: string }) {
  await requireAccess("PIPELINES", "EDIT")
  await requireAdmin()
  if (!data.name.trim()) return { error: "Name is required" }
  const maxOrder = await prisma.pipeline.aggregate({ _max: { order: true } })
  const pipeline = await prisma.pipeline.create({
    data: {
      name: data.name.trim(),
      color: data.color || "#3b82f6",
      order: (maxOrder._max.order ?? 0) + 1,
    },
  })
  revalidatePath("/referrals")
  revalidatePath("/settings/pipelines")
  return { pipeline }
}

export async function updatePipeline(id: string, data: { name?: string; color?: string }) {
  await requireAccess("PIPELINES", "EDIT")
  await requireAdmin()
  const pipeline = await prisma.pipeline.update({
    where: { id },
    data: {
      ...(data.name ? { name: data.name.trim() } : {}),
      ...(data.color ? { color: data.color } : {}),
    },
  })
  revalidatePath("/referrals")
  revalidatePath("/settings/pipelines")
  return { pipeline }
}

export async function deletePipeline(id: string) {
  await requireDelete("PIPELINES")
  await requireAdmin()
  const count = await prisma.referral.count({ where: { pipelineId: id } })
  if (count > 0) return { error: `Cannot delete — ${count} referral${count !== 1 ? "s" : ""} are assigned to this pipeline.` }
  await prisma.pipeline.delete({ where: { id } })
  revalidatePath("/referrals")
  revalidatePath("/settings/pipelines")
  return { success: true }
}
