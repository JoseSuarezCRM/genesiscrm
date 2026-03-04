import { prisma } from "@/lib/prisma"
import { AuditAction, Prisma } from "@prisma/client"
import { headers } from "next/headers"

interface AuditOptions {
  userId?: string | null
  action: AuditAction
  resourceType?: string
  resourceId?: string
  metadata?: Record<string, unknown>
  // Optional overrides — pass explicitly when headers() is unavailable (e.g., in authorize())
  ipAddress?: string
  userAgent?: string
}

export async function createAuditLog(options: AuditOptions): Promise<void> {
  try {
    let ip = options.ipAddress ?? null
    let ua = options.userAgent ?? null

    if (!ip || !ua) {
      try {
        const h = headers()
        ip = ip ?? h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip") ?? null
        ua = ua ?? h.get("user-agent") ?? null
      } catch {
        // headers() throws outside request context — swallow silently
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: options.userId ?? null,
        action: options.action,
        resourceType: options.resourceType ?? null,
        resourceId: options.resourceId ?? null,
        ipAddress: ip,
        userAgent: ua,
        metadata: options.metadata as Prisma.InputJsonValue | undefined,
      },
    })
  } catch (err) {
    // Audit logging must NEVER crash the application
    console.error("[AUDIT] Failed to write audit log:", err)
  }
}
