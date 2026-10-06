"use server"

import { requireSettingsPage } from "@/lib/auth-guard"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { userCanLevel } from "@/lib/permissions"
import { parsePractice, type PracticeContent } from "@/lib/practice"

/**
 * The practice record is organisation-wide: one edit changes every surgeon's
 * site. Same bar as the surgeon sites themselves.
 */
// Everything here belongs to the practice settings page: admins, or anyone given
// that page's box in User Management (lib/settings-pages.ts).
const requirePageAccess = () => requireSettingsPage("practice")

export async function getPractice(): Promise<PracticeContent> {
  await requirePageAccess()
  const row = await (prisma as any).practice.findUnique({ where: { id: "default" } })
  return parsePractice(row?.content)
}

/**
 * Save the practice.
 *
 * Whole-record write, like the surgeon editor: the editor holds the entire
 * record in state, so a partial update would need every caller to know which
 * fields it owns. There is one row and one editor, so there is nothing to race.
 */
export async function updatePractice(content: PracticeContent) {
  const session = await requirePageAccess()
  await (prisma as any).practice.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      content: content as any,
      updatedById: (session.user as any).id ?? null,
    },
    update: { content: content as any, updatedById: (session.user as any).id ?? null },
  })
  revalidatePath("/settings/practice")
}
