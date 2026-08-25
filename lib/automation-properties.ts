// Property catalog + type-aware operators for workflow enrollment criteria.
// Pure data — shared by the editor UI and (via Condition.path/type) the engine.

import {
  surgeryProviders, allBodyParts, allProcedures, toOptions,
  FACILITY_OPTIONS, CLEARANCE_OPTIONS, DENTAL_CLEARANCE_OPTIONS,
  CT_REQUIRED_OPTIONS, GLP1_OPTIONS, DME_OPTIONS, REFERRAL_PRESETS,
} from "./surgery-procedures"

export type PropType = "text" | "number" | "date" | "boolean" | "select" | "tag"

// Where a select's options come from (filled by the UI from loaded data).
export type DynamicSource = "practice" | "location" | "user" | "pipeline" | "status" | "imaging"

export interface PropertyDef {
  id: string                                   // stable property id used as Condition.field
  label: string
  type: PropType
  path: string                                 // how the engine reads it off the referral
  source?: DynamicSource                       // dynamic select options
  options?: { value: string; label: string }[] // static select options
}

export interface OperatorDef {
  value: string
  label: string
  noValue?: boolean   // operator needs no value input (is empty / is known / is true …)
}

// Operators available per property type (HubSpot-style wording).
export const OPERATORS_BY_TYPE: Record<PropType, OperatorDef[]> = {
  text: [
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "doesn't contain" },
    { value: "eq", label: "is exactly" },
    { value: "ne", label: "is not" },
    { value: "empty", label: "is unknown", noValue: true },
    { value: "not_empty", label: "is known", noValue: true },
  ],
  number: [
    { value: "eq", label: "is equal to" },
    { value: "ne", label: "is not equal to" },
    { value: "gt", label: "is greater than" },
    { value: "lt", label: "is less than" },
    { value: "empty", label: "is unknown", noValue: true },
    { value: "not_empty", label: "is known", noValue: true },
  ],
  date: [
    { value: "before", label: "is before" },
    { value: "after", label: "is after" },
    { value: "days_ago_lt", label: "is less than N days ago" },
    { value: "days_ago_gt", label: "is more than N days ago" },
    { value: "empty", label: "is unknown", noValue: true },
    { value: "not_empty", label: "is known", noValue: true },
  ],
  boolean: [
    { value: "is_true", label: "is true", noValue: true },
    { value: "is_false", label: "is false", noValue: true },
  ],
  select: [
    { value: "eq", label: "is any of" },
    { value: "ne", label: "is none of" },
    { value: "empty", label: "is unknown", noValue: true },
    { value: "not_empty", label: "is known", noValue: true },
  ],
  tag: [
    { value: "has", label: "has tag", noValue: false },
    { value: "not_has", label: "does not have tag", noValue: false },
  ],
}

// Built-in referral properties available in enrollment/branch criteria.
export const REFERRAL_PROPERTY_DEFS: PropertyDef[] = [
  { id: "status",             label: "Status",              type: "select", path: "status", source: "status" },
  { id: "practiceId",         label: "Referring Practice",  type: "select", path: "referringPracticeId", source: "practice" },
  { id: "locationId",         label: "Referring Location",  type: "select", path: "referringLocationId", source: "location" },
  { id: "assignedToId",       label: "Assigned To",         type: "select", path: "assignedToId", source: "user" },
  { id: "pipelineId",         label: "Pipeline",            type: "select", path: "pipelineId", source: "pipeline" },
  { id: "tag",                label: "Tag",                 type: "tag",    path: "tags" },
  { id: "imagingType",        label: "Imaging Type",        type: "select", path: "imagingType", source: "imaging" },
  { id: "insuranceProvider",  label: "Insurance Provider",  type: "text",   path: "insuranceProvider" },
  { id: "insuranceMemberId",  label: "Insurance Member ID", type: "text",   path: "insuranceMemberId" },
  { id: "insuranceGroup",     label: "Insurance Group",     type: "text",   path: "insuranceGroup" },
  { id: "authStatus",         label: "Auth Status",         type: "text",   path: "authStatus" },
  { id: "referralDate",       label: "Referral Date",       type: "date",   path: "referralDate" },
  { id: "appointmentDate",    label: "Appointment Date",    type: "date",   path: "appointmentDate" },
  { id: "patientDob",         label: "Patient DOB",         type: "date",   path: "patientDob" },
  { id: "createdAt",          label: "Created Date",        type: "date",   path: "createdAt" },
  { id: "patientFirstName",   label: "Patient First Name",  type: "text",   path: "patientFirstName" },
  { id: "patientLastName",    label: "Patient Last Name",   type: "text",   path: "patientLastName" },
  { id: "patientPhone",       label: "Patient Phone",       type: "text",   path: "patientPhone" },
  { id: "patientEmail",       label: "Patient Email",       type: "text",   path: "patientEmail" },
  { id: "patientMrn",         label: "Patient MRN",         type: "text",   path: "patientMrn" },
  { id: "genesisMrn",         label: "Genesis MRN",         type: "text",   path: "genesisMrn" },
  { id: "referringNpi",       label: "Referring NPI",       type: "text",   path: "referringNpi" },
]

export const IMAGING_OPTIONS = [
  { value: "CT", label: "CT" },
  { value: "MRI", label: "MRI" },
  { value: "MRI Arthrogram", label: "MRI Arthrogram" },
]

export const SURGERY_STATUS_OPTIONS = [
  { value: "NEW", label: "New" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "PENDING_CONFIRMATION", label: "Pending Confirmation" },
  { value: "PENDING_CLEARANCE", label: "Pending Clearance" },
  { value: "CANCELED", label: "Canceled" },
  { value: "COMPLETED", label: "Completed" },
]

const CONTACT_TYPE_OPTIONS = [
  { value: "PROVIDER", label: "Provider" },
  { value: "STAFF", label: "Staff" },
]

export const LANGUAGE_OPTIONS = [
  { value: "EN", label: "English" },
  { value: "ES", label: "Spanish" },
]

// ── Provider (ReferringDoctor) ────────────────────────────────────────────────
const PROVIDER_PROPERTY_DEFS: PropertyDef[] = [
  { id: "name",        label: "Name",         type: "text",   path: "name" },
  { id: "title",       label: "Title",        type: "text",   path: "title" },
  { id: "npi",         label: "NPI",          type: "text",   path: "npi" },
  { id: "specialty",   label: "Specialty",    type: "text",   path: "specialty" },
  { id: "phone",       label: "Phone",        type: "text",   path: "phone" },
  { id: "email",       label: "Email",        type: "text",   path: "email" },
  { id: "contactType", label: "Contact Type", type: "select", path: "contactType", options: CONTACT_TYPE_OPTIONS },
  { id: "practiceId",  label: "Practice",     type: "select", path: "practiceId", source: "practice" },
  { id: "createdAt",   label: "Created Date", type: "date",   path: "createdAt" },
]

// ── Practice (ReferringPractice) ──────────────────────────────────────────────
const PRACTICE_PROPERTY_DEFS: PropertyDef[] = [
  { id: "name",      label: "Name",         type: "text", path: "name" },
  { id: "phone",     label: "Phone",        type: "text", path: "phone" },
  { id: "fax",       label: "Fax",          type: "text", path: "fax" },
  { id: "address",   label: "Address",      type: "text", path: "address" },
  { id: "createdAt", label: "Created Date", type: "date", path: "createdAt" },
]

// ── Location (PracticeLocation) ───────────────────────────────────────────────
const LOCATION_PROPERTY_DEFS: PropertyDef[] = [
  { id: "name",       label: "Name",     type: "text",   path: "name" },
  { id: "phone",      label: "Phone",    type: "text",   path: "phone" },
  { id: "fax",        label: "Fax",      type: "text",   path: "fax" },
  { id: "address",    label: "Address",  type: "text",   path: "address" },
  { id: "practiceId", label: "Practice", type: "select", path: "practiceId", source: "practice" },
]

// ── Surgery Case ──────────────────────────────────────────────────────────────
// Provider / Body Part / Procedure are a cascade; the case stores the single
// `procedure` value, and provider/body part are derived from it (the engine
// attaches surgeryProvider/surgeryBodyPart before evaluating).
const SURGERY_PROPERTY_DEFS: PropertyDef[] = [
  { id: "status",             label: "Status",              type: "select", path: "status", options: SURGERY_STATUS_OPTIONS },
  { id: "surgeryProvider",    label: "Surgical Provider",   type: "select", path: "surgeryProvider", options: toOptions(surgeryProviders()) },
  { id: "surgeryBodyPart",    label: "Body Part",           type: "select", path: "surgeryBodyPart", options: toOptions(allBodyParts()) },
  { id: "procedure",          label: "Procedure",           type: "select", path: "procedure", options: toOptions(allProcedures()) },
  { id: "facility",           label: "Facility",            type: "select", path: "facility", options: toOptions(FACILITY_OPTIONS) },
  { id: "medicalClearance",   label: "Medical Clearance",   type: "select", path: "medicalClearance", options: toOptions(CLEARANCE_OPTIONS) },
  { id: "secondaryClearance", label: "Secondary Clearance", type: "select", path: "secondaryClearance", options: toOptions(CLEARANCE_OPTIONS) },
  { id: "dentalClearance",    label: "Dental Clearance",    type: "select", path: "dentalClearance", options: toOptions(DENTAL_CLEARANCE_OPTIONS) },
  { id: "ctRequired",         label: "CT Required",         type: "select", path: "ctRequired", options: toOptions(CT_REQUIRED_OPTIONS) },
  { id: "glp1",               label: "GLP-1",               type: "select", path: "glp1", options: toOptions(GLP1_OPTIONS) },
  { id: "dme",                label: "DME",                 type: "select", path: "dme", options: toOptions(DME_OPTIONS) },
  { id: "referral",           label: "Referral Source",     type: "select", path: "referral", options: toOptions(REFERRAL_PRESETS) },
  { id: "orderingProvider",   label: "Ordering Provider",   type: "text",   path: "orderingProvider" },
  { id: "patientName",        label: "Patient Name",        type: "text",   path: "patientName" },
  { id: "mrn",                label: "MRN",                 type: "text",   path: "mrn" },
  { id: "diagnosis",          label: "Diagnosis",           type: "text",   path: "diagnosis" },
  { id: "surgeryDate",        label: "Surgery Date",        type: "date",   path: "surgeryDate" },
  { id: "language",           label: "Language",            type: "select", path: "language", options: LANGUAGE_OPTIONS },
  { id: "email",              label: "Email",               type: "text",   path: "email" },
  { id: "createdAt",          label: "Created Date",        type: "date",   path: "createdAt" },
]

// Built-in property catalog per workflow object.
export const OBJECT_PROPERTY_DEFS: Record<string, PropertyDef[]> = {
  REFERRAL: REFERRAL_PROPERTY_DEFS,
  PROVIDER: PROVIDER_PROPERTY_DEFS,
  PRACTICE: PRACTICE_PROPERTY_DEFS,
  LOCATION: LOCATION_PROPERTY_DEFS,
  SURGERY:  SURGERY_PROPERTY_DEFS,
}

// Which custom-property entity (if any) backs each workflow object.
export const OBJECT_CUSTOM_ENTITY: Record<string, "REFERRAL" | "PROVIDER" | "PRACTICE" | "LOCATION" | "SURGERY" | null> = {
  REFERRAL: "REFERRAL",
  PROVIDER: "PROVIDER",
  PRACTICE: "PRACTICE",
  LOCATION: "LOCATION",
  SURGERY: "SURGERY",
}

// Map a custom property (DB) into a PropertyDef the criteria builder can use.
export interface CustomPropertyInput {
  id: string
  name: string
  internalName?: string | null // token slug
  type: string                 // CustomPropertyType
  options?: string[]
  optionLabels?: Record<string, string> | null // option value → display label
}

export function customPropertyToDef(cp: CustomPropertyInput): PropertyDef {
  const path = `custom:${cp.id}`
  switch (cp.type) {
    case "NUMBER":
      return { id: path, label: cp.name, type: "number", path }
    case "DATE":
    case "DATE_TIME":
      return { id: path, label: cp.name, type: "date", path }
    case "CHECKBOX":
      return { id: path, label: cp.name, type: "boolean", path }
    case "DROPDOWN":
    case "MULTI_SELECT":
      return { id: path, label: cp.name, type: "select", path, options: (cp.options ?? []).map(o => ({ value: o, label: cp.optionLabels?.[o] ?? o })) }
    default: // TEXT, LONG_TEXT, EMAIL, PHONE, URL
      return { id: path, label: cp.name, type: "text", path }
  }
}
