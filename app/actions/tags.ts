"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"

async function requireAuth() {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  return session
}

export async function listTags() {
  await requireAuth()
  return prisma.tag.findMany({ orderBy: { name: "asc" } })
}

export async function createTag(data: { name: string; color: string }) {
  await requireAuth()
  if (!data.name.trim()) return { error: "Name is required" }
  const existing = await prisma.tag.findUnique({ where: { name: data.name.trim() } })
  if (existing) return { error: "A tag with this name already exists" }
  const tag = await prisma.tag.create({ data: { name: data.name.trim(), color: data.color } })
  revalidatePath("/referrals")
  return { success: true, tag }
}

export async function deleteTag(id: string) {
  await requireAuth()
  await prisma.tag.delete({ where: { id } })
  revalidatePath("/referrals")
}

export async function setReferralTags(referralId: string, tagIds: string[]) {
  await requireAuth()
  await prisma.referralTag.deleteMany({ where: { referralId } })
  if (tagIds.length > 0) {
    await prisma.referralTag.createMany({
      data: tagIds.map((tagId) => ({ referralId, tagId })),
    })
  }
  revalidatePath(`/referrals/${referralId}`)
  revalidatePath("/referrals")
}
