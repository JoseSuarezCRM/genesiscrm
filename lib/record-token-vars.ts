// The canonical per-object token resolver. Given a record (built-in or custom
// object), it returns every personalization token → value: native fields as
// {snake_case}, custom properties by their internal name AND {cp_<id>}, plus the
// referral cross-object set. Both the record composer and the automation engine
// use this, so there is ONE token catalog/resolver, not two.

import { prisma } from "@/lib/prisma"
import { RECORD_FIELDS } from "@/lib/record-field-catalog"
import { buildReferralVars, REFERRAL_TOKEN_SELECT } from "@/lib/message-tokens"
import { optionLabelFor } from "@/lib/custom-options"
import { formatNumber } from "@/lib/number-format"

// snake_case a field key so it matches the {single_brace} token resolver.
export function snakeToken(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase()
}

function fmtDate(d: string | Date | null | undefined): string {
  return d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" }) : ""
}

function tokenValueForDisplay(v: any): string {
  if (v == null) return ""
  if (Array.isArray(v)) return v.filter(Boolean).join(", ")
  if (v instanceof Date) return fmtDate(v)
  return String(v)
}

// Date + time, e.g. "July 21, 2026 at 9:00 AM" (used for datetime tokens).
function fmtDateTimeToken(v: any): string {
  if (v == null || v === "") return ""
  const d = new Date(v)
  if (isNaN(d.getTime())) return String(v)
  return d.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })
}

// Format a property value for a token, honoring its type. Handles both custom-prop
// UPPER types (DATE/DATE_TIME/DROPDOWN/MULTI_SELECT) and native lower types
// (date/datetime/select/select_or_other). DATE renders date-only so a stored ISO
// (e.g. "2026-08-19T12:00:00.000Z") shows as "Aug 19, 2026", not the raw timestamp.
function tokenValueForProp(type: string | undefined, raw: any, optionLabels?: any, numberFormat?: string | null): string {
  const t = (type ?? "").toUpperCase()
  if (t === "DATE") return fmtDate(raw)
  if (t === "DATE_TIME" || t === "DATETIME") return fmtDateTimeToken(raw)
  if (t === "DROPDOWN" || t === "MULTI_SELECT" || t === "SELECT" || t === "SELECT_OR_OTHER") return optionLabelFor(raw, optionLabels)
  if (t === "NUMBER") return raw == null || raw === "" ? "" : formatNumber(raw, numberFormat as any)
  return tokenValueForDisplay(raw)
}

// Built-in objects that carry a customProperties JSON bag, mapped to their
// CustomProperty entityType.
export const CP_CONTACT: Record<string, { entity: string; delegate: () => any }> = {
  REFERRAL: { entity: "REFERRAL", delegate: () => prisma.referral },
  PROVIDER: { entity: "PROVIDER", delegate: () => prisma.referringDoctor },
  PRACTICE: { entity: "PRACTICE", delegate: () => prisma.referringPractice },
  LOCATION: { entity: "LOCATION", delegate: () => prisma.practiceLocation },
  SURGERY: { entity: "SURGERY", delegate: () => (prisma as any).surgeryCase },
}

// Custom EMAIL/PHONE property values on a built-in record.
async function customPropContact(recordType: string, recordId: string): Promise<{ emails: string[]; phones: string[] }> {
  const meta = CP_CONTACT[recordType]
  if (!meta) return { emails: [], phones: [] }
  const [rec, defs] = await Promise.all([
    meta.delegate().findUnique({ where: { id: recordId }, select: { customProperties: true } }),
    prisma.customProperty.findMany({ where: { entityType: meta.entity as any, type: { in: ["EMAIL", "PHONE"] } as any } }),
  ])
  const bag: Record<string, any> = (rec?.customProperties as any) ?? {}
  const emails: string[] = [], phones: string[] = []
  for (const d of defs) {
    const v = bag[d.id]
    if (!v) continue
    if (d.type === "EMAIL") emails.push(v)
    else phones.push(v)
  }
  return { emails, phones }
}

// The record's email addresses / phone numbers — native columns AND custom props.
export async function contactInfoFor(recordType: string, recordId: string): Promise<{ emails: string[]; phones: string[] }> {
  if (recordType.startsWith("CO:")) {
    const def = await (prisma as any).customObjectDef.findUnique({ where: { key: recordType.slice(3) } })
    const rec = await (prisma as any).customObjectRecord.findUnique({ where: { id: recordId } })
    if (!def || !rec) return { emails: [], phones: [] }
    const props: any[] = (def.properties as any[]) ?? []
    const vals: any = (rec.values as any) ?? {}
    return {
      emails: props.filter((p) => p.type === "EMAIL").map((p) => vals[p.id]).filter(Boolean),
      phones: props.filter((p) => p.type === "PHONE").map((p) => vals[p.id]).filter(Boolean),
    }
  }

  let base: { emails: string[]; phones: string[] } = { emails: [], phones: [] }
  if (recordType === "REFERRAL") {
    const r = await prisma.referral.findUnique({ where: { id: recordId }, select: { patientEmail: true, patientPhone: true } })
    base = { emails: [r?.patientEmail].filter(Boolean) as string[], phones: [r?.patientPhone].filter(Boolean) as string[] }
  } else if (recordType === "PROVIDER") {
    const d = await prisma.referringDoctor.findUnique({ where: { id: recordId }, select: { email: true, phone: true, officePhone: true } })
    base = { emails: [d?.email].filter(Boolean) as string[], phones: [d?.phone, d?.officePhone].filter(Boolean) as string[] }
  } else if (recordType === "PRACTICE") {
    const p = await prisma.referringPractice.findUnique({ where: { id: recordId }, select: { phone: true } })
    base = { emails: [], phones: [p?.phone].filter(Boolean) as string[] }
  } else if (recordType === "LOCATION") {
    const l = await prisma.practiceLocation.findUnique({ where: { id: recordId }, select: { phone: true } })
    base = { emails: [], phones: [l?.phone].filter(Boolean) as string[] }
  } else if (recordType === "SURGERY") {
    const s = await (prisma as any).surgeryCase.findUnique({ where: { id: recordId }, select: { email: true } })
    base = { emails: [s?.email].filter(Boolean) as string[], phones: [] }
  }

  const custom = await customPropContact(recordType, recordId)
  return {
    emails: Array.from(new Set([...base.emails, ...custom.emails])),
    phones: Array.from(new Set([...base.phones, ...custom.phones])),
  }
}

// Every personalization token for a record: native fields ({snake_key}) + custom
// properties (by internal name and {cp_<id>}), plus the referral cross-object set.
export async function buildRecordTokenVars(recordType: string, recordId: string): Promise<Record<string, string>> {
  const vars: Record<string, string> = {}
  const contact = await contactInfoFor(recordType, recordId).catch(() => ({ emails: [], phones: [] }))
  if (contact.emails[0]) vars.patient_email = contact.emails[0]
  if (contact.phones[0]) vars.patient_phone = contact.phones[0]

  if (recordType.startsWith("CO:")) {
    const rec = await (prisma as any).customObjectRecord.findUnique({ where: { id: recordId }, select: { values: true } }).catch(() => null)
    const values: Record<string, any> = (rec?.values as any) ?? {}
    const def = await (prisma as any).customObjectDef.findUnique({ where: { key: recordType.slice(3) }, select: { properties: true } }).catch(() => null)
    for (const p of ((def?.properties as any[]) ?? [])) {
      const v = tokenValueForProp(p.type, values[p.id], p.optionLabels, p.numberFormat)
      vars[`cp_${p.id}`] = v
      vars[p.internalName || snakeToken(p.name)] = v
    }
    return vars
  }

  const meta = CP_CONTACT[recordType]
  if (meta) {
    const [rec, defs] = await Promise.all([
      meta.delegate().findUnique({ where: { id: recordId } }).catch(() => null),
      prisma.customProperty.findMany({ where: { entityType: meta.entity as any } }).catch(() => []),
    ])
    if (rec) {
      for (const f of (RECORD_FIELDS[recordType] ?? [])) {
        vars[snakeToken(f.key)] = tokenValueForProp(f.type, (rec as any)[f.key], (f as any).optionLabels, (f as any).numberFormat)
      }
      const bag: Record<string, any> = (rec.customProperties as any) ?? {}
      for (const d of defs) {
        const v = tokenValueForProp(d.type as any, bag[d.id], (d as any).optionLabels, (d as any).numberFormat)
        vars[`cp_${d.id}`] = v                                   // back-compat token
        vars[(d as any).internalName || snakeToken(d.name)] = v  // readable token
      }
    }
  }

  const appBase = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || ""
  if (recordType === "REFERRAL") {
    const r = await prisma.referral.findUnique({ where: { id: recordId }, select: REFERRAL_TOKEN_SELECT }).catch(() => null)
    if (r) Object.assign(vars, buildReferralVars(r as any, { referralUrl: appBase ? `${appBase}/referrals/${recordId}` : undefined }))
  }
  return vars
}
