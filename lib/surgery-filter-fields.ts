// Filter schema for surgery cases — one entry per column, type-aware, with the
// DB `column` set so the advanced FilterBuilder can be evaluated server-side
// (see lib/filter-to-prisma). Shared by the filter UI and the server query.

import type { FilterField } from "./filters"
import { SURGERY_STATUS_LABELS } from "./surgery-constants"
import { LANGUAGE_OPTIONS } from "./automation-properties"
import { PHYSICAL_THERAPY_OPTIONS } from "./surgery-procedures"

// getValue is unused for surgery (filtering happens in the DB), so it's a no-op.
const none = () => null

export const SURGERY_FILTER_FIELDS: FilterField[] = [
  { key: "patientName", label: "Patient", type: "text", column: "patientName", getValue: none },
  { key: "mrn", label: "MRN", type: "text", column: "mrn", getValue: none },
  {
    key: "status", label: "Status", type: "select", column: "status", getValue: none,
    options: Object.entries(SURGERY_STATUS_LABELS).map(([value, label]) => ({ value, label })),
  },
  {
    key: "language", label: "Language", type: "select", column: "language", getValue: none,
    options: LANGUAGE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
  },
  { key: "surgeryDate", label: "Surgery Date", type: "date", column: "surgeryDate", getValue: none },
  { key: "creationDate", label: "Creation Date", type: "date", column: "creationDate", getValue: none },
  { key: "expires", label: "Expires", type: "date", column: "expires", getValue: none },
  { key: "procedure", label: "Procedure", type: "text", column: "procedure", getValue: none },
  { key: "facility", label: "Facility", type: "text", column: "facility", getValue: none },
  { key: "orderingProvider", label: "Ordering Provider", type: "text", column: "orderingProvider", getValue: none },
  { key: "diagnosis", label: "Diagnosis", type: "text", column: "diagnosis", getValue: none },
  { key: "referral", label: "Referral Source", type: "text", column: "referral", getValue: none },
  { key: "email", label: "Email", type: "text", column: "email", getValue: none },
  { key: "medicalClearance", label: "Medical Clearance", type: "text", column: "medicalClearance", getValue: none },
  { key: "ctRequired", label: "CT Required", type: "text", column: "ctRequired", getValue: none },
  { key: "glp1", label: "GLP-1", type: "text", column: "glp1", getValue: none },
  { key: "dme", label: "DME", type: "text", column: "dme", getValue: none },
  {
    key: "physicalTherapy", label: "Physical Therapy", type: "select", column: "physicalTherapy", getValue: none,
    options: PHYSICAL_THERAPY_OPTIONS.map((v) => ({ value: v, label: v })),
  },
]
