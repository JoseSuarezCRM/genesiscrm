// ─── Canonical message personalization tokens ────────────────────────────────
// One catalog + one resolver shared by Communications templates, the manual
// "Send Message" dialog, and (future) sequence/automation sends. Tokens use the
// engine's single-brace snake_case form `{practice_name}`. The resolver also
// accepts the legacy double-brace camelCase form `{{practiceName}}` so older
// outreach/email templates keep working.
//
// Grouped by object so the Fields picker can drill into each object and show ALL
// of that object's available fields (HubSpot-style).

import { format } from "date-fns"

export interface MessageToken { label: string; value: string }
export interface MessageTokenGroup { group: string; tokens: MessageToken[] }

export const MESSAGE_TOKEN_GROUPS: MessageTokenGroup[] = [
  {
    group: "Patient",
    tokens: [
      { label: "First name", value: "{patient_first_name}" },
      { label: "Last name", value: "{patient_last_name}" },
      { label: "Full name", value: "{patient_name}" },
      { label: "Phone", value: "{patient_phone}" },
      { label: "Email", value: "{patient_email}" },
      { label: "Date of birth", value: "{patient_dob}" },
      { label: "MRN (referring)", value: "{patient_mrn}" },
      { label: "Genesis MRN", value: "{genesis_mrn}" },
    ],
  },
  {
    group: "Referral",
    tokens: [
      { label: "Status", value: "{referral_status}" },
      { label: "Referral date", value: "{referral_date}" },
      { label: "Appointment date", value: "{appointment_date}" },
      { label: "Insurance provider", value: "{insurance}" },
      { label: "Insurance member ID", value: "{insurance_member_id}" },
      { label: "Insurance group", value: "{insurance_group}" },
      { label: "Authorization status", value: "{auth_status}" },
      { label: "Imaging type", value: "{imaging_type}" },
      { label: "Referral link", value: "{referral_url}" },
    ],
  },
  {
    group: "Referring provider",
    tokens: [
      { label: "Provider name", value: "{provider_name}" },
      { label: "NPI", value: "{referring_npi}" },
      { label: "Provider phone", value: "{referring_phone}" },
    ],
  },
  {
    group: "Referring practice",
    tokens: [
      { label: "Practice name", value: "{practice_name}" },
      { label: "Practice address", value: "{referring_address}" },
    ],
  },
  {
    group: "Surgery",
    tokens: [
      { label: "Procedure", value: "{procedure}" },
      { label: "Body part", value: "{body_part}" },
      { label: "Surgical provider", value: "{surgical_provider}" },
      { label: "Surgery date", value: "{surgery_date}" },
      { label: "Facility", value: "{facility}" },
    ],
  },
]

// Flat label lookup, e.g. for previews.
export const MESSAGE_TOKEN_LABELS: Record<string, string> = Object.fromEntries(
  MESSAGE_TOKEN_GROUPS.flatMap((g) => g.tokens.map((t) => [t.value, t.label])),
)

function fmtDate(d: Date | null | undefined): string {
  return d ? format(d, "MMMM d, yyyy") : ""
}

// Shape the resolver needs — a referral with its relations selected.
export interface ReferralTokenSource {
  patientFirstName?: string | null
  patientLastName?: string | null
  patientPhone?: string | null
  patientEmail?: string | null
  patientDob?: Date | null
  patientMrn?: string | null
  genesisMrn?: string | null
  status?: string | null
  referralDate?: Date | null
  appointmentDate?: Date | null
  insuranceProvider?: string | null
  insuranceMemberId?: string | null
  insuranceGroup?: string | null
  authStatus?: string | null
  imagingType?: string | null
  referringNpi?: string | null
  referringPhone?: string | null
  referringAddress?: string | null
  referringDoctorName?: string | null
  referringPractice?: { name: string | null } | null
  referringDoctor?: { name: string | null } | null
}

// The prisma `select` a referral needs to fully populate the catalog.
export const REFERRAL_TOKEN_SELECT = {
  patientFirstName: true, patientLastName: true, patientPhone: true, patientEmail: true,
  patientDob: true, patientMrn: true, genesisMrn: true,
  status: true, referralDate: true, appointmentDate: true,
  insuranceProvider: true, insuranceMemberId: true, insuranceGroup: true, authStatus: true, imagingType: true,
  referringNpi: true, referringPhone: true, referringAddress: true, referringDoctorName: true,
  referringPractice: { select: { name: true } },
  referringDoctor: { select: { name: true } },
} as const

// Build the var map (snake_case canonical keys + legacy camelCase aliases) for a
// referral. Missing values resolve to "".
export function buildReferralVars(r: ReferralTokenSource, opts: { referralUrl?: string } = {}): Record<string, string> {
  const first = r.patientFirstName ?? ""
  const last = r.patientLastName ?? ""
  const full = `${first} ${last}`.trim()
  const providerName = r.referringDoctor?.name ?? r.referringDoctorName ?? ""
  const practiceName = r.referringPractice?.name ?? ""
  const appt = fmtDate(r.appointmentDate)
  const insurance = r.insuranceProvider ?? ""

  return {
    // Patient
    patient_first_name: first,
    patient_last_name: last,
    patient_name: full,
    patient_phone: r.patientPhone ?? "",
    patient_email: r.patientEmail ?? "",
    patient_dob: fmtDate(r.patientDob),
    patient_mrn: r.patientMrn ?? "",
    genesis_mrn: r.genesisMrn ?? "",
    // Referral
    referral_status: r.status ?? "",
    referral_date: fmtDate(r.referralDate),
    appointment_date: appt,
    insurance,
    insurance_member_id: r.insuranceMemberId ?? "",
    insurance_group: r.insuranceGroup ?? "",
    auth_status: r.authStatus ?? "",
    imaging_type: r.imagingType ?? "",
    referral_url: opts.referralUrl ?? "",
    // Provider
    provider_name: providerName,
    referring_npi: r.referringNpi ?? "",
    referring_phone: r.referringPhone ?? "",
    // Practice
    practice_name: practiceName,
    referring_address: r.referringAddress ?? "",

    // Legacy camelCase aliases (older {{...}} email/outreach templates)
    firstName: first,
    lastName: last,
    fullName: full,
    appointmentDate: appt,
    practiceName,
    providerName,
    email: r.patientEmail ?? "",
    phone: r.patientPhone ?? "",
  }
}

// Replace both `{{camelCase}}` and `{snake_case}` tokens. Unknown double-brace
// tokens become "" (legacy behavior); unknown single-brace runs are left as-is so
// literal braces in copy aren't eaten.
export function resolveMessageTokens(text: string, vars: Record<string, string>): string {
  if (!text) return text
  return text
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => (k in vars ? vars[k] : ""))
    .replace(/\{\s*([a-z][a-z0-9_]*)\s*\}/g, (m, k: string) => (k in vars ? vars[k] : m))
}
