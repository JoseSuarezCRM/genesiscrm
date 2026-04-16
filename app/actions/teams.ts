"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"

async function requireAdmin() {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") throw new Error("Unauthorized")
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
  await requireAdmin()
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
  await requireAdmin()
  try {
    await prisma.team.update({ where: { id }, data: input })
    revalidatePath("/settings/users")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message }
  }
}

export async function deleteTeam(id: string): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()
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
  await requireAdmin()
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
): Promise<{ success: boolean }> {
  await requireAdmin()
  await prisma.teamMember.delete({
    where: { teamId_userId: { teamId, userId } },
  })
  revalidatePath("/settings/users")
  return { success: true }
}
