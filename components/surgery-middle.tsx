"use client"

import RecordPropertyCards, { type PropertyCard } from "@/components/record-property-cards"
import SurgeryDetailClient from "@/components/surgery-detail-client"
import type { RecordFieldDef } from "@/lib/record-field-catalog"

// Surgery's middle column: property cards (Clinical & Scheduling) AND the functional
// cards (Status, Procedure, Call Attempts, Documents) in one reorderable list.
const KIND_TO_SECTION: Record<string, "STATUS" | "PROCEDURE" | "CALLS" | "DOCUMENTS"> = {
  SURGERY_STATUS: "STATUS",
  SURGERY_PROCEDURE: "PROCEDURE",
  SURGERY_CALLS: "CALLS",
  SURGERY_DOCUMENTS: "DOCUMENTS",
}

export default function SurgeryMiddle({ recordId, cards, catalog, values, canEdit, canEditCards, users, surgeryCase }: {
  recordId: string
  cards: PropertyCard[]
  catalog: RecordFieldDef[]
  values: Record<string, any>
  canEdit: boolean
  canEditCards: boolean
  users: { id: string; label: string }[]
  surgeryCase: any
}) {
  return (
    <RecordPropertyCards
      entityType="SURGERY"
      recordId={recordId}
      cards={cards}
      catalog={catalog}
      values={values}
      canEdit={canEdit}
      canEditCards={canEditCards}
      section="MIDDLE"
      users={users}
      renderFunctional={(card) => {
        const only = KIND_TO_SECTION[card.kind ?? ""]
        return only ? <SurgeryDetailClient surgeryCase={surgeryCase} only={only} /> : null
      }}
    />
  )
}
