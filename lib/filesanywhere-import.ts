import { prisma } from "@/lib/prisma"
import { decryptSecret } from "@/lib/crypto"
import { getIntegration } from "@/lib/integration-store"
import { sftpListFiles, sftpDownloadText, joinRemote, type SftpConn } from "@/lib/filesanywhere-sftp"
import { parseCsv, matchGlob } from "@/lib/csv"
import { logIntegrationEvent } from "@/lib/integration-log"
import { ensureAssociationDef, ensureAssociation } from "@/lib/object-associations"

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
  providerObjectSlug: string                // custom object key for the referring provider
  providerMatchProp: string                 // provider property id used to de-dupe (e.g. the NPI property)
  providerMap: Record<string, string>       // provider property id → CSV header
  appointmentMap: Record<string, string>    // appointment property id → CSV header
  // Schedule (America/Chicago): run daily, or weekly on a chosen day, at `hour`.
  frequency: "daily" | "weekly"
  dayOfWeek: number                         // 0=Sun … 6=Sat (weekly only)
  hour: number                              // 0–23
  lastRunAt: string | null
  lastImportedFile: string | null
  importedFiles?: string[]                  // every file name imported, so we don't re-import
  // Weekly email report of newly-created referring providers + their appointments.
  report?: { enabled: boolean; recipients: string[]; dayOfWeek: number; hour: number; lastSentAt: string | null }
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
  // Guard against a second run in the same scheduled period (the hourly cron could
  // fire twice, or a same-day retry). ~20h covers that without blocking the next
  // weekly run after a mid-week manual "Import now" (which also sets lastRunAt).
  if (cfg.lastRunAt) {
    const gap = Date.now() - new Date(cfg.lastRunAt).getTime()
    if (gap < 20 * 3_600_000) return false
  }
  return true
}

async function objectDefId(slug: string): Promise<string | null> {
  const d = await (prisma as any).customObjectDef.findUnique({ where: { key: slug }, select: { id: true } }).catch(() => null)
  return d?.id ?? null
}

// Highest Record ID currently used for an object, so we can keep numbering sequentially.
async function maxRecordNumber(objectDefId: string): Promise<number> {
  const last = await (prisma as any).customObjectRecord.findFirst({ where: { objectDefId }, orderBy: { recordNumber: "desc" }, select: { recordNumber: true } })
  return last?.recordNumber ?? 0
}

// Map the provider columns for a row into a { propertyId: value } bag.
function providerValues(row: Record<string, string>, map: Record<string, string>): Record<string, string> {
  const values: Record<string, string> = {}
  for (const [propId, col] of Object.entries(map)) if (col) { const v = (row[col] ?? "").trim(); if (v) values[propId] = v }
  return values
}

// Find the referring provider record by its match property (e.g. NPI), or create
// one in the provider custom object. Returns its id, or null when the row has no
// provider info. `counter.provNum` is the running Record ID for new providers.
async function resolveProvider(
  row: Record<string, string>,
  cfg: FaConfig,
  provDefId: string,
  counter: { created: number; provNum: number },
): Promise<string | null> {
  const map = cfg.providerMap ?? {}
  const values = providerValues(row, map)
  if (!Object.keys(values).length) return null // nothing to create/match on

  // De-dupe on the chosen match property (typically NPI) when it has a value.
  const matchProp = cfg.providerMatchProp
  const matchVal = matchProp ? values[matchProp] : ""
  if (matchProp && matchVal) {
    const existing = await (prisma as any).customObjectRecord.findFirst({
      where: { objectDefId: provDefId, values: { path: [matchProp], equals: matchVal } },
      select: { id: true },
    })
    if (existing) return existing.id
  }

  const created = await (prisma as any).customObjectRecord.create({
    data: { objectDefId: provDefId, recordNumber: ++counter.provNum, values },
    select: { id: true },
  })
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

interface Prep { apptDefId: string; provDefId: string }

// Turn every CSV row into a referring provider (matched by NPI) + an appointment
// record, associated via the two custom objects. Both get sequential Record IDs.
async function processCsv(cfg: FaConfig, prep: Prep, text: string): Promise<{ rows: number; providersCreated: number; appointmentsCreated: number }> {
  const { rows } = parseCsv(text)
  const counter = { created: 0, provNum: await maxRecordNumber(prep.provDefId) }
  let apptNum = await maxRecordNumber(prep.apptDefId)
  let appointmentsCreated = 0
  const provType = `CO:${cfg.providerObjectSlug}`
  const apptType = `CO:${cfg.objectSlug}`
  for (const row of rows.slice(0, MAX_ROWS)) {
    try {
      const providerId = await resolveProvider(row, cfg, prep.provDefId, counter)
      const values: Record<string, any> = {}
      for (const [propId, col] of Object.entries(cfg.appointmentMap ?? {})) if (col) values[propId] = row[col] ?? ""
      const appt = await (prisma as any).customObjectRecord.create({ data: { objectDefId: prep.apptDefId, recordNumber: ++apptNum, values }, select: { id: true } })
      appointmentsCreated++
      if (providerId) await ensureAssociation(apptType, appt.id, provType, providerId)
    } catch { /* skip a bad row, keep importing */ }
  }
  return { rows: rows.length, providersCreated: counter.created, appointmentsCreated }
}

async function prepImport(cfg: FaConfig): Promise<Prep | { error: string }> {
  const apptDefId = await objectDefId(cfg.objectSlug)
  if (!apptDefId) return { error: `Appointments object "${cfg.objectSlug}" not found.` }
  const provDefId = await objectDefId(cfg.providerObjectSlug)
  if (!provDefId) return { error: `Referring providers object "${cfg.providerObjectSlug}" not found.` }
  await ensureAssociationDef(`CO:${cfg.objectSlug}`, `CO:${cfg.providerObjectSlug}`)
  return { apptDefId, provDefId }
}

async function loadConfig(): Promise<FaConfig | { error: string }> {
  const integ = await getIntegration("filesanywhere")
  const cfg = (integ?.config ?? {}) as unknown as FaConfig
  if (!cfg.host || !cfg.passwordEnc) return { error: "Connect FilesAnywhere first." }
  if (!cfg.objectSlug || !cfg.providerObjectSlug) return { error: "Pick both the appointments and referring-providers objects first." }
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
    const res = await processCsv(cfg, prep, text)
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

// Undo an import run: delete every record in the appointments + referring-providers
// objects (and their associations), and clear the imported-files history so the
// next run starts clean. Used after a mis-mapped import.
export async function resetFilesanywhereImport(): Promise<{ appointmentsDeleted: number; providersDeleted: number; error?: string }> {
  const integ = await getIntegration("filesanywhere")
  const cfg = (integ?.config ?? {}) as unknown as FaConfig
  let appointmentsDeleted = 0, providersDeleted = 0
  const slugs = [cfg.objectSlug, cfg.providerObjectSlug].filter(Boolean)
  for (const slug of slugs) {
    const defId = await objectDefId(slug)
    if (!defId) continue
    const recs = await (prisma as any).customObjectRecord.findMany({ where: { objectDefId: defId }, select: { id: true } })
    const ids = recs.map((r: any) => r.id)
    if (ids.length) {
      const type = `CO:${slug}`
      await (prisma as any).objectAssociation.deleteMany({ where: { OR: [{ fromType: type, fromId: { in: ids } }, { toType: type, toId: { in: ids } }] } })
      const del = await (prisma as any).customObjectRecord.deleteMany({ where: { id: { in: ids } } })
      if (slug === cfg.providerObjectSlug) providersDeleted += del.count ?? ids.length
      else appointmentsDeleted += del.count ?? ids.length
    }
  }
  // Legacy cleanup: the earlier import created providers in the built-in object
  // under a synthetic practice. Remove those + any associations to them.
  const legacyPractice = await prisma.referringPractice.findFirst({ where: { name: "External Referrals (Imported)" }, select: { id: true } })
  if (legacyPractice) {
    const docs = await prisma.referringDoctor.findMany({ where: { practiceId: legacyPractice.id }, select: { id: true } })
    const docIds = docs.map((d) => d.id)
    if (docIds.length) {
      await (prisma as any).objectAssociation.deleteMany({ where: { OR: [{ fromType: "PROVIDER", fromId: { in: docIds } }, { toType: "PROVIDER", toId: { in: docIds } }] } })
      const del = await prisma.referringDoctor.deleteMany({ where: { id: { in: docIds } } })
      providersDeleted += del.count ?? docIds.length
    }
    await prisma.referringPractice.delete({ where: { id: legacyPractice.id } }).catch(() => {})
  }

  await patchConfig(cfg, { importedFiles: [], lastImportedFile: null })
  return { appointmentsDeleted, providersDeleted }
}
