// FilesAnywhere Web API (FAWAPI) client — API key + account-credential login,
// folder listing, and file download. Server-only; secrets come from the encrypted
// integration store.
import { logIntegrationEvent } from "@/lib/integration-log"

const BASE = "https://fawapi.filesanywhere.com/api/v1"

export interface FaSession { token: string; userId: number; uid: string }
export interface FaEntry { key: string; name: string; entryType: number; lastModified: string | null; sizeBytes: number }

function authHeaders(apiKey: string, s: FaSession): Record<string, string> {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-ApiKey": apiKey,
    Authorization: `bearer ${s.token}`,
    "X-UserId": String(s.userId),
    "X-Uid": s.uid,
  }
}

// Pull a claim out of the JWT payload (unverified — just to read userIdentity).
function jwtClaim(token: string, claim: string): string | null {
  try {
    const part = token.split(".")[1]
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    return JSON.parse(json)?.[claim] ?? null
  } catch { return null }
}

async function unwrap(res: Response, what: string): Promise<any> {
  const body = await res.text().catch(() => "")
  if (!res.ok) throw new Error(`FilesAnywhere ${what} → ${res.status} ${body.slice(0, 200)}`)
  let j: any
  try { j = JSON.parse(body) } catch { throw new Error(`FilesAnywhere ${what}: bad JSON`) }
  if (j && j.success === false) throw new Error(j.message || j.errorCode || `${what} failed`)
  return j
}

// Log in with the Developer API key + account credentials. MFA accounts can't be
// automated, so we fail clearly if MFA is in play.
export async function faLogin(apiKey: string, clientId: number, userName: string, password: string): Promise<FaSession> {
  const started = Date.now()
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-ApiKey": apiKey },
    body: JSON.stringify({ clientId, userName, password }),
    cache: "no-store",
  })
  const j = await unwrap(res, "login")
  const d = j.data ?? {}
  logIntegrationEvent({ provider: "filesanywhere", kind: "api", method: "POST", endpoint: "/auth/login", ok: true, status: res.status, durationMs: Date.now() - started }).catch(() => {})
  if (d.mfaApplied || (d.mfaDataModel && d.mfaDataModel.mfaMethod > 0)) {
    throw new Error("This FilesAnywhere account has MFA enabled — use a non-MFA service login for automation.")
  }
  if (d.isPasswordExpired) throw new Error("The FilesAnywhere account password is expired.")
  if (!d.token) throw new Error("Login returned no token.")
  // The regular /auth/login response may omit userId; the token always carries
  // both userId and userIdentity claims — use those so X-UserId/X-Uid match.
  const claimUserId = jwtClaim(d.token, "userId")
  const userId = claimUserId != null ? Number(claimUserId) : (d.userId ?? 0)
  const uid = jwtClaim(d.token, "userIdentity") ?? String(userId)
  return { token: d.token, userId, uid }
}

// List files (entryType 1) or folders (0) at a path, newest first.
export async function faListFolder(apiKey: string, s: FaSession, path: string, entryType = 1): Promise<FaEntry[]> {
  const q = new URLSearchParams({ path: path || "/", page: "1", entryType: String(entryType), sortColumn: "Date", sortOrder: "desc" })
  const res = await fetch(`${BASE}/providerentries?${q.toString()}`, { headers: authHeaders(apiKey, s), cache: "no-store" })
  const j = await unwrap(res, "providerentries")
  const rows: any[] = j?.data?.exploreObjects ?? []
  return rows.map((r) => ({ key: r.key, name: r.displayText ?? r.key, entryType: r.entryType, lastModified: r.lastModified ?? null, sizeBytes: r.sizeBytes ?? 0 }))
}

// A single-use signed download URL for a file key.
export async function faGetDownloadUrl(apiKey: string, s: FaSession, key: string): Promise<string> {
  const res = await fetch(`${BASE}/providerentries/files/download`, {
    method: "POST", headers: authHeaders(apiKey, s), body: JSON.stringify({ key }), cache: "no-store",
  })
  const j = await unwrap(res, "files/download")
  const url = j?.data?.[0]?.downloadURL
  if (!url) throw new Error("No download URL returned")
  return url
}

// Download a file's text content (e.g. a CSV).
export async function faDownloadText(apiKey: string, s: FaSession, key: string): Promise<string> {
  const url = await faGetDownloadUrl(apiKey, s, key)
  const res = await fetch(url, { cache: "no-store" }) // signed URL — no auth headers
  if (!res.ok) throw new Error(`FilesAnywhere download → ${res.status}`)
  return res.text()
}
