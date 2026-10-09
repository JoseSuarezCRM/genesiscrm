"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireSettingsPage } from "@/lib/auth-guard"
import { sanitizeNavLayout } from "@/lib/nav-layout"
import { isNavIcon } from "@/lib/nav-icons"

/**
 * Save the organisation's menu (Settings → Navigation). Everyone's sidebar
 * follows it; what each person can open doesn't change (lib/nav-layout.ts).
 */
export async function saveNavLayout(input: unknown): Promise<{ success: true } | { error: string }> {
  const session = await requireSettingsPage("navigation")
  const objects = await prisma.customObjectDef.findMany({ select: { key: true } })
  const res = sanitizeNavLayout(input, { customObjectKeys: objects.map((o) => o.key), isIcon: isNavIcon })
  if ("error" in res) return res
  const updatedById = (session.user as any).id ?? null
  await prisma.navLayout.upsert({
    where: { id: "default" },
    create: { id: "default", data: res.layout as any, updatedById },
    update: { data: res.layout as any, updatedById },
  })
  // The sidebar is on every page.
  revalidatePath("/", "layout")
  return { success: true }
}

/** Back to the default menu. */
export async function resetNavLayout(): Promise<{ success: true }> {
  await requireSettingsPage("navigation")
  await prisma.navLayout.deleteMany({ where: { id: "default" } })
  revalidatePath("/", "layout")
  return { success: true }
}
