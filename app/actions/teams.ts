"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { requireSettingsPage } from "@/lib/auth-guard"
import { ungrantable } from "@/lib/permissions"

// Teams are managed on the User Management settings page. A team's permissions
// reach every member, so a non-admin may only touch teams whose permissions are
// within their own — otherwise adding yourself to a stronger team is a back door.
async function requireTeamAccess(teamPermissions: string[] = []): Promise<string | null> {
  const session = await requireSettingsPage("users")
  const extra = ungrantable(session.user as any, teamPermissions)
  return extra.length ? "You can only manage teams whose access is within your own." : null
}

async function teamPermissions(id: string): Promise<string[]> {
  return (await prisma.team.findUnique({ where: { id }, select: { permissions: true } }))?.permissions ?? []
}

export async function getTeams() {
  return prisma.team.findMany({
    orderBy: { name: "asc" },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      },
    },
  })
}

export async function createTeam(input: {
  name: string
  description?: string
  permissions: string[]
}): Promise<{ success: boolean; error?: string }> {
  const denied = await requireTeamAccess(input.permissions)
  if (denied) return { success: false, error: denied }
  try {
    await prisma.team.create({ data: input })
    revalidatePath("/settings/users")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message }
  }
}

export async function updateTeam(
  id: string,
  input: { name: string; description?: string; permissions: string[] }
): Promise<{ success: boolean; error?: string }> {
  const denied = await requireTeamAccess([...(await teamPermissions(id)), ...input.permissions])
  if (denied) return { success: false, error: denied }
  try {
    await prisma.team.update({ where: { id }, data: input })
    revalidatePath("/settings/users")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message }
  }
}

export async function deleteTeam(id: string): Promise<{ success: boolean; error?: string }> {
  const denied = await requireTeamAccess(await teamPermissions(id))
  if (denied) return { success: false, error: denied }
  try {
    await prisma.team.delete({ where: { id } })
    revalidatePath("/settings/users")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message }
  }
}

export async function addTeamMember(
  teamId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const denied = await requireTeamAccess(await teamPermissions(teamId))
  if (denied) return { success: false, error: denied }
  try {
    await prisma.teamMember.create({ data: { teamId, userId } })
    revalidatePath("/settings/users")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message }
  }
}

export async function removeTeamMember(
  teamId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const denied = await requireTeamAccess(await teamPermissions(teamId))
  if (denied) return { success: false, error: denied }
  await prisma.teamMember.delete({
    where: { teamId_userId: { teamId, userId } },
  })
  revalidatePath("/settings/users")
  return { success: true }
}
