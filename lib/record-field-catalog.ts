// The editable properties of each built-in object, used by the left-column
// property cards (same idea as the Referral field catalog): a card groups these
// keys, and each value is click-to-edit inline.

export type RecordFieldType = "text" | "email" | "phone" | "number" | "date" | "select" | "long_text"

export interface RecordFieldDef {
  key: string
  label: string
  type: RecordFieldType
  options?: string[]
  readOnly?: boolean
}

export const RECORD_FIELDS: Record<string, RecordFieldDef[]> = {
  REFERRAL: [
    { key: "patientFirstName", label: "First Name", type: "text" },
    { key: "patientLastName", label: "Last Name", type: "text" },
    { key: "patientMrn", label: "MRN", type: "text" },
    { key: "patientPhone", label: "Phone", type: "phone" },
    { key: "patientEmail", label: "Email", type: "email" },
    { key: "insuranceProvider", label: "Insurance", type: "text" },
    { key: "notes", label: "Notes", type: "long_text" },
  ],
  PROVIDER: [
    { key: "name", label: "Name", type: "text" },
    { key: "title", label: "Title", type: "text" },
    { key: "specialty", label: "Specialty", type: "text" },
    { key: "contactType", label: "Contact Type", type: "select", options: ["PROVIDER", "STAFF"] },
    { key: "npi", label: "NPI", type: "text" },
    { key: "phone", label: "Cell Phone", type: "phone" },
    { key: "officePhone", label: "Office Phone", type: "phone" },
    { key: "email", label: "Email", type: "email" },
  ],
  PRACTICE: [
    { key: "name", label: "Name", type: "text" },
    { key: "phone", label: "Phone", type: "phone" },
    { key: "fax", label: "Fax", type: "phone" },
    { key: "address", label: "Address", type: "text" },
  ],
  LOCATION: [
    { key: "name", label: "Name", type: "text" },
    { key: "phone", label: "Phone", type: "phone" },
    { key: "fax", label: "Fax", type: "phone" },
    { key: "address", label: "Address", type: "text" },
  ],
  SURGERY: [
    { key: "patientName", label: "Patient Name", type: "text" },
    { key: "mrn", label: "MRN", type: "text" },
    { key: "orderingProvider", label: "Ordering Provider", type: "text" },
    { key: "diagnosis", label: "Diagnosis", type: "text" },
    { key: "procedure", label: "Procedure", type: "text" },
    { key: "facility", label: "Facility", type: "text" },
    { key: "email", label: "Email", type: "email" },
    { key: "notes", label: "Notes", type: "long_text" },
  ],
}

// The card a record shows when no layout has been saved yet.
export function defaultCardFor(entityType: string): { cardName: string; title: string; fields: string[] } {
  const label = ({ PROVIDER: "Provider", PRACTICE: "Practice", LOCATION: "Location", SURGERY: "Case" } as Record<string, string>)[entityType] ?? "Record"
  return {
    cardName: "info",
    title: `${label} Information`,
    fields: (RECORD_FIELDS[entityType] ?? []).map((f) => f.key),
  }
}
