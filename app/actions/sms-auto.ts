"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"

export interface SmsAutoResponseInput {
  isActive: boolean
  trigger: string
  matchType: "exact" | "contains" | "starts_with"
  response: string
  description?: string
  order: number
}

export async function getSmsAutoResponses() {
  return prisma.smsAutoResponse.findMany({ orderBy: { order: "asc" } })
}

export async function createSmsAutoResponse(
  input: SmsAutoResponseInput
): Promise<{ success: boolean; error?: string }> {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") return { success: false, error: "Unauthorized" }

  try {
    await prisma.smsAutoResponse.create({ data: input })
    revalidatePath("/broadcasts")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Create failed." }
  }
}

export async function updateSmsAutoResponse(
  id: string,
  input: SmsAutoResponseInput
): Promise<{ success: boolean; error?: string }> {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") return { success: false, error: "Unauthorized" }

  try {
    await prisma.smsAutoResponse.update({ where: { id }, data: input })
    revalidatePath("/broadcasts")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Update failed." }
  }
}

export async function deleteSmsAutoResponse(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") return { success: false, error: "Unauthorized" }

  try {
    await prisma.smsAutoResponse.delete({ where: { id } })
    revalidatePath("/broadcasts")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Delete failed." }
  }
}

export async function reorderSmsAutoResponses(
  ids: string[]
): Promise<{ success: boolean }> {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") return { success: false }

  await Promise.all(
    ids.map((id, i) => prisma.smsAutoResponse.update({ where: { id }, data: { order: i } }))
  )
  revalidatePath("/broadcasts")
  return { success: true }
}
