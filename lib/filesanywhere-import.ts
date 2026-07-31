import { prisma } from "@/lib/prisma"
import { decryptSecret } from "@/lib/crypto"
import { getIntegration } from "@/lib/integration-store"
import { sftpListFiles, sftpDownloadText, joinRemote, type SftpConn } from "@/lib/filesanywhere-sftp"
import { parseCsv, matchGlob } from "@/lib/csv"
import { toProperCase } from "@/lib/name-format"
import { logIntegrationEvent } from "@/lib/integration-log"

// Config stored on the Integration row (provider "filesanywhere"). The SFTP
// password is encrypted in `passwordEnc`.
export interface FaConfig {
  host: string
  port: number
  userName: string
  passwordEnc: string
  folderPath: string
  filenamePattern: string
  objectSlug: string                        // custom object key for the visit/appointment
  providerMap: Record<string, string>       // provider field key (native or cp_<id>) → CSV header; matched on "npi"
  appointmentMap: Record<string, string>    // object property id → CSV header
  // Schedule (America/Chicago): run daily, or weekly on a chosen day, at `hour`.
  frequency: "daily" | "weekly"
  dayOfWeek: number                         // 0=Sun … 6=Sat (weekly only)
  hour: number                              // 0–23
  lastRunAt: string | null
  lastImportedFile: string | null
  importedFiles?: string[]                  // every file name imported, so we don't re-import
}

export interface FaImportResult {
  file?: string
  rows?: number
  providersCreated?: number
  appointmentsCreated?: number
  skipped?: boolean
  error?: string
}

// Due when the current America/Chicago hour (and weekday, if weekly) matches the
// schedule, and it hasn't already run this period.
export function faImportDue(cfg: Partial<FaConfig> | null | undefined): boolean {
  if (!cfg?.frequency) return false
  const now = new Date()
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "2-digit", hourCycle: "h23" }).format(now))
  if (Number(cfg.hour ?? -1) !== hour) return false
  if (cfg.frequency === "weekly") {
    const wd = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short" }).format(now)
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
    if ((cfg.dayOfWeek ?? -1) !== dayMap[wd]) return false
  }
  // Guard against a second run in the same period (cron could fire twice/hour).
  if (cfg.lastRunAt) {
    const gap = Date.now() - new Date(cfg.lastRunAt).getTime()
    const minGap = cfg.frequency === "weekly" ? 6 * 86_400_000 : 20 * 3_600_000
    if (gap < minGap) return false
  }
  return true
}

async function objectDefId(slug: string): Promise<string | null> {
  const d = await (prisma as any).customObjectDef.findUnique({ where: { key: slug }, select: { id: true } }).catch(() => null)
  return d?.id ?? null
}

// A single practice imported referring providers hang off of (they must have one).
async function defaultImportPractice(): Promise<string> {
  const name = "External Referrals (Imported)"
  const found = await prisma.referringPractice.findFirst({ where: { name }, select: { id: true } })
  if (found) return found.id
  const created = await prisma.referringPractice.create({ data: { name } })
  return created.id
}

async function ensureAssociationDef(a: string, b: string) {
  const existing = await (prisma as any).objectAssociationDef.findFirst({ where: { OR: [{ typeA: a, typeB: b }, { typeA: b, typeB: a }] } })
  if (!existing) await (prisma as any).objectAssociationDef.create({ data: { typeA: a, typeB: b, label: null } })
}

async function ensureAssociation(fromType: string, fromId: string, toType: string, toId: string) {
  const dup = await (prisma as any).objectAssociation.findFirst({
    where: { OR: [{ fromType, fromId, toType, toId }, { fromType: toType, fromId: toId, toType: fromType, toId: fromId }] },
  })
  if (!dup) await (prisma as any).objectAssociation.create({ data: { fromType, fromId, toType, toId } })
}

// Find a referring provider by NPI (then by name), or create one from the mapped
// fields (native columns + custom properties). Returns its id, or null when the
// row has no provider info.
async function resolveProvider(row: Record<string, string>, map: Record<string, string>, practiceId: string, counter: { created: number }): Promise<string | null> {
  const npi = map.npi ? (row[map.npi] ?? "").trim() : ""
  const name = map.name ? toProperCase((row[map.name] ?? "").trim()) : ""

  if (npi) {
    const byNpi = await prisma.referringDoctor.findFirst({ where: { npi }, select: { id: true } })
    if (byNpi) return byNpi.id
  } else if (name) {
    const byName = await prisma.referringDoctor.findFirst({ where: { practiceId, name: { equals: name, mode: "insensitive" } }, select: { id: true } })
    if (byName) return byName.id
  } else {
    return null
  }

  // Build create data from the mapping — native columns direct, custom props in the bag.
  const data: Record<string, any> = { practiceId }
  const customBag: Record<string, any> = {}
  for (const [key, col] of Object.entries(map)) {
    if (!col) continue
    const val = (row[col] ?? "").trim()
    if (key.startsWith("cp_")) customBag[key.slice(3)] = val
    else if (key === "name") data.name = toProperCase(val) || null
    else data[key] = val || null
  }
  if (!data.name) data.name = "Unknown Provider"
  if (Object.keys(customBag).length) data.customProperties = customBag

  const created = await prisma.referringDoctor.create({ data: data as any, select: { id: true } })
  counter.created++
  return created.id
}

const MAX_ROWS = 5000

function connOf(cfg: FaConfig): SftpConn {
  return { host: cfg.host, port: cfg.port || 22, username: cfg.userName, password: decryptSecret(cfg.passwordEnc) }
}

function patchConfig(cfg: FaConfig, extra: Partial<FaConfig>) {
  return (prisma as any).integration.update({ where: { provider: "filesanywhere" }, data: { config: { ...cfg, ...extra } } })
}

// Turn every CSV row into a referring provider (by NPI) + an appointment record,
// associated together.
async function processCsv(cfg: FaConfig, defId: string, practiceId: string, text: string): Promise<{ rows: number; providersCreated: number; appointmentsCreated: number }> {
  const { rows } = parseCsv(text)
  const counter = { created: 0 }
  let appointmentsCreated = 0
  for (const row of rows.slice(0, MAX_ROWS)) {
    try {
      const providerId = await resolveProvider(row, cfg.providerMap ?? {}, practiceId, counter)
      const values: Record<string, any> = {}
      for (const [propId, col] of Object.entries(cfg.appointmentMap ?? {})) if (col) values[propId] = row[col] ?? ""
      const appt = await (prisma as any).customObjectRecord.create({ data: { objectDefId: defId, values }, select: { id: true } })
      appointmentsCreated++
      if (providerId) await ensureAssociation(`CO:${cfg.objectSlug}`, appt.id, "PROVIDER", providerId)
    } catch { /* skip a bad row, keep importing */ }
  }
  return { rows: rows.length, providersCreated: counter.created, appointmentsCreated }
}

async function prepImport(cfg: FaConfig): Promise<{ defId: string; practiceId: string } | { error: string }> {
  const defId = await objectDefId(cfg.objectSlug)
  if (!defId) return { error: `Object "${cfg.objectSlug}" not found.` }
  await ensureAssociationDef(`CO:${cfg.objectSlug}`, "PROVIDER")
  return { defId, practiceId: await defaultImportPractice() }
}

async function loadConfig(): Promise<FaConfig | { error: string }> {
  const integ = await getIntegration("filesanywhere")
  const cfg = (integ?.config ?? {}) as unknown as FaConfig
  if (!cfg.host || !cfg.passwordEnc || !cfg.objectSlug) return { error: "FilesAnywhere isn't fully configured yet." }
  return cfg
}

// Import one named file (historical backfill). Skips files already imported unless forced.
// `folderPath` overrides the saved folder so you can pull from wherever you're browsing.
export async function runFilesanywhereImportFile(fileName: string, opts: { force?: boolean; folderPath?: string } = {}): Promise<FaImportResult> {
  const cfg = await loadConfig()
  if ("error" in cfg) return cfg
  const dir = (opts.folderPath && opts.folderPath.trim()) || cfg.folderPath
  const imported = cfg.importedFiles ?? []
  if (!opts.force && imported.includes(fileName)) return { file: fileName, skipped: true }
  const prep = await prepImport(cfg)
  if ("error" in prep) return prep
  try {
    const text = await sftpDownloadText(connOf(cfg), joinRemote(dir, fileName))
    const res = await processCsv(cfg, prep.defId, prep.practiceId, text)
    await patchConfig(cfg, { importedFiles: [...imported.filter((f) => f !== fileName), fileName].slice(-500), lastImportedFile: fileName, lastRunAt: new Date().toISOString() })
    logIntegrationEvent({ provider: "filesanywhere", kind: "api", method: "IMPORT", endpoint: fileName, ok: true, message: `${res.appointmentsCreated} appointments, ${res.providersCreated} new providers` }).catch(() => {})
    return { file: fileName, ...res }
  } catch (e: any) {
    logIntegrationEvent({ provider: "filesanywhere", kind: "api", method: "IMPORT", endpoint: fileName, ok: false, message: e?.message ?? "import failed" }).catch(() => {})
    return { error: e?.message ?? "Import failed." }
  }
}

// The scheduled/manual run: import the newest matching file not yet imported.
export async function runFilesanywhereImport(opts: { force?: boolean; scheduled?: boolean } = {}): Promise<FaImportResult> {
  const integ = await getIntegration("filesanywhere")
  if (opts.scheduled && !integ?.enabled) return { skipped: true }
  const cfg = await loadConfig()
  if ("error" in cfg) return cfg

  try {
    const imported = new Set(cfg.importedFiles ?? [])
    const files = (await sftpListFiles(connOf(cfg), cfg.folderPath))
      .filter((f) => matchGlob(f.name, cfg.filenamePattern))
      .sort((a, b) => b.modifyTime - a.modifyTime)
    if (!files.length) { await patchConfig(cfg, { lastRunAt: new Date().toISOString() }); return { error: `No files matching "${cfg.filenamePattern}" in ${cfg.folderPath}` } }

    const target = opts.force ? files[0] : (files.find((f) => !imported.has(f.name)) ?? null)
    if (!target) { await patchConfig(cfg, { lastRunAt: new Date().toISOString() }); return { file: files[0].name, skipped: true } }

    return await runFilesanywhereImportFile(target.name, { force: true })
  } catch (e: any) {
    return { error: e?.message ?? "Import failed." }
  }
}
