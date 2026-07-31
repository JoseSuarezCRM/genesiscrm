import { prisma } from "@/lib/prisma"
import { decryptSecret } from "@/lib/crypto"
import { getIntegration } from "@/lib/integration-store"
import { faLogin, faListFolder, faDownloadText } from "@/lib/filesanywhere"
import { parseCsv, matchGlob } from "@/lib/csv"
import { toProperCase } from "@/lib/name-format"
import { logIntegrationEvent } from "@/lib/integration-log"

// Config stored on the Integration row (provider "filesanywhere"). apiKey lives in
// apiKeyEnc; the account password is encrypted here in `passwordEnc`.
export interface FaConfig {
  clientId: number
  userName: string
  passwordEnc: string
  folderPath: string
  filenamePattern: string
  objectSlug: string                        // custom object key for the visit/appointment
  providerMap: { name?: string; npi?: string; phone?: string; officePhone?: string } // provider field → CSV header
  appointmentMap: Record<string, string>    // object property id → CSV header
  intervalMinutes: number
  lastRunAt: string | null
  lastImportedFile: string | null
}

export interface FaImportResult {
  file?: string
  rows?: number
  providersCreated?: number
  appointmentsCreated?: number
  skipped?: boolean
  error?: string
}

export function faImportDue(cfg: Partial<FaConfig> | null | undefined): boolean {
  if (!cfg?.intervalMinutes) return false
  if (!cfg.lastRunAt) return true
  return Date.now() - new Date(cfg.lastRunAt).getTime() >= cfg.intervalMinutes * 60_000
}

async function objectDefId(slug: string): Promise<string | null> {
  const d = await (prisma as any).customObjectDef.findUnique({ where: { key: slug }, select: { id: true } }).catch(() => null)
  return d?.id ?? null
}

// A single practice that imported referring providers hang off of (they must have one).
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

// Find a referring provider by NPI (then by name), or create one. Returns its id,
// or null when the row has no provider info.
async function resolveProvider(row: Record<string, string>, map: FaConfig["providerMap"], practiceId: string, counter: { created: number }): Promise<string | null> {
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

  const created = await prisma.referringDoctor.create({
    data: {
      name: name || "Unknown Provider",
      npi: npi || null,
      phone: map.phone ? (row[map.phone] || null) : null,
      officePhone: map.officePhone ? (row[map.officePhone] || null) : null,
      practiceId,
    },
    select: { id: true },
  })
  counter.created++
  return created.id
}

const MAX_ROWS = 5000

// Pull the newest matching file and turn each row into a referring provider (by
// NPI) + an appointment record, associated together. Imports each file once.
export async function runFilesanywhereImport(opts: { force?: boolean } = {}): Promise<FaImportResult> {
  const integ = await getIntegration("filesanywhere")
  if (!integ || !integ.enabled) return { skipped: true }
  const cfg = (integ.config ?? {}) as unknown as FaConfig
  if (!integ.apiKeyEnc || !cfg.passwordEnc || !cfg.objectSlug) return { error: "FilesAnywhere isn't fully configured yet." }

  const apiKey = decryptSecret(integ.apiKeyEnc)
  const password = decryptSecret(cfg.passwordEnc)

  const patchConfig = (extra: Partial<FaConfig>) =>
    (prisma as any).integration.update({ where: { provider: "filesanywhere" }, data: { config: { ...cfg, ...extra } } })

  try {
    const session = await faLogin(apiKey, cfg.clientId, cfg.userName, password)
    const files = (await faListFolder(apiKey, session, cfg.folderPath, 1))
      .filter((f) => f.entryType === 1 && matchGlob(f.name, cfg.filenamePattern))
      .sort((a, b) => (b.lastModified ?? "").localeCompare(a.lastModified ?? ""))
    const newest = files[0]
    if (!newest) { await patchConfig({ lastRunAt: new Date().toISOString() }); return { error: `No files matching "${cfg.filenamePattern}" in ${cfg.folderPath}` } }

    if (!opts.force && cfg.lastImportedFile === newest.name) {
      await patchConfig({ lastRunAt: new Date().toISOString() })
      return { file: newest.name, skipped: true }
    }

    const text = await faDownloadText(apiKey, session, newest.key)
    const { rows } = parseCsv(text)

    const defId = await objectDefId(cfg.objectSlug)
    if (!defId) return { error: `Object "${cfg.objectSlug}" not found.` }
    await ensureAssociationDef(`CO:${cfg.objectSlug}`, "PROVIDER")
    const practiceId = await defaultImportPractice()

    const counter = { created: 0 }
    let appointmentsCreated = 0
    for (const row of rows.slice(0, MAX_ROWS)) {
      const providerId = await resolveProvider(row, cfg.providerMap ?? {}, practiceId, counter)
      const values: Record<string, any> = {}
      for (const [propId, col] of Object.entries(cfg.appointmentMap ?? {})) if (col) values[propId] = row[col] ?? ""
      const appt = await (prisma as any).customObjectRecord.create({ data: { objectDefId: defId, values }, select: { id: true } })
      appointmentsCreated++
      if (providerId) await ensureAssociation(`CO:${cfg.objectSlug}`, appt.id, "PROVIDER", providerId)
    }

    await patchConfig({ lastImportedFile: newest.name, lastRunAt: new Date().toISOString() })
    logIntegrationEvent({ provider: "filesanywhere", kind: "api", method: "IMPORT", endpoint: newest.name, ok: true, message: `${appointmentsCreated} appointments, ${counter.created} new providers` }).catch(() => {})
    return { file: newest.name, rows: rows.length, providersCreated: counter.created, appointmentsCreated }
  } catch (e: any) {
    logIntegrationEvent({ provider: "filesanywhere", kind: "api", method: "IMPORT", endpoint: "import", ok: false, message: e?.message ?? "import failed" }).catch(() => {})
    return { error: e?.message ?? "Import failed." }
  }
}
