"use server"

import { requirePermission } from "@/lib/auth-guard"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { encryptSecret, decryptSecret, maskTail, hasEncryptionKey } from "@/lib/crypto"
import { getIntegration } from "@/lib/integration-store"
import { faLogin, faListFolder, faDownloadText, faDiagnose } from "@/lib/filesanywhere"
import { parseCsv, matchGlob } from "@/lib/csv"
import { runFilesanywhereImport, type FaConfig } from "@/lib/filesanywhere-import"

const PROVIDER = "filesanywhere"
const revalidate = () => revalidatePath("/settings/integrations/filesanywhere")

export interface FaCustomObject { slug: string; label: string; properties: { id: string; name: string; type: string }[] }

export interface FaSettings {
  connected: boolean
  enabled: boolean
  encryptionReady: boolean
  apiKeyHint: string | null
  clientId: number | null
  userName: string | null
  hasPassword: boolean
  folderPath: string
  filenamePattern: string
  objectSlug: string
  providerMap: FaConfig["providerMap"]
  appointmentMap: Record<string, string>
  intervalMinutes: number
  lastRunAt: string | null
  lastImportedFile: string | null
  objects: FaCustomObject[]
}

async function cfgOf(): Promise<Partial<FaConfig>> {
  const row = await getIntegration(PROVIDER)
  return (row?.config ?? {}) as Partial<FaConfig>
}

export async function getFaSettings(): Promise<FaSettings> {
  await requirePermission("MANAGE_USERS")
  const row = await getIntegration(PROVIDER)
  const cfg = (row?.config ?? {}) as Partial<FaConfig>
  const defs = await (prisma as any).customObjectDef.findMany({ orderBy: { order: "asc" } }).catch(() => [])
  const objects: FaCustomObject[] = (defs as any[]).map((d) => ({
    slug: d.key, label: d.plural || d.singular || d.key,
    properties: ((d.properties as any[]) ?? []).map((p) => ({ id: p.id, name: p.name, type: p.type })),
  }))
  return {
    connected: !!row?.apiKeyEnc,
    enabled: !!row?.enabled,
    encryptionReady: hasEncryptionKey(),
    apiKeyHint: row?.apiKeyHint ?? null,
    clientId: cfg.clientId ?? null,
    userName: cfg.userName ?? null,
    hasPassword: !!cfg.passwordEnc,
    folderPath: cfg.folderPath ?? "",
    filenamePattern: cfg.filenamePattern ?? "",
    objectSlug: cfg.objectSlug ?? "",
    providerMap: cfg.providerMap ?? {},
    appointmentMap: cfg.appointmentMap ?? {},
    intervalMinutes: cfg.intervalMinutes ?? 10080,
    lastRunAt: cfg.lastRunAt ?? null,
    lastImportedFile: cfg.lastImportedFile ?? null,
    objects,
  }
}

// Store connection creds (API key + account login). Empty apiKey/password keep the existing.
export async function saveFaConnection(input: { apiKey?: string; clientId: number; userName: string; password?: string }): Promise<{ ok?: boolean; error?: string }> {
  await requirePermission("MANAGE_USERS")
  if (!hasEncryptionKey()) return { error: "ENCRYPTION_KEY isn't set on the server." }
  const cfg = await cfgOf()
  const row = await getIntegration(PROVIDER)
  const apiKeyEnc = input.apiKey?.trim() ? encryptSecret(input.apiKey.trim()) : row?.apiKeyEnc ?? null
  const apiKeyHint = input.apiKey?.trim() ? maskTail(input.apiKey.trim()) : row?.apiKeyHint ?? null
  const passwordEnc = input.password?.trim() ? encryptSecret(input.password.trim()) : cfg.passwordEnc ?? null
  if (!apiKeyEnc) return { error: "Enter the API key." }
  const nextCfg = { ...cfg, clientId: Number(input.clientId) || 0, userName: input.userName.trim(), passwordEnc }
  await (prisma as any).integration.upsert({
    where: { provider: PROVIDER },
    create: { provider: PROVIDER, apiKeyEnc, apiKeyHint, config: nextCfg },
    update: { apiKeyEnc, apiKeyHint, config: nextCfg },
  })
  revalidate()
  return { ok: true }
}

export async function saveFaImportConfig(input: {
  folderPath: string; filenamePattern: string; objectSlug: string
  providerMap: FaConfig["providerMap"]; appointmentMap: Record<string, string>; intervalMinutes: number
}): Promise<{ ok?: boolean; error?: string }> {
  await requirePermission("MANAGE_USERS")
  const cfg = await cfgOf()
  const nextCfg = { ...cfg, ...input }
  await (prisma as any).integration.update({ where: { provider: PROVIDER }, data: { config: nextCfg } })
  revalidate()
  return { ok: true }
}

export async function setFaEnabled(enabled: boolean): Promise<{ ok?: boolean; error?: string }> {
  await requirePermission("MANAGE_USERS")
  try {
    await (prisma as any).integration.update({ where: { provider: PROVIDER }, data: { enabled } })
    revalidate()
    return { ok: true }
  } catch (e: any) { return { error: e?.message ?? "Couldn't update." } }
}

// Login + list matching files (a connection/source check).
export async function testFaConnection(): Promise<{ files?: { name: string; modified: string | null }[]; error?: string }> {
  await requirePermission("MANAGE_USERS")
  const row = await getIntegration(PROVIDER)
  const cfg = (row?.config ?? {}) as Partial<FaConfig>
  if (!row?.apiKeyEnc || !cfg.passwordEnc) return { error: "Save the connection first." }
  try {
    const session = await faLogin(decryptSecret(row.apiKeyEnc), cfg.clientId ?? 0, cfg.userName ?? "", decryptSecret(cfg.passwordEnc))
    const files = (await faListFolder(decryptSecret(row.apiKeyEnc), session, cfg.folderPath ?? "/", 1))
      .filter((f) => f.entryType === 1 && matchGlob(f.name, cfg.filenamePattern ?? "*"))
      .slice(0, 10)
      .map((f) => ({ name: f.name, modified: f.lastModified }))
    return { files }
  } catch (e: any) { return { error: e?.message ?? "Connection failed." } }
}

// Download the newest matching file and return its CSV column headers, for mapping.
export async function loadFaColumns(): Promise<{ columns?: string[]; file?: string; error?: string }> {
  await requirePermission("MANAGE_USERS")
  const row = await getIntegration(PROVIDER)
  const cfg = (row?.config ?? {}) as Partial<FaConfig>
  if (!row?.apiKeyEnc || !cfg.passwordEnc) return { error: "Save the connection first." }
  try {
    const apiKey = decryptSecret(row.apiKeyEnc)
    const session = await faLogin(apiKey, cfg.clientId ?? 0, cfg.userName ?? "", decryptSecret(cfg.passwordEnc))
    const files = (await faListFolder(apiKey, session, cfg.folderPath ?? "/", 1))
      .filter((f) => f.entryType === 1 && matchGlob(f.name, cfg.filenamePattern ?? "*"))
      .sort((a, b) => (b.lastModified ?? "").localeCompare(a.lastModified ?? ""))
    const newest = files[0]
    if (!newest) return { error: "No matching files found." }
    const text = await faDownloadText(apiKey, session, newest.key)
    return { columns: parseCsv(text).headers, file: newest.name }
  } catch (e: any) { return { error: e?.message ?? "Couldn't read the file." } }
}

export async function runFaImportNow(): Promise<import("@/lib/filesanywhere-import").FaImportResult> {
  await requirePermission("MANAGE_USERS")
  return runFilesanywhereImport({ force: true })
}

// Non-secret diagnostic: what login returns (region URL, ids) + a raw root listing.
export async function faDiagnostics(): Promise<{ result?: any; error?: string }> {
  await requirePermission("MANAGE_USERS")
  const row = await getIntegration(PROVIDER)
  const cfg = (row?.config ?? {}) as Partial<FaConfig>
  if (!row?.apiKeyEnc || !cfg.passwordEnc) return { error: "Save the connection first." }
  try {
    return { result: await faDiagnose(decryptSecret(row.apiKeyEnc), cfg.clientId ?? 0, cfg.userName ?? "", decryptSecret(cfg.passwordEnc)) }
  } catch (e: any) {
    return { error: e?.message ?? "Diagnostics failed." }
  }
}
