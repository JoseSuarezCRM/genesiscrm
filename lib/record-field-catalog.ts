// The editable properties of each built-in object, used by the left-column
// property cards (same idea as the Referral field catalog): a card groups these
// keys, and each value is click-to-edit inline.

import {
  CLEARANCE_OPTIONS, DENTAL_CLEARANCE_OPTIONS, CT_REQUIRED_OPTIONS,
  GLP1_OPTIONS, DME_OPTIONS, FACILITY_OPTIONS, PHYSICAL_THERAPY_OPTIONS, REFERRAL_PRESETS,
} from "@/lib/surgery-procedures"

export type RecordFieldType = "text" | "email" | "phone" | "number" | "date" | "select" | "long_text" | "user" | "datetime" | "select_or_other"

export interface RecordFieldDef {
  key: string
  label: string
  type: RecordFieldType
  options?: string[]
  readOnly?: boolean
  // For `select_or_other`: the option label that reveals a free-text box (the typed
  // value is stored in the same field), like Physical Therapy's "External".
  otherOption?: string
  // Custom-property default — prefilled when you start editing an empty value.
  default?: string
  // Dependent options: another property's value controls which options show.
  conditional?: { controllingPropertyId: string; rules: Record<string, string[]> }
  // Dropdown/select display labels keyed by the stored internal value.
  optionLabels?: Record<string, string>
}

export const RECORD_FIELDS: Record<string, RecordFieldDef[]> = {
  REFERRAL: [
    { key: "patientFirstName", label: "First Name", type: "text" },
    { key: "patientLastName", label: "Last Name", type: "text" },
    { key: "patientMrn", label: "MRN", type: "text" },
    { key: "patientPhone", label: "Phone", type: "phone" },
    { key: "patientEmail", label: "Email", type: "email" },
    { key: "insuranceProvider", label: "Insurance", type: "text" },
    // Pipeline is an editable select — its options (id→name) are injected in
    // lib/record-cards for the referral. Status/date/owner are read-only here
    // (managed by the referral's own status + assignment controls).
    { key: "pipelineId", label: "Pipeline", type: "select" },
    { key: "status", label: "Status", type: "text", readOnly: true },
    { key: "referralDate", label: "Referral Date", type: "date", readOnly: true },
    { key: "assignedTo", label: "Assigned To", type: "text", readOnly: true },
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
    { key: "facility", label: "Facility", type: "select", options: FACILITY_OPTIONS },
    { key: "surgeryDate", label: "Surgery Date", type: "datetime" },
    { key: "language", label: "Language", type: "select", options: ["EN", "ES"] },
    { key: "email", label: "Email", type: "email" },
    // Clinical & scheduling — the same fields as the old rich editor, now editable
    // inline on a customizable card.
    { key: "medicalClearance", label: "Medical Clearance", type: "select", options: CLEARANCE_OPTIONS },
    { key: "secondaryClearance", label: "Secondary Clearance", type: "select", options: CLEARANCE_OPTIONS },
    { key: "dentalClearance", label: "Dental Clearance", type: "select", options: DENTAL_CLEARANCE_OPTIONS },
    { key: "ctRequired", label: "CT Required", type: "select", options: CT_REQUIRED_OPTIONS },
    { key: "glp1", label: "GLP-1", type: "select", options: GLP1_OPTIONS },
    { key: "dme", label: "DME", type: "select", options: DME_OPTIONS },
    { key: "physicalTherapy", label: "Physical Therapy", type: "select_or_other", options: PHYSICAL_THERAPY_OPTIONS, otherOption: "External" },
    { key: "referral", label: "Referral Source", type: "select_or_other", options: REFERRAL_PRESETS, otherOption: "Other" },
    { key: "notes", label: "Notes", type: "long_text" },
  ],
}

// Surgery's default middle card — the clinical & scheduling fields, editable inline.
export const SURGERY_CLINICAL_FIELDS = [
  "medicalClearance", "secondaryClearance", "dentalClearance", "ctRequired", "glp1",
  "dme", "physicalTherapy", "referral", "facility", "surgeryDate", "language", "email", "notes",
]

// The card a record shows when no layout has been saved yet.
export function defaultCardFor(entityType: string): { cardName: string; title: string; fields: string[] } {
  const label = ({ PROVIDER: "Provider", PRACTICE: "Practice", LOCATION: "Location", SURGERY: "Case" } as Record<string, string>)[entityType] ?? "Record"
  // Surgery's identity card excludes the clinical fields (on their own middle card)
  // and Procedure (edited via the cascade picker in SurgeryDetailClient).
  const clinical = new Set([...SURGERY_CLINICAL_FIELDS, "procedure"])
  const fields = (RECORD_FIELDS[entityType] ?? []).map((f) => f.key).filter((k) => entityType !== "SURGERY" || !clinical.has(k))
  return { cardName: "info", title: `${label} Information`, fields }
}
