"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"

export interface ProviderViewConfig {
  columns: string[]
  sort: "name" | "referrals"
  search: string
}

export async function getProviderViews() {
  const session = await auth()
  if (!session?.user) return []
  return (prisma as any).providerView.findMany({
    where: { userId: (session.user as any).id },
    orderBy: { createdAt: "asc" },
  })
}

export async function createProviderView(name: string, config: ProviderViewConfig) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  const view = await (prisma as any).providerView.create({
    data: { name: name.trim(), userId: (session.user as any).id, config },
  })
  revalidatePath("/referring-doctors")
  return { success: true, id: view.id }
}

export async function updateProviderView(id: string, config: ProviderViewConfig) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  await (prisma as any).providerView.update({
    where: { id, userId: (session.user as any).id },
    data: { config },
  })
  revalidatePath("/referring-doctors")
  return { success: true }
}

export async function deleteProviderView(id: string) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  await (prisma as any).providerView.delete({
    where: { id, userId: (session.user as any).id },
  })
  revalidatePath("/referring-doctors")
  return { success: true }
}
