import crypto from "crypto"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit } from "@/lib/rate-limit"
import { logIntegrationEvent } from "@/lib/integration-log"
import type { ApiScope } from "@/lib/api-scopes"

export { API_SCOPES, API_SCOPE_KEYS } from "@/lib/api-scopes"
export type { ApiScope } from "@/lib/api-scopes"

export function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex")
}

// A fresh token: the plaintext (shown once), a non-secret display prefix, and the
// hash we actually store.
export function generateToken(): { token: string; prefix: string; hash: string } {
  const token = `gosm_${crypto.randomBytes(24).toString("hex")}`
  return { token, prefix: token.slice(0, 12), hash: sha256(token) }
}

export function apiError(status: number, message: string, code?: string) {
  return NextResponse.json({ error: { message, ...(code ? { code } : {}) } }, { status })
}

export interface AuthedToken { id: string; name: string; scopes: string[] }

// Validate the Bearer token, enforce the required scope + rate limit, and log the
// call. Returns the token, or an error Response to return directly.
export async function authenticateApiRequest(req: Request, scope: ApiScope): Promise<{ token: AuthedToken } | { error: NextResponse }> {
  const header = req.headers.get("authorization") ?? ""
  const m = header.match(/^Bearer\s+(.+)$/i)
  if (!m) return { error: apiError(401, "Missing bearer token. Send 'Authorization: Bearer <api key>'.", "unauthorized") }

  const row = await (prisma as any).apiToken.findUnique({ where: { tokenHash: sha256(m[1].trim()) } }).catch(() => null)
  if (!row || row.revokedAt) return { error: apiError(401, "Invalid or revoked API key.", "unauthorized") }
  if (row.expiresAt && new Date(row.expiresAt) < new Date()) return { error: apiError(401, "API key expired.", "expired") }

  const scopes: string[] = (row.scopes as string[]) ?? []
  if (!scopes.includes(scope)) return { error: apiError(403, `This API key is missing the "${scope}" scope.`, "insufficient_scope") }

  if (!checkRateLimit(`apitoken:${row.id}`).allowed) return { error: apiError(429, "Rate limit exceeded. Slow down and retry.", "rate_limited") }

  // Best-effort bookkeeping + activity log (never blocks the request).
  ;(prisma as any).apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {})
  logIntegrationEvent({ provider: "public-api", kind: "inbound", method: req.method, endpoint: new URL(req.url).pathname, ok: true, status: 200, message: row.name }).catch(() => {})

  return { token: { id: row.id, name: row.name, scopes } }
}
