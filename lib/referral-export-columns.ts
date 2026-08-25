// Column catalog for the Referrals CSV export — mirrors the list table's columns
// (labels + how each value is read) so the export matches what's on screen,
// including association-backed columns and custom properties.
import { STATUS_LABELS } from "@/lib/utils"

export interface ExportCol { key: string; label: string; get: (r: any) => string }

const d = (v: any) => (v ? new Date(v).toLocaleDateString() : "")
const cpVal = (v: any) => (v == null ? "" : Array.isArray(v) ? v.join(", ") : String(v))

// Default columns when the client doesn't specify any (legacy behavior).
export const DEFAULT_EXPORT_COLS = [
  "patient", "phone", "email", "dob", "practice", "providerName", "pipeline",
  "status", "referralDate", "apptDate", "insurance", "insuranceMemberId",
  "insuranceGroup", "authStatus", "notes",
]

export function referralExportColumns(customProps: { id: string; name: string }[]): Record<string, ExportCol> {
  const native: ExportCol[] = [
    { key: "patient", label: "Patient", get: (r) => `${r.patientFirstName ?? ""} ${r.patientLastName ?? ""}`.trim() },
    { key: "phone", label: "Phone", get: (r) => r.patientPhone ?? "" },
    { key: "email", label: "Email", get: (r) => r.patientEmail ?? "" },
    { key: "mrn", label: "Referring MRN", get: (r) => r.patientMrn ?? "" },
    { key: "genesisMrn", label: "Genesis MRN", get: (r) => r.genesisMrn ?? "" },
    { key: "dob", label: "Date of Birth", get: (r) => d(r.patientDob) },
    { key: "practice", label: "Referring Practice", get: (r) => r.referringPractice?.name ?? "" },
    { key: "providerName", label: "Provider Name", get: (r) => r.referringDoctor?.name ?? r.referringDoctorName ?? "" },
    { key: "npi", label: "Referring NPI", get: (r) => r.referringDoctor?.npi ?? r.referringNpi ?? "" },
    { key: "referringPhone", label: "Referring Phone", get: (r) => r.referringDoctor?.phone ?? r.referringPhone ?? "" },
    { key: "referringAddress", label: "Referring Address", get: (r) => r.referringLocation?.address ?? r.referringAddress ?? "" },
    { key: "insurance", label: "Insurance", get: (r) => r.insuranceProvider ?? "" },
    { key: "insuranceMemberId", label: "Insurance Member ID", get: (r) => r.insuranceMemberId ?? "" },
    { key: "insuranceGroup", label: "Insurance Group", get: (r) => r.insuranceGroup ?? "" },
    { key: "authStatus", label: "Auth Status", get: (r) => r.authStatus ?? "" },
    { key: "imagingType", label: "Imaging Type", get: (r) => r.imagingType ?? "" },
    { key: "pipeline", label: "Pipeline", get: (r) => r.pipeline?.name ?? "" },
    { key: "assignedTo", label: "Assigned To", get: (r) => r.assignedTo?.name || r.assignedTo?.email || "" },
    { key: "tags", label: "Tags", get: (r) => (r.tags ?? []).map((t: any) => t.tag?.name).filter(Boolean).join(", ") },
    { key: "referralDate", label: "Referral Date", get: (r) => d(r.referralDate) },
    { key: "apptDate", label: "Appt Date", get: (r) => d(r.appointmentDate) },
    { key: "calls", label: "Calls", get: (r) => String(r._count?.callAttempts ?? 0) },
    { key: "notes", label: "Notes", get: (r) => r.notes ?? "" },
    { key: "status", label: "Status", get: (r) => STATUS_LABELS[r.status as keyof typeof STATUS_LABELS] ?? r.status ?? "" },
    { key: "createdAt", label: "Created At", get: (r) => d(r.createdAt) },
  ]
  const cp: ExportCol[] = customProps.map((p) => ({ key: `cp_${p.id}`, label: p.name, get: (r) => cpVal(r.customProperties?.[p.id]) }))
  return Object.fromEntries([...native, ...cp].map((c) => [c.key, c]))
}
