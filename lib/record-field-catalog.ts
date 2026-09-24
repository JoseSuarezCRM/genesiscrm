// The editable properties of each built-in object, used by the left-column
// property cards (same idea as the Referral field catalog): a card groups these
// keys, and each value is click-to-edit inline.

import {
  CLEARANCE_OPTIONS, DENTAL_CLEARANCE_OPTIONS, CT_REQUIRED_OPTIONS,
  GLP1_OPTIONS, DME_OPTIONS, FACILITY_OPTIONS, PHYSICAL_THERAPY_OPTIONS, REFERRAL_PRESETS,
} from "@/lib/surgery-procedures"

export type RecordFieldType = "text" | "email" | "phone" | "number" | "date" | "select" | "long_text" | "user" | "datetime" | "select_or_other" | "checkbox"

export interface RecordFieldDef {
  key: string
  label: string
  type: RecordFieldType
  options?: string[]
  readOnly?: boolean
  // Required at creation (used by the configurable create-record modal).
  required?: boolean
  // For `select_or_other`: the option label that reveals a free-text box (the typed
  // value is stored in the same field), like Physical Therapy's "External".
  otherOption?: string
  // Custom-property default — prefilled when you start editing an empty value.
  default?: string
  // Dependent options: another property's value controls which options show.
  conditional?: { controllingPropertyId: string; rules: Record<string, string[]> }
  // Dropdown/select display labels keyed by the stored internal value.
  optionLabels?: Record<string, string>
  // DROPDOWN/MULTI_SELECT option styling: value→hex color + one style for the field.
  optionColors?: Record<string, string>
  optionStyle?: string   // "default" | "dot" | "badge"
  // A select that holds MULTIPLE values (MULTI_SELECT) — edited with checkboxes.
  multi?: boolean
  // Show this field on the record only when the controlling field's value matches.
  visibilityRule?: { controllingKey: string; equals: string[] } | null
  // NUMBER only: "currency" renders the value as USD currency; otherwise plain.
  numberFormat?: string | null
  // Appended after a read-only number when displayed — e.g. "days" for time-in-stage.
  unit?: string
  // Coerce the committed value before saving — e.g. a select whose values are
  // numbers (activity rating is an Int column). "number" → Number(value).
  coerce?: "number"
}

// Whether a property with a visibility rule should show, given the record's values.
export function isPropertyVisible(
  rule: { controllingKey: string; equals: string[] } | null | undefined,
  values: Record<string, any>,
): boolean {
  if (!rule || !rule.controllingKey || !(rule.equals?.length)) return true
  const v = values[rule.controllingKey]
  if (Array.isArray(v)) return v.some((x) => rule.equals.includes(String(x)))
  return rule.equals.includes(String(v ?? ""))
}

// The referral imaging types, in one place. Previously these were written out
// separately in the create form, in IMAGING_OPTIONS for automations, and in a
// schema comment — so adding an option meant remembering all three, and the
// lists had to be kept in step by hand.
export const IMAGING_TYPES: string[] = [
  "CT",
  "MRI",
  "MRI Arthrogram",
  "MRI W WO Contrast",
  "MRI MARS Protocol",
]

export const RECORD_FIELDS: Record<string, RecordFieldDef[]> = {
  REFERRAL: [
    // Patient
    { key: "patientFirstName", label: "First Name", type: "text" },
    { key: "patientLastName", label: "Last Name", type: "text" },
    { key: "patientMrn", label: "Referring MRN", type: "text" },
    { key: "genesisMrn", label: "Genesis MRN", type: "text" },
    { key: "patientDob", label: "Date of Birth", type: "date" },
    { key: "patientPhone", label: "Phone", type: "phone" },
    { key: "patientEmail", label: "Email", type: "email" },
    // Referring source (the Practice/Location/Provider records are the association
    // cards; these are the free-text/contact fields that live on the referral).
    { key: "referringDoctorName", label: "Provider Name", type: "text" },
    { key: "referringNpi", label: "Referring NPI", type: "text" },
    { key: "referringPhone", label: "Referring Phone", type: "phone" },
    { key: "referringAddress", label: "Referring Address", type: "text" },
    // Insurance
    { key: "insuranceProvider", label: "Insurance", type: "text" },
    { key: "insuranceMemberId", label: "Insurance Member ID", type: "text" },
    { key: "insuranceGroup", label: "Insurance Group", type: "text" },
    { key: "authStatus", label: "Auth Status", type: "text" },
    // Scheduling / pipeline
    { key: "appointmentDate", label: "Appointment", type: "date" },
    // Pipeline is an editable select — its options (id→name) are injected in
    // lib/record-cards for the referral. Status/date/owner are read-only here
    // (managed by the referral's own status + assignment controls).
    { key: "pipelineId", label: "Pipeline", type: "select" },
    { key: "imagingType", label: "Imaging Type", type: "select", options: IMAGING_TYPES },
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
  // Tasks and Activities had NO entry here, so reportFieldsFor returned almost
  // nothing for them: neither object could be filtered on its own columns, and
  // the report builder could only see their ids and audit fields.
  TASK: [
    { key: "title", label: "Title", type: "text" },
    { key: "description", label: "Description", type: "long_text" },
    { key: "status", label: "Stage", type: "select", options: ["NOT_STARTED", "IN_PROGRESS", "WAITING", "DEFERRED", "COMPLETED"] },
    { key: "priority", label: "Priority", type: "select", options: ["LOW", "NORMAL", "HIGH", "URGENT"] },
    { key: "type", label: "Type", type: "select", options: ["TODO", "CALL", "EMAIL"] },
    { key: "repeat", label: "Repeat", type: "select", options: ["NONE", "DAILY", "WEEKLY", "MONTHLY"] },
    { key: "dueDate", label: "Due Date", type: "datetime" },
  ],
  ACTIVITY: [
    { key: "date", label: "Date", type: "datetime" },
    { key: "nextStep", label: "Next Step", type: "text" },
    { key: "frontDesk", label: "Front Desk", type: "text" },
    { key: "flyer", label: "Flyer", type: "text" },
    { key: "notes", label: "Notes", type: "long_text" },
    { key: "rating", label: "Clinic Value", type: "select", options: ["1", "2", "3"], optionLabels: { "1": "Low", "2": "Mid", "3": "High" }, coerce: "number" },
    { key: "meetingRating", label: "Meeting Rating", type: "select", options: ["1", "2", "3", "4", "5"], coerce: "number" },
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
