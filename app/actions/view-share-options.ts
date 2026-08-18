"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"

// Users + the current user's teams, used to populate the view access selector.
export async function getViewShareOptions() {
  const session = await auth()
  if (!session?.user) return { users: [], teams: [] }
  const userId = (session.user as any).id

  const [users, memberships] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    (prisma as any).teamMember.findMany({
      where: { userId },
      select: { team: { select: { id: true, name: true } } },
    }),
  ])

  const teams = memberships.map((m: any) => m.team)
  return {
    users: users.filter((u) => u.id !== userId), // exclude self from custom picker
    teams,
  }
}

// All active users (INCLUDING self) as { id, label } — for owner/assignee pickers
// where you can legitimately assign a record to yourself.
export async function getAssignableUsers(): Promise<{ id: string; label: string }[]> {
  const session = await auth()
  if (!session?.user) return []
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  })
  return users.map((u) => ({ id: u.id, label: u.name || u.email }))
}
