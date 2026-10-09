// Loads the saved menu layout (Settings → Navigation). Server only.

import { prisma } from "@/lib/prisma"
import type { NavLayoutData } from "@/lib/nav-layout"

/** The saved layout, or null for the default menu. `db` may be a transaction. */
export async function getNavLayout(db: any = prisma): Promise<NavLayoutData | null> {
  const row = await db.navLayout.findUnique({ where: { id: "default" }, select: { data: true } }).catch(() => null)
  const data = row?.data as NavLayoutData | undefined
  // Anything unreadable falls back to the default menu rather than breaking every page.
  return data && data.version === 1 && Array.isArray(data.sections) ? data : null
}
