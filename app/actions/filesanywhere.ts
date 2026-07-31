"use server"

import { requirePermission } from "@/lib/auth-guard"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { encryptSecret, decryptSecret, hasEncryptionKey } from "@/lib/crypto"
import { getIntegration } from "@/lib/integration-store"
import { sftpListFiles, sftpDownloadText, sftpList, joinRemote, type SftpConn } from "@/lib/filesanywhere-sftp"
import { parseCsv, matchGlob } from "@/lib/csv"
import { runFilesanywhereImport, type FaConfig } from "@/lib/filesanywhere-import"
import { RECORD_FIELDS } from "@/lib/record-field-catalog"

const PROVIDER = "filesanywhere"
const revalidate = () => revalidatePath("/settings/integrations/filesanywhere")

export interface FaCustomObject { slug: string; label: string; properties: { id: string; name: string; type: string }[] }
export interface FaField { key: string; name: string; isCustom: boolean }

export interface FaSettings {
  connected: boolean
  enabled: boolean
  encryptionReady: boolean
  host: string
  port: number
  userName: string | null
  hasPassword: boolean
  folderPath: string
  filenamePattern: string
  objectSlug: string
  providerMap: Record<string, string>
  appointmentMap: Record<string, string>
  frequency: "daily" | "weekly"
  dayOfWeek: number
  hour: number
  lastRunAt: string | null
  lastImportedFile: string | null
  objects: FaCustomObject[]
  providerFields: FaField[]
}

async function cfgOf(): Promise<Partial<FaConfig>> {
  const row = await getIntegration(PROVIDER)
  return (row?.config ?? {}) as Partial<FaConfig>
}

function connFromCfg(cfg: Partial<FaConfig>): SftpConn {
  return { host: cfg.host ?? "", port: cfg.port ?? 22, username: cfg.userName ?? "", password: decryptSecret(cfg.passwordEnc ?? "") }
}

export async function getFaSettings(): Promise<FaSettings> {
  await requirePermission("MANAGE_USERS")
  const cfg = await cfgOf()
  const row = await getIntegration(PROVIDER)
  const defs = await (prisma as any).customObjectDef.findMany({ orderBy: { order: "asc" } }).catch(() => [])
  const objects: FaCustomObject[] = (defs as any[]).map((d) => ({
    slug: d.key, label: d.plural || d.singular || d.key,
    properties: ((d.properties as any[]) ?? []).map((p) => ({ id: p.id, name: p.name, type: p.type })),
  }))

  // The Referring Providers object's mappable fields: native columns + custom properties.
  const provCustom = await (prisma as any).customProperty.findMany({ where: { entityType: "PROVIDER" }, orderBy: { createdAt: "asc" } }).catch(() => [])
  const providerFields: FaField[] = [
    ...((RECORD_FIELDS as any).PROVIDER ?? []).filter((f: any) => !f.readOnly).map((f: any) => ({ key: f.key, name: f.label, isCustom: false })),
    ...(provCustom as any[]).map((c) => ({ key: `cp_${c.id}`, name: c.name, isCustom: true })),
  ]
  return {
    connected: !!(cfg.host && cfg.userName && cfg.passwordEnc),
    enabled: !!row?.enabled,
    encryptionReady: hasEncryptionKey(),
    host: cfg.host ?? "",
    port: cfg.port ?? 22,
    userName: cfg.userName ?? null,
    hasPassword: !!cfg.passwordEnc,
    folderPath: cfg.folderPath ?? "",
    filenamePattern: cfg.filenamePattern ?? "",
    objectSlug: cfg.objectSlug ?? "",
    providerMap: cfg.providerMap ?? {},
    appointmentMap: cfg.appointmentMap ?? {},
    frequency: cfg.frequency ?? "weekly",
    dayOfWeek: cfg.dayOfWeek ?? 1,
    hour: cfg.hour ?? 6,
    lastRunAt: cfg.lastRunAt ?? null,
    lastImportedFile: cfg.lastImportedFile ?? null,
    objects,
    providerFields,
  }
}

// Store the SFTP connection (host/port/user + encrypted password). Empty password keeps the existing.
export async function saveFaConnection(input: { host: string; port: number; userName: string; password?: string }): Promise<{ ok?: boolean; error?: string }> {
  await requirePermission("MANAGE_USERS")
  if (!hasEncryptionKey()) return { error: "ENCRYPTION_KEY isn't set on the server." }
  const cfg = await cfgOf()
  if (!input.host?.trim() || !input.userName?.trim()) return { error: "Host and username are required." }
  const passwordEnc = input.password?.trim() ? encryptSecret(input.password.trim()) : cfg.passwordEnc ?? null
  if (!passwordEnc) return { error: "Enter the password." }
  const nextCfg = { ...cfg, host: input.host.trim(), port: Number(input.port) || 22, userName: input.userName.trim(), passwordEnc }
  await (prisma as any).integration.upsert({
    where: { provider: PROVIDER },
    create: { provider: PROVIDER, config: nextCfg },
    update: { config: nextCfg },
  })
  revalidate()
  return { ok: true }
}

export async function saveFaImportConfig(input: {
  folderPath: string; filenamePattern: string; objectSlug: string
  providerMap: Record<string, string>; appointmentMap: Record<string, string>
  frequency: "daily" | "weekly"; dayOfWeek: number; hour: number
}): Promise<{ ok?: boolean; error?: string }> {
  await requirePermission("MANAGE_USERS")
  const cfg = await cfgOf()
  await (prisma as any).integration.update({ where: { provider: PROVIDER }, data: { config: { ...cfg, ...input } } })
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

// Connect over SFTP + list everything at the path (files AND folders, unfiltered),
// plus how many files match the pattern — so we can find the right folder.
export async function testFaConnection(pathOverride?: string): Promise<{ entries?: { name: string; modified: string | null; dir: boolean }[]; matched?: number; path?: string; error?: string }> {
  await requirePermission("MANAGE_USERS")
  const cfg = await cfgOf()
  if (!cfg.host || !cfg.passwordEnc) return { error: "Save the connection first." }
  const path = (pathOverride && pathOverride.trim()) || cfg.folderPath || "/"
  try {
    const all = await sftpList(connFromCfg(cfg), path)
    const matched = all.filter((e) => e.type === "-" && matchGlob(e.name, cfg.filenamePattern ?? "*")).length
    const entries = all
      .sort((a, b) => (a.type === "d" ? -1 : 1) - (b.type === "d" ? -1 : 1) || b.modifyTime - a.modifyTime)
      .slice(0, 40)
      .map((e) => ({ name: e.name, modified: e.modifyTime ? new Date(e.modifyTime).toISOString() : null, dir: e.type === "d" }))
    return { entries, matched, path }
  } catch (e: any) { return { error: e?.message ?? "Connection failed." } }
}

// Download the newest matching file and return its CSV column headers, for mapping.
export async function loadFaColumns(folderPath?: string, filenamePattern?: string): Promise<{ columns?: string[]; file?: string; error?: string }> {
  await requirePermission("MANAGE_USERS")
  const cfg = await cfgOf()
  if (!cfg.host || !cfg.passwordEnc) return { error: "Save the connection first." }
  const dir = (folderPath && folderPath.trim()) || cfg.folderPath || "/"
  const pattern = (filenamePattern && filenamePattern.trim()) || cfg.filenamePattern || "*"
  try {
    const conn = connFromCfg(cfg)
    const files = (await sftpListFiles(conn, dir))
      .filter((f) => matchGlob(f.name, pattern))
      .sort((a, b) => b.modifyTime - a.modifyTime)
    const newest = files[0]
    if (!newest) return { error: `No files matching "${pattern}" in ${dir}.` }
    const text = await sftpDownloadText(conn, joinRemote(dir, newest.name))
    return { columns: parseCsv(text).headers, file: newest.name }
  } catch (e: any) { return { error: e?.message ?? "Couldn't read the file." } }
}

export async function runFaImportNow(): Promise<import("@/lib/filesanywhere-import").FaImportResult> {
  await requirePermission("MANAGE_USERS")
  return runFilesanywhereImport({ force: true })
}
