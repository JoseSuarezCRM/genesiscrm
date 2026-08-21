// Filter schema for referrals — one entry per scalar column, type-aware, with the
// DB `column` set so the advanced FilterBuilder can be evaluated server-side (see
// lib/filter-to-prisma). Shared by the filter UI and the server query. Tags are a
// many-to-many relation (unsupported by filter-to-prisma) so they stay an inline
// filter, not a FilterBuilder field.

import { ReferralStatus } from "@prisma/client"
import type { FilterField, CustomPropDef } from "./filters"
import { customPropertyFilterFields } from "./filters"
import { STATUS_LABELS } from "./utils"

// getValue is unused for referrals (filtering happens in the DB), so it's a no-op.
const none = () => null

export const REFERRAL_FILTER_FIELDS: FilterField[] = [
  { key: "patientFirstName", label: "Patient first name", type: "text", column: "patientFirstName", getValue: none },
  { key: "patientLastName", label: "Patient last name", type: "text", column: "patientLastName", getValue: none },
  { key: "patientPhone", label: "Phone", type: "text", column: "patientPhone", getValue: none },
  { key: "patientEmail", label: "Email", type: "text", column: "patientEmail", getValue: none },
  { key: "patientDob", label: "Date of birth", type: "date", column: "patientDob", getValue: none },
  { key: "patientMrn", label: "MRN", type: "text", column: "patientMrn", getValue: none },
  { key: "genesisMrn", label: "Genesis MRN", type: "text", column: "genesisMrn", getValue: none },
  {
    key: "status", label: "Status", type: "select", column: "status", getValue: none,
    options: Object.values(ReferralStatus).map((s) => ({ value: s, label: STATUS_LABELS[s] })),
  },
  { key: "referralDate", label: "Referral date", type: "date", column: "referralDate", getValue: none },
  { key: "appointmentDate", label: "Appointment date", type: "date", column: "appointmentDate", getValue: none },
  { key: "createdAt", label: "Created", type: "date", column: "createdAt", getValue: none },
  { key: "insuranceProvider", label: "Insurance", type: "text", column: "insuranceProvider", getValue: none },
  { key: "insuranceMemberId", label: "Insurance member ID", type: "text", column: "insuranceMemberId", getValue: none },
  { key: "insuranceGroup", label: "Insurance group", type: "text", column: "insuranceGroup", getValue: none },
  { key: "authStatus", label: "Auth status", type: "text", column: "authStatus", getValue: none },
  { key: "imagingType", label: "Imaging type", type: "text", column: "imagingType", getValue: none },
  { key: "referringDoctorName", label: "Referring provider (name)", type: "text", column: "referringDoctorName", getValue: none },
  { key: "referringNpi", label: "Referring NPI", type: "text", column: "referringNpi", getValue: none },
  { key: "referringPhone", label: "Referring phone", type: "text", column: "referringPhone", getValue: none },
  { key: "referringAddress", label: "Referring address", type: "text", column: "referringAddress", getValue: none },
]

// The full criteria list: the fixed columns above, plus the relational selects
// (practice / provider / location / pipeline / owner) whose options come from the
// page, and every Referral custom property. The server passes just `customProps`
// so it can translate the same FilterState.
export function referralFilterFields(opts?: {
  users?: { id: string; label: string }[]
  practices?: { id: string; label: string }[]
  doctors?: { id: string; label: string }[]
  locations?: { id: string; label: string }[]
  pipelines?: { id: string; label: string }[]
  tags?: { id: string; label: string }[]
  customProps?: CustomPropDef[]
}): FilterField[] {
  const sel = (key: string, label: string, column: string, items?: { id: string; label: string }[]): FilterField => ({
    key, label, type: "select", column, getValue: none,
    options: (items ?? []).map((i) => ({ value: i.id, label: i.label })),
  })
  return [
    ...REFERRAL_FILTER_FIELDS,
    sel("referringPracticeId", "Referring practice", "referringPracticeId", opts?.practices),
    sel("referringDoctorId", "Referring provider", "referringDoctorId", opts?.doctors),
    sel("referringLocationId", "Referring location", "referringLocationId", opts?.locations),
    sel("pipelineId", "Pipeline", "pipelineId", opts?.pipelines),
    sel("assignedToId", "Referral Owner", "assignedToId", opts?.users),
    {
      key: "tags", label: "Tags", type: "select", column: "tags",
      options: (opts?.tags ?? []).map((t) => ({ value: t.id, label: t.label })),
      relationSome: { relation: "tags", key: "tagId" },
      getValue: (row: any) => (row?.tags ?? []).map((t: any) => t.tagId ?? t.tag?.id).filter(Boolean),
    },
    ...customPropertyFilterFields(opts?.customProps ?? []),
  ]
}
