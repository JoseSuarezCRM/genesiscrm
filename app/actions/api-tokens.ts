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
