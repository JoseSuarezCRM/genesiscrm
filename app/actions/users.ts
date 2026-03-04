"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { createAuditLog } from "@/lib/audit"
import { PasswordSchema, validatePassword } from "@/lib/password-policy"
import bcrypt from "bcryptjs"
import { Role, AuditAction } from "@prisma/client"

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
  password: PasswordSchema,
  role: z.nativeEnum(Role),
})

export async function createUser(data: unknown) {
  const session = await requireAdmin()

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

  const hashed = await bcrypt.hash(parsed.data.password, 12)

  const newUser = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      password: hashed,
      role: parsed.data.role,
    },
  })

  await createAuditLog({
    userId: session.user.id,
    action: AuditAction.USER_CREATE,
    resourceType: "User",
    resourceId: newUser.id,
    metadata: { email: parsed.data.email, role: parsed.data.role },
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

  await createAuditLog({
    userId: session.user.id,
    action: AuditAction.USER_UPDATE,
    resourceType: "User",
    resourceId: id,
    metadata: { newRole: role },
  })

  revalidatePath("/settings/users")
  return { success: true }
}

export async function deleteUser(id: string) {
  const session = await requireAdmin()

  if (session.user.id === id) {
    return { error: "You cannot delete your own account." }
  }

  await prisma.user.delete({ where: { id } })

  await createAuditLog({
    userId: session.user.id,
    action: AuditAction.USER_DELETE,
    resourceType: "User",
    resourceId: id,
  })

  revalidatePath("/settings/users")
  return { success: true }
}

export async function resetPassword(id: string, newPassword: string) {
  const session = await requireAdmin()

  const { valid, errors } = validatePassword(newPassword)
  if (!valid) {
    return { error: errors[0] }
  }

  const hashed = await bcrypt.hash(newPassword, 12)
  await prisma.user.update({ where: { id }, data: { password: hashed } })

  await createAuditLog({
    userId: session.user.id,
    action: AuditAction.PASSWORD_RESET,
    resourceType: "User",
    resourceId: id,
  })

  return { success: true }
}
