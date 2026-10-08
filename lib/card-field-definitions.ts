// Properties available for custom cards in the left sidebar of the referral detail page.
// Widget/relation entries (status, assignedTo, tags, practice, provider, …) use their
// own ids + bespoke rendering; the native data fields use their column name as id and
// render generically. To prevent drift, every RECORD_FIELDS["REFERRAL"] native field not
// already listed here is appended automatically (see referralLeftFieldPool below).
import { RECORD_FIELDS } from "@/lib/record-field-catalog"
import { labelFrom, type NativeLabelMap } from "@/lib/native-labels-shared"

// The special/widget + legacy-id entries the left-column renderer handles explicitly.
// `field` is the catalog key behind a legacy id, so an admin's rename reaches it —
// these ids are the left column's own ("mrn" here is the Genesis MRN).
const REFERRAL_LEFT_SPECIAL: { id: string; label: string; field?: string }[] = [
  { id: "status", label: "Status", field: "status" },
  { id: "assignedTo", label: "Assigned To", field: "assignedTo" },
  { id: "tags", label: "Tags" },
  { id: "mrn", label: "Genesis MRN", field: "genesisMrn" },
  { id: "patientMrn", label: "Patient MRN", field: "patientMrn" },
  { id: "dob", label: "Date of Birth", field: "patientDob" },
  { id: "patientPhone", label: "Patient Phone", field: "patientPhone" },
  { id: "patientEmail", label: "Patient Email", field: "patientEmail" },
  { id: "practice", label: "Practice" },
  { id: "provider", label: "Provider" },
  { id: "npi", label: "NPI", field: "referringNpi" },
  { id: "referringDoctorName", label: "Referring Provider Name", field: "referringDoctorName" },
  { id: "referringPhone", label: "Referring Phone", field: "referringPhone" },
  { id: "referringAddress", label: "Referring Address", field: "referringAddress" },
  { id: "location", label: "Location" },
  { id: "insurance", label: "Insurance", field: "insuranceProvider" },
  { id: "insuranceMemberId", label: "Member ID", field: "insuranceMemberId" },
  { id: "insuranceGroup", label: "Group Number", field: "insuranceGroup" },
  { id: "authStatus", label: "Auth Status", field: "authStatus" },
  { id: "imagingType", label: "Imaging Type", field: "imagingType" },
  { id: "pipeline", label: "Pipeline", field: "pipelineId" },
  { id: "referralDate", label: "Referral Date", field: "referralDate" },
  { id: "appointmentDate", label: "Appointment Date", field: "appointmentDate" },
  { id: "createdBy", label: "Created By" },
  { id: "createdAt", label: "Created Date" },
]

// Native referral columns already represented by a special/legacy entry above.
const REFERRAL_LEFT_COVERED = new Set([
  "genesisMrn", "patientMrn", "patientDob", "patientPhone", "patientEmail",
  "referringNpi", "referringDoctorName", "referringPhone", "referringAddress",
  "insuranceProvider", "insuranceMemberId", "insuranceGroup", "authStatus", "imagingType",
  "pipelineId", "referralDate", "appointmentDate", "status", "assignedTo",
  "patientFirstName", "patientLastName", // record title — kept in the header, not offered as a card field
])

/** The left-column field picker, with admins' renames applied (Settings → Properties). */
export function referralLeftFieldPool(labels?: NativeLabelMap | null): { id: string; label: string }[] {
  return [
    ...REFERRAL_LEFT_SPECIAL.map((f) => ({ id: f.id, label: f.field ? labelFrom(labels, "REFERRAL", f.field, f.label) : f.label })),
    // Auto-append any other native field (e.g. Notes, and anything added later) so the
    // picker never drifts out of sync with the referral's real columns.
    ...(RECORD_FIELDS["REFERRAL"] ?? [])
      .filter((f) => !REFERRAL_LEFT_COVERED.has(f.key))
      .map((f) => ({ id: f.key, label: labelFrom(labels, "REFERRAL", f.key, f.label) })),
  ]
}
