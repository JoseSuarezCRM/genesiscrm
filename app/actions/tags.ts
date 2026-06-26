"use server"

import { requirePermission } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { runTrigger_TagAdded } from "@/lib/automation-engine"

async function requireAuth() {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  return session
}

export async function listTags() {
  await requireAuth()
  return (prisma.tag as any).findMany({ where: { scope: "REFERRAL" }, orderBy: { name: "asc" } })
}

export async function listActivityTags() {
  await requireAuth()
  // Return any tag used by at least one activity, regardless of scope
  return prisma.tag.findMany({
    where: { activities: { some: {} } },
    orderBy: { name: "asc" },
  })
}

export async function createTag(data: { name: string; color: string }) {
  await requirePermission("MANAGE_TAGS")
  await requireAuth()
  if (!data.name.trim()) return { error: "Name is required" }
  const existing = await (prisma.tag as any).findFirst({ where: { name: data.name.trim(), scope: "REFERRAL" } })
  if (existing) return { error: "A tag with this name already exists" }
  const tag = await (prisma.tag as any).create({ data: { name: data.name.trim(), color: data.color, scope: "REFERRAL" } })
  revalidatePath("/referrals")
  return { success: true, tag }
}

export async function upsertActivityTag(name: string, color: string) {
  await requirePermission("MANAGE_TAGS")
  await requireAuth()
  const tag = await (prisma.tag as any).upsert({
    where: { name_scope: { name: name.trim().toLowerCase(), scope: "ACTIVITY" } },
    update: { color },
    create: { name: name.trim().toLowerCase(), color, scope: "ACTIVITY" },
  })
  revalidatePath("/activities")
  return tag
}

export async function updateTagColor(id: string, color: string) {
  await requirePermission("MANAGE_TAGS")
  await requireAuth()
  await prisma.tag.update({ where: { id }, data: { color } })
  revalidatePath("/activities")
  revalidatePath("/referrals")
}

export async function setActivityTags(activityId: string, tagIds: string[]) {
  await requireAuth()
  await prisma.activityTag.deleteMany({ where: { activityId } })
  if (tagIds.length > 0) {
    await prisma.activityTag.createMany({
      data: tagIds.map((tagId) => ({ activityId, tagId })),
    })
  }
  revalidatePath("/activities")
}

export async function deleteTag(id: string) {
  await requirePermission("MANAGE_TAGS")
  await requireAuth()
  await prisma.tag.delete({ where: { id } })
  revalidatePath("/referrals")
  revalidatePath("/activities")
}

export async function bulkAddTag(referralIds: string[], tagId: string) {
  await requireAuth()
  await prisma.referralTag.createMany({
    data: referralIds.map((referralId) => ({ referralId, tagId })),
    skipDuplicates: true,
  })
  revalidatePath("/referrals")
}

export async function bulkRemoveTag(referralIds: string[], tagId: string) {
  await requireAuth()
  await prisma.referralTag.deleteMany({
    where: { referralId: { in: referralIds }, tagId },
  })
  revalidatePath("/referrals")
}

export async function setReferralTags(referralId: string, tagIds: string[]) {
  const session = await requireAuth()

  const existing = await prisma.referralTag.findMany({ where: { referralId }, select: { tagId: true } })
  const existingIds = new Set(existing.map(t => t.tagId))
  const addedIds = tagIds.filter(id => !existingIds.has(id))

  await prisma.referralTag.deleteMany({ where: { referralId } })
  if (tagIds.length > 0) {
    await prisma.referralTag.createMany({
      data: tagIds.map((tagId) => ({ referralId, tagId })),
    })
  }

  if (addedIds.length > 0) {
    const addedTags = await prisma.tag.findMany({ where: { id: { in: addedIds } }, select: { id: true, name: true } })
    await Promise.allSettled(addedTags.map(tag => runTrigger_TagAdded(referralId, tag.id, tag.name, session.user.id)))
  }

  revalidatePath(`/referrals/${referralId}`)
  revalidatePath("/referrals")
}
