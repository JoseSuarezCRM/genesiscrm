// Right-column association cards for any record.
//
// Cards come from the Data Model: every object type associated with this one
// (ObjectAssociationDef) becomes a candidate card, so associating two objects in
// Settings → Data Model immediately makes it selectable in "Customize cards".
// Visibility is stored per object in CardLayout (section RIGHT), like Referrals.

import { getAssociationsFor, getAssociationCardPrefs } from "@/app/actions/associations"

export interface AssocCard {
  /** Registry key of the associated type — also the CardLayout cardName. */
  type: string
  label: string
  records: { id: string; name: string; url: string }[]
  visible: boolean
}

export async function loadAssociationCards(recordType: string, recordId: string): Promise<AssocCard[]> {
  const [groups, prefs] = await Promise.all([
    getAssociationsFor(recordType, recordId),
    getAssociationCardPrefs(recordType),
  ])
  const hidden = new Set(prefs.filter((p: any) => !p.visible).map((p: any) => p.cardType))

  return groups.map((g) => ({
    type: g.type,
    label: g.label,
    records: g.records,
    visible: !hidden.has(g.type),
  }))
}
