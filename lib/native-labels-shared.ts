// Renamed built-in fields — the client-safe half (no Prisma). The server loads
// the renames (lib/native-labels.ts); screens read them through `labelFrom` or
// the `useFieldLabel` hook (components/native-labels-provider.tsx).
//
// The rule (user's decision, 2026-10-07): a field nobody has renamed keeps each
// screen's own wording — the `fallback` every caller passes. Once an admin
// renames it in Settings → Properties, every screen shows the new name.

/** objectType → field key → the admin's label. */
export type NativeLabelMap = Record<string, Record<string, string>>

/**
 * Lists that name their columns differently from the field catalog
 * (lib/record-field-catalog.ts RECORD_FIELDS). Map the list's key to the
 * catalog key so a rename reaches those columns too.
 */
export const FIELD_ALIASES: Record<string, Record<string, string>> = {
  REFERRAL: {
    mrn: "patientMrn", dob: "patientDob", phone: "patientPhone", email: "patientEmail",
    providerName: "referringDoctorName", npi: "referringNpi", insurance: "insuranceProvider",
    apptDate: "appointmentDate", pipeline: "pipelineId", firstName: "patientFirstName", lastName: "patientLastName",
    memberId: "insuranceMemberId", groupNumber: "insuranceGroup", imaging: "imagingType",
  },
  SURGERY: { patient: "patientName" },
  ACTIVITY: { type: "flyer" },
}

export function canonicalFieldKey(objectType: string, key: string): string {
  return FIELD_ALIASES[objectType]?.[key] ?? key
}

/** The admin's name for a built-in field, or the screen's own wording when none. */
export function labelFrom(map: NativeLabelMap | null | undefined, objectType: string, key: string, fallback: string): string {
  return map?.[objectType]?.[canonicalFieldKey(objectType, key)] ?? fallback
}

/** A list of column/field definitions with every renamed field's label replaced. */
export function relabel<T extends { key: string; label: string }>(map: NativeLabelMap | null | undefined, objectType: string, items: T[]): T[] {
  if (!map?.[objectType]) return items
  return items.map((it) => ({ ...it, label: labelFrom(map, objectType, it.key, it.label) }))
}
