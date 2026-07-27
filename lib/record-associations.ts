// Right-column association cards for any record.
//
// Two sources, merged into one list:
//  1. NATIVE relations — the FK links a built-in object already has (a Provider's
//     Practice and Locations, a Location's Providers, …). These are read-only links.
//  2. DATA MODEL relations — anything associated in Settings → Data Model
//     (ObjectAssociationDef), including custom objects. These can be linked and
//     unlinked from the card.
//
// Both show up in "Customize cards", so every object has something to customize.
// Visibility is stored per object in AssociationCardPref, keyed by registry key,
// so built-ins and custom objects ("CO:visits") behave identically.

import { prisma } from "@/lib/prisma"
import { getAssociationsFor, getAssociationCardPrefs } from "@/app/actions/associations"
import { resolverFor } from "@/lib/object-registry"
import { RECORD_FIELDS } from "@/lib/record-field-catalog"

export interface CardFieldValue { key: string; label: string; value: string | null }

export interface AssocCard {
  /** Registry key of the associated type — also the preference's cardType. */
  type: string
  label: string
  records: { id: string; name: string; url: string; fields?: CardFieldValue[] }[]
  visible: boolean
  /** Native FK relation (vs a Data-Model objectAssociation). */
  native?: boolean
  /** For native cards: the object type to search when adding a link. */
  addType?: string
  /** For native cards: whether a link can be removed (nullable FK / join row). */
  removable?: boolean
  /** Field keys of the associated object shown under each record's name. */
  selectedFields?: string[]
  /** Fields the user can choose to show on this card (for the customize modal). */
  availableFields?: { key: string; label: string }[]
}

type Rec = { id: string; name: string; url: string; fields?: CardFieldValue[] }

// The object type whose records a card lists (for loading extra field values).
function cardObjectType(card: { type: string; native?: boolean; addType?: string }): string {
  return card.native ? (card.addType ?? card.type) : card.type
}

const CARD_DELEGATES: Record<string, () => any> = {
  REFERRAL: () => prisma.referral,
  PROVIDER: () => prisma.referringDoctor,
  PRACTICE: () => prisma.referringPractice,
  LOCATION: () => prisma.practiceLocation,
  SURGERY: () => (prisma as any).surgeryCase,
}

function fmtFieldValue(v: any): string | null {
  if (v == null || v === "") return null
  if (v instanceof Date) return v.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" })
  if (Array.isArray(v)) return v.filter(Boolean).join(", ") || null
  return String(v)
}

// Fields the user may show on a card for a given associated object type.
async function availableFieldsFor(type: string): Promise<{ key: string; label: string }[]> {
  if (type.startsWith("CO:")) {
    const def = await (prisma as any).customObjectDef.findUnique({ where: { key: type.slice(3) }, select: { properties: true } })
    return ((def?.properties as any[]) ?? []).map((p) => ({ key: p.id, label: p.name as string }))
  }
  // The record's own fields, minus the primary name (already the card's blue title).
  return (RECORD_FIELDS[type] ?? []).filter((f) => f.key !== "name").map((f) => ({ key: f.key, label: f.label }))
}

// Values of `fieldKeys` for each record id of `type`, keyed by record id.
async function loadCardFieldValues(type: string, ids: string[], fieldKeys: string[]): Promise<Map<string, CardFieldValue[]>> {
  const out = new Map<string, CardFieldValue[]>()
  if (!ids.length || !fieldKeys.length) return out

  if (type.startsWith("CO:")) {
    const def = await (prisma as any).customObjectDef.findUnique({ where: { key: type.slice(3) }, select: { properties: true } })
    const props: any[] = (def?.properties as any[]) ?? []
    const recs = await (prisma as any).customObjectRecord.findMany({ where: { id: { in: ids } }, select: { id: true, values: true } })
    for (const r of recs) {
      const vals: Record<string, any> = (r.values as any) ?? {}
      out.set(r.id, fieldKeys.map((k) => ({ key: k, label: (props.find((p) => p.id === k)?.name as string) ?? k, value: fmtFieldValue(vals[k]) })))
    }
    return out
  }

  const model = CARD_DELEGATES[type]?.()
  if (!model) return out
  const defs = RECORD_FIELDS[type] ?? []
  const recs = await model.findMany({ where: { id: { in: ids } } })
  for (const r of recs) {
    out.set(r.id, fieldKeys.map((k) => ({ key: k, label: defs.find((d) => d.key === k)?.label ?? k, value: fmtFieldValue((r as any)[k]) })))
  }
  return out
}

const providerName = (d: any) => (d.title ? `${d.name}, ${d.title}` : d.name)
const referralName = (r: any) => `${r.patientFirstName ?? ""} ${r.patientLastName ?? ""}`.trim() || "Referral"

// The object type you search when adding to a native card. Kept in sync with the
// same mapping in app/actions/associations.ts.
function nativeCardObjectType(cardType: string): string {
  if (cardType === "NATIVE_PRACTICE") return "PRACTICE"
  if (cardType === "NATIVE_PROVIDER" || cardType === "NATIVE_PROVIDERS") return "PROVIDER"
  if (cardType === "NATIVE_LOCATION" || cardType === "NATIVE_LOCATIONS") return "LOCATION"
  return "REFERRAL"
}

// Extra records of `otherType` linked to (type,id) via objectAssociation — the
// "additional" side of the practice↔location / practice↔provider many-to-many
// (beyond the primary FK, whose ids are excluded).
async function assocRecs(type: string, id: string, otherType: string, exclude: Set<string>): Promise<Rec[]> {
  const links = await (prisma as any).objectAssociation.findMany({
    where: { OR: [{ fromType: type, fromId: id, toType: otherType }, { fromType: otherType, toType: type, toId: id }] },
  })
  const ids = Array.from(new Set(links.map((l: any) => (l.fromType === otherType ? l.fromId : l.toId)))).filter((x) => !exclude.has(x as string)) as string[]
  if (!ids.length) return []
  const resolver = await resolverFor(otherType)
  const recs = resolver ? await resolver.byIds(ids) : []
  return recs.map((r: any) => ({ id: r.id, name: r.name, url: r.url }))
}

async function nativeCards(recordType: string, recordId: string): Promise<Omit<AssocCard, "visible">[]> {
  // native + (addType, removable) filled in per card at the end.
  const raw: (Omit<AssocCard, "visible" | "native" | "addType" | "removable"> & { removable: boolean })[] = []

  if (recordType === "PROVIDER") {
    const d = await prisma.referringDoctor.findUnique({
      where: { id: recordId },
      include: {
        practice: { select: { id: true, name: true } },
        locations: { include: { location: { select: { id: true, name: true } } } },
        referrals: { orderBy: { referralDate: "desc" }, take: 50, select: { id: true, patientFirstName: true, patientLastName: true } },
      },
    })
    if (!d) return []
    // Primary practice (FK) + any additional linked practices.
    const dFkPractice: Rec[] = d.practice ? [{ id: d.practice.id, name: d.practice.name, url: `/practices/${d.practice.id}` }] : []
    const dExtraPractices = await assocRecs("PROVIDER", recordId, "PRACTICE", new Set(dFkPractice.map((x) => x.id)))
    raw.push({ type: "NATIVE_PRACTICE", label: "Practice", removable: true, records: [...dFkPractice, ...dExtraPractices] })
    raw.push({ type: "NATIVE_LOCATIONS", label: "Locations", removable: true, records: d.locations.map((l) => ({ id: l.location.id, name: l.location.name, url: `/locations/${l.location.id}` })) })
    raw.push({ type: "NATIVE_REFERRALS", label: "Referrals", removable: true, records: d.referrals.map((r) => ({ id: r.id, name: referralName(r), url: `/referrals/${r.id}` })) })
  }

  if (recordType === "LOCATION") {
    const l = await prisma.practiceLocation.findUnique({
      where: { id: recordId },
      include: {
        practice: { select: { id: true, name: true } },
        doctors: { include: { doctor: { select: { id: true, name: true, title: true } } } },
        referrals: { orderBy: { referralDate: "desc" }, take: 50, select: { id: true, patientFirstName: true, patientLastName: true } },
      },
    })
    if (!l) return []
    const lFkPractice: Rec[] = [{ id: l.practice.id, name: l.practice.name, url: `/practices/${l.practice.id}` }]
    const lExtraPractices = await assocRecs("LOCATION", recordId, "PRACTICE", new Set(lFkPractice.map((x) => x.id)))
    raw.push({ type: "NATIVE_PRACTICE", label: "Practice", removable: true, records: [...lFkPractice, ...lExtraPractices] })
    raw.push({ type: "NATIVE_PROVIDERS", label: "Providers", removable: true, records: l.doctors.map((d) => ({ id: d.doctor.id, name: providerName(d.doctor), url: `/referring-doctors/${d.doctor.id}` })) })
    raw.push({ type: "NATIVE_REFERRALS", label: "Referrals", removable: true, records: l.referrals.map((r) => ({ id: r.id, name: referralName(r), url: `/referrals/${r.id}` })) })
  }

  if (recordType === "PRACTICE") {
    const p = await prisma.referringPractice.findUnique({
      where: { id: recordId },
      include: {
        locations: { select: { id: true, name: true } },
        doctors: { select: { id: true, name: true, title: true } },
        referrals: { orderBy: { referralDate: "desc" }, take: 50, select: { id: true, patientFirstName: true, patientLastName: true } },
      },
    })
    if (!p) return []
    // FK-owned locations/providers + any additional linked ones (many-to-many).
    const pFkLocs: Rec[] = p.locations.map((l) => ({ id: l.id, name: l.name, url: `/locations/${l.id}` }))
    const pExtraLocs = await assocRecs("PRACTICE", recordId, "LOCATION", new Set(pFkLocs.map((x) => x.id)))
    const pFkDocs: Rec[] = p.doctors.map((d) => ({ id: d.id, name: providerName(d), url: `/referring-doctors/${d.id}` }))
    const pExtraDocs = await assocRecs("PRACTICE", recordId, "PROVIDER", new Set(pFkDocs.map((x) => x.id)))
    raw.push({ type: "NATIVE_LOCATIONS", label: "Locations", removable: true, records: [...pFkLocs, ...pExtraLocs] })
    raw.push({ type: "NATIVE_PROVIDERS", label: "Providers", removable: true, records: [...pFkDocs, ...pExtraDocs] })
    raw.push({ type: "NATIVE_REFERRALS", label: "Referrals", removable: true, records: p.referrals.map((r) => ({ id: r.id, name: referralName(r), url: `/referrals/${r.id}` })) })
  }

  if (recordType === "REFERRAL") {
    const r = await prisma.referral.findUnique({
      where: { id: recordId },
      include: {
        referringPractice: { select: { id: true, name: true } },
        referringDoctor: { select: { id: true, name: true, title: true } },
        referringLocation: { select: { id: true, name: true } },
      },
    })
    if (!r) return []
    const practice: Rec[] = r.referringPractice ? [{ id: r.referringPractice.id, name: r.referringPractice.name, url: `/practices/${r.referringPractice.id}` }] : []
    const provider: Rec[] = r.referringDoctor ? [{ id: r.referringDoctor.id, name: providerName(r.referringDoctor), url: `/referring-doctors/${r.referringDoctor.id}` }] : []
    const location: Rec[] = r.referringLocation ? [{ id: r.referringLocation.id, name: r.referringLocation.name, url: `/locations/${r.referringLocation.id}` }] : []
    // All three are nullable FKs — freely link/unlink.
    raw.push({ type: "NATIVE_PRACTICE", label: "Practice", removable: true, records: practice })
    raw.push({ type: "NATIVE_PROVIDER", label: "Provider", removable: true, records: provider })
    raw.push({ type: "NATIVE_LOCATION", label: "Location", removable: true, records: location })
  }

  return raw.map((c) => ({ ...c, native: true, addType: nativeCardObjectType(c.type) }))
}

export async function loadAssociationCards(recordType: string, recordId: string): Promise<AssocCard[]> {
  const [native, groups, prefs] = await Promise.all([
    nativeCards(recordType, recordId),
    getAssociationsFor(recordType, recordId),
    getAssociationCardPrefs(recordType),
  ])

  const hidden = new Set(prefs.filter((p: any) => !p.visible).map((p: any) => p.cardType))
  const orderOf = new Map<string, number>(prefs.map((p: any) => [p.cardType, p.order]))
  const fieldsOf = new Map<string, string[]>(prefs.filter((p: any) => Array.isArray(p.fields)).map((p: any) => [p.cardType, p.fields as string[]]))

  const all: AssocCard[] = [
    ...native.map((c) => ({ ...c, visible: !hidden.has(c.type) })),
    ...groups.map((g) => ({ type: g.type, label: g.label, records: g.records, visible: !hidden.has(g.type) })),
  ]

  // Attach the chosen extra fields (values per record) + the list of available
  // fields, so each card can show name + secondary fields and be customized.
  await Promise.all(all.map(async (c) => {
    const objType = cardObjectType(c)
    c.availableFields = await availableFieldsFor(objType)
    const selected = (fieldsOf.get(c.type) ?? []).filter((k) => c.availableFields!.some((f) => f.key === k))
    c.selectedFields = selected
    if (selected.length && c.records.length) {
      const valueMap = await loadCardFieldValues(objType, c.records.map((r) => r.id), selected)
      c.records = c.records.map((r) => ({ ...r, fields: valueMap.get(r.id) ?? [] }))
    }
  }))

  // Apply the saved order; cards without a saved order keep their natural position.
  return all
    .map((c, i) => ({ c, i, o: orderOf.has(c.type) ? orderOf.get(c.type)! : 1000 + i }))
    .sort((a, b) => a.o - b.o || a.i - b.i)
    .map((x) => x.c)
}
