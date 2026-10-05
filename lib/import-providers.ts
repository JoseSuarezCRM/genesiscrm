// Import into Providers (the native ReferringDoctor table) — the counterpart of
// the custom-object path in app/actions/import-records.ts, sharing its run/undo
// bookkeeping (ImportRun / ImportRunChange / ImportRunAssoc). Plain module: the
// caller has already checked PROVIDERS Edit.
//
// A provider always belongs to a practice, so a row is resolved like this:
//   practice  Org Name Rules, then a case-insensitive name match (the public
//             referral form's rule). Created only when a provider is created.
//   provider  Record ID, else NPI within that practice, else name within that
//             practice. NPI alone is not a key here: the same doctor is entered
//             once per practice, so one NPI can sit on several providers.
//   locations Linked when they match a location of the provider's practice by
//             name or address. Never created; an unknown one is reported.
//
// Like the custom-object import, it fires no workflow triggers — a bulk import
// must not mass-enroll records.

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { applyRules } from "@/lib/org-rules-utils"
import { toProperCase } from "@/lib/name-format"
import { coerceValue } from "@/lib/import-coerce"
import { resolveTargetId } from "@/lib/import-resolve"
import { ensureAssociation, ensureAssociationDef } from "@/lib/object-associations"
import { RECORD_ID_TARGET, type ImportBatchResult, type ImportConfig } from "@/lib/import-types"

// Mapper targets that aren't columns on ReferringDoctor.
export const PROVIDER_PRACTICE = "__practice"
export const PROVIDER_LOCATIONS = "__locations"
export const PROVIDER_OWNER = "__owner"

// Practice and location links are the native fields above, so the generic
// "Associate → …" targets leave them out.
export const PROVIDER_NATIVE_LINK_TYPES = ["PRACTICE", "LOCATION"]

export interface ProviderImportField {
  id: string
  name: string
  type: string
  options?: string[]
  optionLabels?: Record<string, string>
  aliases?: string[]
}

// Native fields, in mapper order. Labels match the provider record page.
export const PROVIDER_IMPORT_FIELDS: ProviderImportField[] = [
  { id: "name", name: "Name", type: "TEXT", aliases: ["Provider", "Provider Name", "Full Name", "Doctor", "Physician"] },
  { id: "title", name: "Title", type: "TEXT", aliases: ["Credentials", "Credential", "Degree"] },
  { id: "specialty", name: "Specialty", type: "TEXT", aliases: ["Speciality"] },
  {
    id: "contactType", name: "Contact Type", type: "DROPDOWN", aliases: ["Type"],
    options: ["PROVIDER", "STAFF"], optionLabels: { PROVIDER: "Provider", STAFF: "Staff" },
  },
  { id: "npi", name: "NPI", type: "TEXT", aliases: ["NPI Number", "NPI #", "NPI No"] },
  { id: "phone", name: "Cell Phone", type: "PHONE", aliases: ["Cell", "Mobile", "Phone", "Mobile Phone"] },
  { id: "officePhone", name: "Office Phone", type: "PHONE", aliases: ["Office Number", "Work Phone"] },
  { id: "email", name: "Email", type: "EMAIL", aliases: ["Email Address", "E-mail"] },
  { id: PROVIDER_PRACTICE, name: "Practice", type: "TEXT", aliases: ["Practice Name", "Organization", "Org", "Group"] },
  { id: PROVIDER_LOCATIONS, name: "Locations", type: "TEXT", aliases: ["Location", "Office", "Offices", "Office Location"] },
  { id: PROVIDER_OWNER, name: "Provider Owner", type: "TEXT", aliases: ["Owner", "Record Owner"] },
]

const COLUMN_FIELDS = new Map(
  PROVIDER_IMPORT_FIELDS.filter((f) => !f.id.startsWith("__")).map((f) => [f.id, f]),
)

const DOCTOR_SELECT = {
  id: true, name: true, title: true, specialty: true, contactType: true, npi: true,
  phone: true, officePhone: true, email: true, practiceId: true, ownerId: true, customProperties: true,
} as const

type Doctor = { id: string; practiceId: string; ownerId: string | null; customProperties: unknown } & Record<string, unknown>

const isEmail = (s: string) => z.string().email().safeParse(s).success
const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim()
const valueKey = (v: unknown) => (typeof v === "object" ? JSON.stringify(v) : String(v))

export async function runProviderImportBatch(
  config: ImportConfig,
  rows: Record<string, string>[],
  startIndex: number,
  runId: string | undefined,
  uid: string,
): Promise<ImportBatchResult> {
  const result: ImportBatchResult = { created: 0, updated: 0, skipped: 0, errors: [], practicesCreated: 0 }
  const changes: { runId: string; kind: string; recordId: string; before?: any }[] = []
  const assocs: { runId: string; fromType: string; fromId: string; toType: string; toId: string }[] = []

  const entries = Object.entries(config.fieldMap)
  const colFor = (target: string) => entries.find(([, t]) => t === target)?.[0] ?? null
  const recordIdCol = colFor(RECORD_ID_TARGET)
  const practiceCol = colFor(PROVIDER_PRACTICE)
  const locationsCol = colFor(PROVIDER_LOCATIONS)
  const ownerCol = colFor(PROVIDER_OWNER)
  const nameCol = colFor("name")
  const npiCol = colFor("npi")
  const nativeCols = entries.filter(([, t]) => COLUMN_FIELDS.has(t))

  const customProps = await prisma.customProperty.findMany({ where: { entityType: "PROVIDER" } })
  const propById = new Map(customProps.map((p) => [p.id, p]))
  const cpCols = entries
    .filter(([, t]) => t.startsWith("cp_") && propById.has(t.slice(3)))
    .map(([col, t]) => [col, t.slice(3)] as const)

  const rules = practiceCol ? await prisma.orgNameRule.findMany({ orderBy: { order: "asc" } }) : []

  // Owner cells name a user by email or full name; an ambiguous name resolves to nothing.
  const usersByKey = new Map<string, string | null>()
  if (ownerCol) {
    const users = await prisma.user.findMany({ select: { id: true, name: true, email: true } })
    for (const u of users) {
      if (u.email) usersByKey.set(u.email.toLowerCase(), u.id)
      if (u.name) {
        const k = squash(u.name)
        usersByKey.set(k, usersByKey.has(k) && usersByKey.get(k) !== u.id ? null : u.id)
      }
    }
  }

  // Unique custom properties: the values already taken, loaded once per batch.
  const uniqueIds = cpCols.map(([, id]) => id).filter((id) => propById.get(id)!.unique)
  const taken = new Map<string, Map<string, string>>(uniqueIds.map((id) => [id, new Map()]))
  if (uniqueIds.length) {
    const all = await prisma.referringDoctor.findMany({ select: { id: true, customProperties: true } })
    for (const d of all) {
      const bag = (d.customProperties as Record<string, unknown>) ?? {}
      for (const id of uniqueIds) if (bag[id] != null && bag[id] !== "") taken.get(id)!.set(valueKey(bag[id]), d.id)
    }
  }

  const practiceCache = new Map<string, string | null>()
  async function findPractice(name: string): Promise<string | null> {
    const k = name.toLowerCase()
    if (!practiceCache.has(k)) {
      const p = await prisma.referringPractice.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { id: true } })
      practiceCache.set(k, p?.id ?? null)
    }
    return practiceCache.get(k)!
  }

  const locationCache = new Map<string, { id: string; name: string; address: string | null }[]>()
  async function locationsOf(practiceId: string) {
    if (!locationCache.has(practiceId)) {
      locationCache.set(practiceId, await prisma.practiceLocation.findMany({ where: { practiceId }, select: { id: true, name: true, address: true } }))
    }
    return locationCache.get(practiceId)!
  }

  const coDefCache = new Map<string, string>()

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = startIndex + i + 2 // +2: 1-based + header row, matching the spreadsheet
    const cell = (col: string | null) => (col ? (row[col] ?? "").trim() : "")
    try {
      // 1. The practice, read-only — nothing is created for a row that ends up skipped.
      const rawPractice = cell(practiceCol)
      const practiceName = rawPractice ? applyRules(rawPractice, rules) : ""
      const practiceId = practiceName ? await findPractice(practiceName) : null

      // 2. Match an existing provider.
      let existing: Doctor | null = null
      let byRecordId = false
      const idRaw = cell(recordIdCol)
      if (idRaw) {
        existing = (await prisma.referringDoctor.findUnique({ where: { id: idRaw }, select: DOCTOR_SELECT })) as Doctor | null
        byRecordId = !!existing
      }
      const npi = cell(npiCol)
      if (!existing && practiceId && npi) {
        existing = (await prisma.referringDoctor.findFirst({ where: { practiceId, npi }, select: DOCTOR_SELECT })) as Doctor | null
      }
      const rawName = cell(nameCol)
      const name = rawName ? toProperCase(rawName) : ""
      if (!existing && practiceId && name) {
        existing = (await prisma.referringDoctor.findFirst({
          where: { practiceId, name: { equals: name, mode: "insensitive" } }, select: DOCTOR_SELECT,
        })) as Doctor | null
      }

      // 3. Mode.
      const isUpdate = !!existing
      if (isUpdate && config.mode === "createOnly") { result.skipped++; continue }
      if (!isUpdate && config.mode === "updateOnly") { result.skipped++; continue }
      if (!isUpdate && (!name || !practiceName)) {
        result.errors.push({ row: rowNum, message: "A new provider needs a Name and a Practice" })
        result.skipped++
        continue
      }

      // 4. Coerce every mapped cell before writing anything; one bad cell skips the row.
      const columns: Record<string, unknown> = {}
      const custom: Record<string, unknown> = {}
      let ownerId: string | null = null
      let cellError: string | null = null
      for (const [col, fieldId] of nativeCols) {
        const f = COLUMN_FIELDS.get(fieldId)!
        const res = coerceValue(f.type, row[col] ?? "", { options: f.options, optionLabels: f.optionLabels })
        if ("error" in res) { cellError = `${f.name}: ${res.error}`; break }
        if ("skip" in res) continue
        let v = res.value as string
        if (fieldId === "name") v = toProperCase(v)
        if (fieldId === "email" && !isEmail(v)) { cellError = `Email: "${v}" is not a valid email address`; break }
        columns[fieldId] = v
      }
      if (!cellError) {
        for (const [col, propId] of cpCols) {
          const p = propById.get(propId)!
          const res = coerceValue(p.type, row[col] ?? "", { options: p.options, optionLabels: p.optionLabels })
          if ("error" in res) { cellError = `${p.name}: ${res.error}`; break }
          if ("skip" in res) continue
          const holder = taken.get(propId)?.get(valueKey(res.value))
          if (holder && holder !== existing?.id) { cellError = `${p.name}: another provider already uses "${row[col]}"`; break }
          custom[propId] = res.value
        }
      }
      const ownerRaw = cell(ownerCol)
      if (!cellError && ownerRaw) {
        ownerId = usersByKey.get(ownerRaw.toLowerCase()) ?? usersByKey.get(squash(ownerRaw)) ?? null
        if (!ownerId) cellError = `Provider Owner: no single user matches "${ownerRaw}"`
      }
      if (!cellError && isUpdate && typeof columns.name === "string") {
        const clash = await prisma.referringDoctor.findFirst({
          where: { practiceId: existing!.practiceId, name: { equals: columns.name, mode: "insensitive" }, id: { not: existing!.id } },
          select: { id: true },
        })
        if (clash) cellError = `Name: another provider in this practice is already named "${columns.name}"`
      }
      if (cellError) { result.errors.push({ row: rowNum, message: cellError }); result.skipped++; continue }

      // An import never moves a provider between practices.
      if (byRecordId && practiceName && practiceId !== existing!.practiceId) {
        result.errors.push({ row: rowNum, message: `Practice "${practiceName}" differs from this provider's practice — not changed; move the provider from its page` })
      }

      // Locations, matched inside the practice the provider is (or will be) in.
      const locationIds: string[] = []
      const locRaw = cell(locationsCol)
      const linkPractice = isUpdate ? existing!.practiceId : practiceId
      if (locRaw) {
        const known = linkPractice ? await locationsOf(linkPractice) : []
        for (const part of locRaw.split(";").map((s) => s.trim()).filter(Boolean)) {
          const want = squash(part)
          const hit = known.find((l) => squash(l.name) === want || (l.address && squash(l.address) === want))
          if (hit) { if (!locationIds.includes(hit.id)) locationIds.push(hit.id) }
          else result.errors.push({ row: rowNum, message: `Location "${part}" isn't one of this practice's locations — not linked` })
        }
      }

      // 5/6. Write.
      let doctorId: string
      if (isUpdate) {
        const prev = existing!
        const prevBag = (prev.customProperties as Record<string, unknown>) ?? {}
        const before: Record<string, unknown> = {}
        for (const k of Object.keys(columns)) before[k] = prev[k] ?? null
        for (const k of Object.keys(custom)) before[`cp_${k}`] = prevBag[k] ?? null
        if (ownerId) before.ownerId = prev.ownerId ?? null
        await prisma.referringDoctor.update({
          where: { id: prev.id },
          data: {
            ...columns,
            ...(Object.keys(custom).length ? { customProperties: { ...prevBag, ...custom } as any } : {}),
            ...(ownerId ? { ownerId } : {}),
            updatedById: uid,
          },
        })
        doctorId = prev.id
        // Links are added, never removed; only new ones are logged for Undo.
        const have = new Set((await prisma.doctorLocation.findMany({ where: { doctorId }, select: { locationId: true } })).map((l) => l.locationId))
        for (const locationId of locationIds) {
          if (have.has(locationId)) continue
          await prisma.doctorLocation.create({ data: { doctorId, locationId } })
          if (runId) assocs.push({ runId, fromType: "PROVIDER", fromId: doctorId, toType: "LOCATION", toId: locationId })
        }
        result.updated++
        if (runId) changes.push({ runId, kind: "update", recordId: doctorId, before })
      } else {
        let pid = practiceId
        if (!pid) {
          const created = await prisma.referringPractice.create({ data: { name: practiceName, ownerId: uid, createdById: uid }, select: { id: true } })
          pid = created.id
          practiceCache.set(practiceName.toLowerCase(), pid)
          result.practicesCreated!++
          if (runId) changes.push({ runId, kind: "create_practice", recordId: pid })
        }
        const doctor = await prisma.referringDoctor.create({
          data: {
            ...(columns as any),
            name,
            practiceId: pid,
            customProperties: custom as any,
            ownerId: ownerId ?? uid,
            createdById: uid,
            ...(locationIds.length ? { locations: { create: locationIds.map((locationId) => ({ locationId })) } } : {}),
          },
          select: { id: true },
        })
        doctorId = doctor.id
        result.created++
        if (runId) changes.push({ runId, kind: "create", recordId: doctorId })
      }
      for (const [propId, v] of Object.entries(custom)) taken.get(propId)?.set(valueKey(v), doctorId)

      // Generic associations, by the related record's id / Record ID.
      for (const { column, targetType } of config.assocMap) {
        const raw = (row[column] ?? "").trim()
        if (!raw) continue
        if (PROVIDER_NATIVE_LINK_TYPES.includes(targetType)) {
          result.errors.push({ row: rowNum, message: "Use the Practice and Locations fields to link those" })
          continue
        }
        const targetId = await resolveTargetId(targetType, raw, coDefCache)
        if (!targetId) { result.errors.push({ row: rowNum, message: `Couldn't find ${targetType} "${raw}" to associate` }); continue }
        await ensureAssociationDef("PROVIDER", targetType)
        const created = await ensureAssociation("PROVIDER", doctorId, targetType, targetId)
        if (runId && created) assocs.push({ runId, fromType: "PROVIDER", fromId: doctorId, toType: targetType, toId: targetId })
      }
    } catch (e) {
      result.errors.push({ row: rowNum, message: e instanceof Error ? e.message : String(e) })
      result.skipped++
    }
  }

  if (runId) {
    if (changes.length) await (prisma as any).importRunChange.createMany({ data: changes }).catch(() => {})
    if (assocs.length) await (prisma as any).importRunAssoc.createMany({ data: assocs }).catch(() => {})
    await (prisma as any).importRun.update({ where: { id: runId }, data: { created: { increment: result.created }, updated: { increment: result.updated } } }).catch(() => {})
  }
  return result
}

/**
 * Reverse a provider import: remove the links it added, restore the fields it
 * overwrote, delete the providers it created and then the practices it created.
 * A created provider or practice that has since been put to use — referrals,
 * notes, activities, other providers — is kept and counted instead: deleting a
 * provider cascades to its notes and activity links.
 */
export async function undoProviderImportRun(runId: string): Promise<{ deleted: number; restored: number; associationsRemoved: number; kept: number }> {
  const [changes, assocRows] = await Promise.all([
    (prisma as any).importRunChange.findMany({ where: { runId } }) as Promise<{ kind: string; recordId: string; before: any }[]>,
    (prisma as any).importRunAssoc.findMany({ where: { runId } }) as Promise<{ fromType: string; fromId: string; toType: string; toId: string }[]>,
  ])

  let associationsRemoved = 0
  for (const a of assocRows) {
    const res = a.toType === "LOCATION"
      ? await prisma.doctorLocation.deleteMany({ where: { doctorId: a.fromId, locationId: a.toId } }).catch(() => ({ count: 0 }))
      : await (prisma as any).objectAssociation.deleteMany({
        where: { OR: [{ fromType: a.fromType, fromId: a.fromId, toType: a.toType, toId: a.toId }, { fromType: a.toType, fromId: a.toId, toType: a.fromType, toId: a.fromId }] },
      }).catch(() => ({ count: 0 }))
    associationsRemoved += res.count ?? 0
  }

  let restored = 0
  for (const c of changes.filter((c) => c.kind === "update")) {
    const rec = await prisma.referringDoctor.findUnique({ where: { id: c.recordId }, select: { customProperties: true } }).catch(() => null)
    if (!rec) continue
    const columns: Record<string, unknown> = {}
    const bag: Record<string, unknown> = { ...((rec.customProperties as Record<string, unknown>) ?? {}) }
    for (const [k, v] of Object.entries((c.before as Record<string, unknown>) ?? {})) {
      if (k.startsWith("cp_")) bag[k.slice(3)] = v
      else columns[k] = v
    }
    await prisma.referringDoctor.update({ where: { id: c.recordId }, data: { ...columns, customProperties: bag as any } }).catch(() => {})
    restored++
  }

  let deleted = 0
  let kept = 0
  const createdIds = changes.filter((c) => c.kind === "create").map((c) => c.recordId)
  for (let i = 0; i < createdIds.length; i += 1000) {
    const docs = await prisma.referringDoctor.findMany({
      where: { id: { in: createdIds.slice(i, i + 1000) } },
      select: { id: true, _count: { select: { referrals: true, providerNotes: true, activities: true } } },
    })
    const free = docs.filter((d) => !d._count.referrals && !d._count.providerNotes && !d._count.activities).map((d) => d.id)
    kept += docs.length - free.length
    if (free.length) {
      const res = await prisma.referringDoctor.deleteMany({ where: { id: { in: free } } }).catch(() => ({ count: 0 }))
      deleted += res.count
      await (prisma as any).objectAssociation.deleteMany({ where: { OR: [{ fromId: { in: free } }, { toId: { in: free } }] } }).catch(() => {})
    }
  }

  const practiceIds = changes.filter((c) => c.kind === "create_practice").map((c) => c.recordId)
  if (practiceIds.length) {
    const practices = await prisma.referringPractice.findMany({
      where: { id: { in: practiceIds } },
      select: { id: true, _count: { select: { doctors: true, referrals: true, locations: true, activities: true } } },
    })
    const free = practices.filter((p) => !p._count.doctors && !p._count.referrals && !p._count.locations && !p._count.activities).map((p) => p.id)
    kept += practices.length - free.length
    if (free.length) {
      await prisma.referringPractice.deleteMany({ where: { id: { in: free } } }).catch(() => {})
      await (prisma as any).objectAssociation.deleteMany({ where: { OR: [{ fromId: { in: free } }, { toId: { in: free } }] } }).catch(() => {})
    }
  }

  return { deleted, restored, associationsRemoved, kept }
}
