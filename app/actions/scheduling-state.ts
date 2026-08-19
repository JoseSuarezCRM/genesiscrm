"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"

// Gate matches the staff scheduler (app/actions/scheduler.ts): admins or anyone
// with the scheduling permission may read/write the shared planner state.
async function requireScheduling() {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  const user = session.user as any
  const isAdmin = user.role === "ADMIN"
  const perms = user.permissions as string[] | undefined
  const hasPerm = perms?.includes("MANAGE_SCHEDULING") || perms?.includes("NAV_SCHEDULING")
  if (!isAdmin && !hasPerm) throw new Error("Unauthorized")
  return session
}

// The single org-wide saved state for the embedded Operations Planner.
export async function getSchedulingState(): Promise<any> {
  await requireScheduling()
  const row = await (prisma as any).schedulingState.findUnique({ where: { key: "default" } })
  return (row?.data as any) ?? {}
}

export async function saveSchedulingState(data: any): Promise<{ success: true }> {
  const session = await requireScheduling()
  const uid = (session.user as any)?.id ?? null
  await (prisma as any).schedulingState.upsert({
    where: { key: "default" },
    create: { key: "default", data: data ?? {}, updatedById: uid },
    update: { data: data ?? {}, updatedById: uid },
  })
  return { success: true }
}
