"use server"

import { requirePermission } from "@/lib/auth-guard"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { generateToken } from "@/lib/api-tokens"
import { getApiScopeKeys, getApiScopes, type ApiScopeDef } from "@/lib/api-objects"

export interface ApiTokenRow {
  id: string
  name: string
  prefix: string
  scopes: string[]
  lastUsedAt: string | null
  createdAt: string
  revoked: boolean
}

// The live scope catalog (built-in + custom objects) for the key-creation UI.
export async function listApiScopes(): Promise<ApiScopeDef[]> {
  await requirePermission("MANAGE_USERS")
  return getApiScopes()
}

export async function listApiTokens(): Promise<ApiTokenRow[]> {
  await requirePermission("MANAGE_USERS")
  const rows = await (prisma as any).apiToken.findMany({ orderBy: { createdAt: "desc" } })
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    scopes: (r.scopes as string[]) ?? [],
    lastUsedAt: r.lastUsedAt ? new Date(r.lastUsedAt).toISOString() : null,
    createdAt: new Date(r.createdAt).toISOString(),
    revoked: !!r.revokedAt,
  }))
}

// Create a key. The plaintext token is returned ONCE — it can't be retrieved again.
export async function createApiToken(name: string, scopes: string[]): Promise<{ token?: string; prefix?: string; error?: string }> {
  await requirePermission("MANAGE_USERS")
  const clean = (name ?? "").trim()
  if (!clean) return { error: "Give the key a name." }
  const valid = await getApiScopeKeys()
  const chosen = (scopes ?? []).filter((s) => valid.includes(s))
  if (chosen.length === 0) return { error: "Pick at least one scope." }

  const uid = (await auth())?.user?.id ?? null
  const { token, prefix, hash } = generateToken()
  await (prisma as any).apiToken.create({ data: { name: clean, tokenHash: hash, prefix, scopes: chosen, createdById: uid } })
  revalidatePath("/settings/integrations/api-keys")
  return { token, prefix }
}

/**
 * Change what an existing key is allowed to reach.
 *
 * Without this, widening a key meant minting a replacement and updating every
 * service that holds it — and the failure mode is quiet: the old key still
 * works, so whatever is still sending it keeps getting refused for the new
 * scope while looking, from the outside, like the scope was never granted.
 *
 * The secret is untouched. Nothing that already holds the key needs to change,
 * which is the point.
 */
export async function updateApiTokenScopes(
  id: string,
  scopes: string[],
): Promise<{ ok?: boolean; error?: string }> {
  await requirePermission("MANAGE_USERS")

  // Filtered against the live catalog, exactly as creation is: a scope string
  // that no longer exists must not survive an edit just because it was saved
  // before the object it named was deleted.
  const valid = await getApiScopeKeys()
  const chosen = (scopes ?? []).filter((s) => valid.includes(s))
  if (chosen.length === 0) return { error: "Pick at least one scope." }

  try {
    const row = await (prisma as any).apiToken.findUnique({ where: { id } })
    if (!row) return { error: "That key no longer exists." }
    // A revoked key stays revoked. Re-granting scopes on one would quietly
    // bring it back, and a key is revoked precisely when it should not work.
    if (row.revokedAt) return { error: "That key is revoked. Create a new one instead." }

    await (prisma as any).apiToken.update({ where: { id }, data: { scopes: chosen } })
    revalidatePath("/settings/integrations/api-keys")
    return { ok: true }
  } catch (e: any) {
    return { error: e?.message ?? "Couldn't update the key." }
  }
}

export async function revokeApiToken(id: string): Promise<{ ok?: boolean; error?: string }> {
  await requirePermission("MANAGE_USERS")
  try {
    await (prisma as any).apiToken.update({ where: { id }, data: { revokedAt: new Date() } })
    revalidatePath("/settings/integrations/api-keys")
    return { ok: true }
  } catch (e: any) {
    return { error: e?.message ?? "Couldn't revoke the key." }
  }
}

export async function deleteApiToken(id: string): Promise<{ ok?: boolean; error?: string }> {
  await requirePermission("MANAGE_USERS")
  try {
    await (prisma as any).apiToken.delete({ where: { id } })
    revalidatePath("/settings/integrations/api-keys")
    return { ok: true }
  } catch (e: any) {
    return { error: e?.message ?? "Couldn't delete the key." }
  }
}
