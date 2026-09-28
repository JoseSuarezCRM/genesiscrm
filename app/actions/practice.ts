"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { userCanLevel } from "@/lib/permissions"
import { parsePractice, type PracticeContent } from "@/lib/practice"

/**
 * The practice record is organisation-wide: one edit changes every surgeon's
 * site. Same bar as the surgeon sites themselves.
 */
async function requireAdmin() {
  const session = await auth()
  if (!session?.user || !userCanLevel(session.user as any, "NAV_ADMIN", "VIEW")) {
    throw new Error("Not authorised")
  }
  return session
}

export async function getPractice(): Promise<PracticeContent> {
  await requireAdmin()
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
  const session = await requireAdmin()
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
