import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { authConfig } from "@/auth.config"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { createAuditLog } from "@/lib/audit"
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit"
import { AuditAction } from "@prisma/client"

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      async authorize(credentials, request) {
        const parsed = CredentialsSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { email, password } = parsed.data

        // Extract IP and user agent from request headers
        const ip =
          request?.headers?.get("x-forwarded-for")?.split(",")[0].trim() ??
          request?.headers?.get("x-real-ip") ??
          "unknown"
        const ua = request?.headers?.get("user-agent") ?? undefined

        // Rate limit check (per IP): 5 attempts per 15 minutes
        const rateLimitKey = `login:${ip}`
        const rl = checkRateLimit(rateLimitKey)
        if (!rl.allowed) {
          await createAuditLog({
            action: AuditAction.LOGIN_LOCKED,
            metadata: { email, reason: "rate_limit_exceeded" },
            ipAddress: ip,
            userAgent: ua,
          })
          return null
        }

        // Fetch user
        const user = await prisma.user.findUnique({ where: { email } })

        if (!user) {
          await createAuditLog({
            action: AuditAction.LOGIN_FAILURE,
            metadata: { email, reason: "user_not_found" },
            ipAddress: ip,
            userAgent: ua,
          })
          return null
        }

        // Inactive account check
        if (!user.isActive) {
          await createAuditLog({
            userId: user.id,
            action: AuditAction.LOGIN_FAILURE,
            metadata: { reason: "account_inactive" },
            ipAddress: ip,
            userAgent: ua,
          })
          return null
        }

        // Database-level account lockout check
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          await createAuditLog({
            userId: user.id,
            action: AuditAction.LOGIN_LOCKED,
            metadata: { reason: "account_locked", lockedUntil: user.lockedUntil },
            ipAddress: ip,
            userAgent: ua,
          })
          return null
        }

        // Password verification
        const passwordsMatch = await bcrypt.compare(password, user.password)

        if (!passwordsMatch) {
          const newFailedAttempts = user.failedLoginAttempts + 1
          const shouldLock = newFailedAttempts >= 5

          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: newFailedAttempts,
              lockedUntil: shouldLock ? new Date(Date.now() + 15 * 60 * 1000) : null,
            },
          })

          await createAuditLog({
            userId: user.id,
            action: shouldLock ? AuditAction.LOGIN_LOCKED : AuditAction.LOGIN_FAILURE,
            metadata: { reason: "wrong_password", failedAttempts: newFailedAttempts },
            ipAddress: ip,
            userAgent: ua,
          })

          return null
        }

        // Successful login — reset lockout state and log
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
          },
        })

        resetRateLimit(rateLimitKey)

        await createAuditLog({
          userId: user.id,
          action: AuditAction.LOGIN_SUCCESS,
          ipAddress: ip,
          userAgent: ua,
        })

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          permissions: user.permissions,
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        // Initial login — store from authorize()
        token.id = user.id
        token.role = (user as any).role
        token.permissions = (user as any).permissions ?? []
      } else if (token.id) {
        // Token refresh — re-fetch role and permissions from DB so changes take effect immediately
        const fresh = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { role: true, permissions: true, isActive: true },
        })
        if (fresh) {
          token.role = fresh.role
          token.permissions = fresh.permissions
        }
      }
      return token
    },
  },
})
