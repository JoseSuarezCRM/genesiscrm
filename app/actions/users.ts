"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { createAuditLog } from "@/lib/audit"
import { PasswordSchema, validatePassword } from "@/lib/password-policy"
import { sendEmail } from "@/lib/graph-mailer"
import bcrypt from "bcryptjs"
import crypto from "crypto"
import { Role, AuditAction } from "@prisma/client"

function appBaseUrl(): string {
  return (process.env.NEXTAUTH_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")).replace(/\/$/, "")
}

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
  return { success: true, userId: newUser.id }
}

// ─── User invitations ─────────────────────────────────────────────────────────

const InviteUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  role: z.nativeEnum(Role),
  permissions: z.array(z.string()).optional(),
})

async function sendInviteEmail(email: string, name: string, token: string) {
  const link = `${appBaseUrl()}/accept-invite/${token}`
  const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1e293b;">
    <h2 style="font-size:18px;margin:0 0 12px;">You're invited to Genesis Ortho CRM</h2>
    <p>Hi ${name || "there"}, you've been invited to join the Genesis Ortho CRM. Click below to set your password and activate your account.</p>
    <p style="margin:24px 0;"><a href="${link}" style="background:#0f172a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Set up your account</a></p>
    <p style="color:#64748b;font-size:13px;">Or paste this link into your browser:<br/>${link}</p>
    <p style="color:#94a3b8;font-size:12px;">This invitation expires in 7 days.</p>
  </div>`
  return sendEmail(email, "Your Genesis Ortho CRM invitation", html, { sender: "referrals" })
}

// Create a pending user and email them an invite to set their own password.
export async function inviteUser(data: unknown) {
  const session = await requireAdmin()
  const parsed = InviteUserSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  if (existing) return { error: { email: ["Email already in use"] } }

  const token = crypto.randomBytes(32).toString("hex")
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  // Unusable random password until they set their own via the invite link.
  const placeholder = await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 12)

  const newUser = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      password: placeholder,
      role: parsed.data.role,
      permissions: parsed.data.permissions ?? [],
      isActive: false,
      inviteToken: token,
      inviteTokenExpires: expires,
    },
  })

  const mail = await sendInviteEmail(parsed.data.email, parsed.data.name, token)

  await createAuditLog({
    userId: session.user.id,
    action: AuditAction.USER_CREATE,
    resourceType: "User",
    resourceId: newUser.id,
    metadata: { email: parsed.data.email, role: parsed.data.role, invited: true },
  })

  revalidatePath("/settings/users")
  return {
    success: true,
    userId: newUser.id,
    inviteLink: `${appBaseUrl()}/accept-invite/${token}`,
    emailSent: mail.success,
    emailError: mail.success ? undefined : mail.error,
  }
}

// Regenerate the token and re-send the invite email for a still-pending user.
export async function resendInvite(userId: string) {
  await requireAdmin()
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return { error: "User not found" }
  if (user.isActive) return { error: "This user has already accepted their invitation." }

  const token = crypto.randomBytes(32).toString("hex")
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  await prisma.user.update({ where: { id: userId }, data: { inviteToken: token, inviteTokenExpires: expires } })

  const mail = await sendInviteEmail(user.email, user.name ?? "", token)
  revalidatePath("/settings/users")
  return {
    success: true,
    inviteLink: `${appBaseUrl()}/accept-invite/${token}`,
    emailSent: mail.success,
    emailError: mail.success ? undefined : mail.error,
  }
}

// Public: look up a pending invite by token (for the accept-invite page).
export async function getInvite(token: string) {
  if (!token) return null
  return prisma.user.findFirst({
    where: { inviteToken: token, inviteTokenExpires: { gt: new Date() }, isActive: false },
    select: { email: true, name: true },
  })
}

// Public: the invited user sets their own password, activating the account.
export async function acceptInvite(token: string, password: string) {
  if (!token) return { error: "Invalid invitation link." }
  const user = await prisma.user.findFirst({
    where: { inviteToken: token, inviteTokenExpires: { gt: new Date() }, isActive: false },
  })
  if (!user) return { error: "This invitation is invalid or has expired. Ask an admin to resend it." }

  const check = validatePassword(password)
  if (!check.valid) return { error: check.errors[0] ?? "Password does not meet the requirements." }

  const hashed = await bcrypt.hash(password, 12)
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed, isActive: true, inviteToken: null, inviteTokenExpires: null, failedLoginAttempts: 0, lockedUntil: null },
  })

  await createAuditLog({
    userId: user.id,
    action: AuditAction.USER_UPDATE,
    resourceType: "User",
    resourceId: user.id,
    metadata: { acceptedInvite: true },
  }).catch(() => {})

  return { success: true, email: user.email }
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

export async function updateUserPermissions(id: string, permissions: string[]) {
  try {
    await requireAdmin()
    await prisma.user.update({ where: { id }, data: { permissions: { set: permissions } } })
    revalidatePath("/settings/users")
    return { success: true, error: null }
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Failed to update permissions." }
  }
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
