"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import bcrypt from "bcryptjs"
import { Role } from "@prisma/client"

async function requireAdmin() {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  if ((session.user as { role?: string }).role !== "ADMIN") {
    throw new Error("Admin access required")
  }
  return session
}

const CreateUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.nativeEnum(Role),
})

export async function createUser(data: unknown) {
  await requireAdmin()

  const parsed = CreateUserSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  })
  if (existing) {
    return { error: { email: ["Email already in use"] } }
  }

  const hashed = await bcrypt.hash(parsed.data.password, 10)

  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      password: hashed,
      role: parsed.data.role,
    },
  })

  revalidatePath("/settings/users")
  return { success: true }
}

export async function updateUserRole(id: string, role: Role) {
  const session = await requireAdmin()

  if (session.user.id === id) {
    return { error: "You cannot change your own role." }
  }

  await prisma.user.update({ where: { id }, data: { role } })
  revalidatePath("/settings/users")
  return { success: true }
}

export async function deleteUser(id: string) {
  const session = await requireAdmin()

  if (session.user.id === id) {
    return { error: "You cannot delete your own account." }
  }

  await prisma.user.delete({ where: { id } })
  revalidatePath("/settings/users")
  return { success: true }
}

export async function resetPassword(id: string, newPassword: string) {
  await requireAdmin()

  if (newPassword.length < 6) {
    return { error: "Password must be at least 6 characters." }
  }

  const hashed = await bcrypt.hash(newPassword, 10)
  await prisma.user.update({ where: { id }, data: { password: hashed } })
  return { success: true }
}
