"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { applyRules } from "@/lib/org-rules-utils"
import { mergeExistingPracticesByRules } from "@/lib/org-rules-merge"

export interface OrgRuleInput {
  contains: string
  normalizedName: string
  order: number
}

/** Apply rules to a raw org name string. Returns the normalized name or the original. */
export async function resolveOrgName(raw: string): Promise<string> {
  const rules = await prisma.orgNameRule.findMany({ orderBy: { order: "asc" } })
  return applyRules(raw, rules)
}


/**
 * Resolve org name → find or create ReferringPractice.
 * Optionally find or create a PracticeLocation if address is provided.
 * Returns { practiceId, locationId }.
 */
export async function resolveOrCreatePractice(
  rawName: string,
  address?: string | null,
  phone?: string | null
): Promise<{ practiceId: string; locationId: string | null }> {
  const rules = await prisma.orgNameRule.findMany({ orderBy: { order: "asc" } })
  const normalizedName = applyRules(rawName, rules)

  // Find or create practice (case-insensitive match)
  let practice = await prisma.referringPractice.findFirst({
    where: { name: { equals: normalizedName, mode: "insensitive" } },
  })

  if (!practice) {
    practice = await prisma.referringPractice.create({
      data: {
        name: normalizedName,
        phone: phone?.trim() || null,
        address: address?.trim() || null,
      },
    })
  }

  // Find or create location if address provided
  let locationId: string | null = null
  if (address?.trim()) {
    let location = await prisma.practiceLocation.findFirst({
      where: {
        practiceId: practice.id,
        address: { equals: address.trim(), mode: "insensitive" },
      },
    })
    if (!location) {
      location = await prisma.practiceLocation.create({
        data: {
          name: "Main Office",
          practiceId: practice.id,
          address: address.trim(),
          phone: phone?.trim() || null,
        },
      })
    }
    locationId = location.id
  }

  revalidatePath("/referring-doctors")
  return { practiceId: practice.id, locationId }
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function getOrgRules() {
  return prisma.orgNameRule.findMany({ orderBy: { order: "asc" } })
}

export async function createOrgRule(
  input: OrgRuleInput
): Promise<{ success: boolean; error?: string }> {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") return { success: false, error: "Unauthorized" }
  if (!input.contains.trim() || !input.normalizedName.trim())
    return { success: false, error: "Both fields are required." }

  try {
    const maxOrder = await prisma.orgNameRule.aggregate({ _max: { order: true } })
    await prisma.orgNameRule.create({
      data: {
        contains: input.contains.trim(),
        normalizedName: input.normalizedName.trim(),
        order: (maxOrder._max.order ?? -1) + 1,
      },
    })
    revalidatePath("/settings/org-rules")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Create failed." }
  }
}

export async function updateOrgRule(
  id: string,
  input: OrgRuleInput
): Promise<{ success: boolean; error?: string }> {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") return { success: false, error: "Unauthorized" }

  try {
    await prisma.orgNameRule.update({
      where: { id },
      data: {
        contains: input.contains.trim(),
        normalizedName: input.normalizedName.trim(),
        order: input.order,
      },
    })
    revalidatePath("/settings/org-rules")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Update failed." }
  }
}

export async function deleteOrgRule(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") return { success: false, error: "Unauthorized" }

  try {
    await prisma.orgNameRule.delete({ where: { id } })
    revalidatePath("/settings/org-rules")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Delete failed." }
  }
}

/**
 * Scan all existing practices, apply rules, and merge any that now map to a
 * canonical name that differs from their current name.
 * Returns how many practices were merged.
 */
export async function applyRulesToExistingPractices(): Promise<{ success: boolean; merged: number; error?: string }> {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") return { success: false, merged: 0, error: "Unauthorized" }

  const merged = await mergeExistingPracticesByRules()

  revalidatePath("/referring-doctors")
  revalidatePath("/settings/org-rules")
  revalidatePath("/referrals")
  return { success: true, merged }
}

// ── Background poller config ─────────────────────────────────────────────────

export interface OrgRulesPollerConfig {
  enabled: boolean
  intervalMinutes: number
  lastRunAt: string | null
  lastMerged: number
}

export async function getOrgRulesPoller(): Promise<OrgRulesPollerConfig> {
  const cfg = await (prisma as any).orgRulesPoller.findUnique({ where: { id: "singleton" } })
  return {
    enabled: cfg?.enabled ?? false,
    intervalMinutes: cfg?.intervalMinutes ?? 60,
    lastRunAt: cfg?.lastRunAt ? cfg.lastRunAt.toISOString() : null,
    lastMerged: cfg?.lastMerged ?? 0,
  }
}

export async function setOrgRulesPoller(
  input: { enabled: boolean; intervalMinutes: number }
): Promise<{ success: boolean; error?: string }> {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") return { success: false, error: "Unauthorized" }

  const interval = Math.max(15, Math.min(10080, Math.round(input.intervalMinutes) || 60))
  await (prisma as any).orgRulesPoller.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", enabled: input.enabled, intervalMinutes: interval },
    update: { enabled: input.enabled, intervalMinutes: interval },
  })
  revalidatePath("/settings/org-rules")
  return { success: true }
}

export async function reorderOrgRules(ids: string[]): Promise<{ success: boolean }> {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") return { success: false }

  await Promise.all(
    ids.map((id, i) => prisma.orgNameRule.update({ where: { id }, data: { order: i } }))
  )
  revalidatePath("/settings/org-rules")
  return { success: true }
}
