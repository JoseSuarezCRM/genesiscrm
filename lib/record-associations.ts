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

export interface AssocCard {
  /** Registry key of the associated type — also the preference's cardType. */
  type: string
  label: string
  records: { id: string; name: string; url: string }[]
  visible: boolean
  /** Native FK relations can't be linked/unlinked from the card. */
  native?: boolean
}

type Rec = { id: string; name: string; url: string }

const providerName = (d: any) => (d.title ? `${d.name}, ${d.title}` : d.name)
const referralName = (r: any) => `${r.patientFirstName ?? ""} ${r.patientLastName ?? ""}`.trim() || "Referral"

async function nativeCards(recordType: string, recordId: string): Promise<Omit<AssocCard, "visible">[]> {
  const cards: Omit<AssocCard, "visible">[] = []

  if (recordType === "PROVIDER") {
    const d = await prisma.referringDoctor.findUnique({
      where: { id: recordId },
      include: {
        practice: { select: { id: true, name: true } },
        locations: { include: { location: { select: { id: true, name: true } } } },
        referrals: { orderBy: { referralDate: "desc" }, take: 50, select: { id: true, patientFirstName: true, patientLastName: true } },
      },
    })
    if (!d) return cards
    cards.push({ type: "NATIVE_PRACTICE", label: "Practice", native: true, records: d.practice ? [{ id: d.practice.id, name: d.practice.name, url: `/practices/${d.practice.id}` }] : [] })
    cards.push({ type: "NATIVE_LOCATIONS", label: "Locations", native: true, records: d.locations.map((l) => ({ id: l.location.id, name: l.location.name, url: `/locations/${l.location.id}` })) })
    cards.push({ type: "NATIVE_REFERRALS", label: "Referrals", native: true, records: d.referrals.map((r) => ({ id: r.id, name: referralName(r), url: `/referrals/${r.id}` })) })
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
    if (!l) return cards
    cards.push({ type: "NATIVE_PRACTICE", label: "Practice", native: true, records: [{ id: l.practice.id, name: l.practice.name, url: `/practices/${l.practice.id}` }] })
    cards.push({ type: "NATIVE_PROVIDERS", label: "Providers", native: true, records: l.doctors.map((d) => ({ id: d.doctor.id, name: providerName(d.doctor), url: `/referring-doctors/${d.doctor.id}` })) })
    cards.push({ type: "NATIVE_REFERRALS", label: "Referrals", native: true, records: l.referrals.map((r) => ({ id: r.id, name: referralName(r), url: `/referrals/${r.id}` })) })
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
    if (!p) return cards
    cards.push({ type: "NATIVE_LOCATIONS", label: "Locations", native: true, records: p.locations.map((l) => ({ id: l.id, name: l.name, url: `/locations/${l.id}` })) })
    cards.push({ type: "NATIVE_PROVIDERS", label: "Providers", native: true, records: p.doctors.map((d) => ({ id: d.id, name: providerName(d), url: `/referring-doctors/${d.id}` })) })
    cards.push({ type: "NATIVE_REFERRALS", label: "Referrals", native: true, records: p.referrals.map((r) => ({ id: r.id, name: referralName(r), url: `/referrals/${r.id}` })) })
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
    if (!r) return cards
    const practice: Rec[] = r.referringPractice ? [{ id: r.referringPractice.id, name: r.referringPractice.name, url: `/practices/${r.referringPractice.id}` }] : []
    const provider: Rec[] = r.referringDoctor ? [{ id: r.referringDoctor.id, name: providerName(r.referringDoctor), url: `/referring-doctors/${r.referringDoctor.id}` }] : []
    const location: Rec[] = r.referringLocation ? [{ id: r.referringLocation.id, name: r.referringLocation.name, url: `/locations/${r.referringLocation.id}` }] : []
    cards.push({ type: "NATIVE_PRACTICE", label: "Practice", native: true, records: practice })
    cards.push({ type: "NATIVE_PROVIDER", label: "Provider", native: true, records: provider })
    cards.push({ type: "NATIVE_LOCATION", label: "Location", native: true, records: location })
  }

  return cards
}

export async function loadAssociationCards(recordType: string, recordId: string): Promise<AssocCard[]> {
  const [native, groups, prefs] = await Promise.all([
    nativeCards(recordType, recordId),
    getAssociationsFor(recordType, recordId),
    getAssociationCardPrefs(recordType),
  ])

  const hidden = new Set(prefs.filter((p: any) => !p.visible).map((p: any) => p.cardType))
  const orderOf = new Map<string, number>(prefs.map((p: any) => [p.cardType, p.order]))

  const all: AssocCard[] = [
    ...native.map((c) => ({ ...c, visible: !hidden.has(c.type) })),
    ...groups.map((g) => ({ type: g.type, label: g.label, records: g.records, visible: !hidden.has(g.type) })),
  ]
  // Apply the saved order; cards without a saved order keep their natural position.
  return all
    .map((c, i) => ({ c, i, o: orderOf.has(c.type) ? orderOf.get(c.type)! : 1000 + i }))
    .sort((a, b) => a.o - b.o || a.i - b.i)
    .map((x) => x.c)
}
