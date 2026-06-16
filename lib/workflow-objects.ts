// Workflow object grouping — pure data, safe to import from both server
// components (logs page) and client components (editor).

export const WORKFLOW_OBJECTS: { key: string; label: string; triggers: string[] }[] = [
  {
    key: "REFERRAL",
    label: "Referral",
    triggers: [
      "REFERRAL_CREATED", "REFERRAL_STATUS_CHANGED", "REFERRAL_ASSIGNED", "REFERRAL_NO_ACTIVITY",
      "APPOINTMENT_UPCOMING", "APPOINTMENT_OVERDUE", "REFERRAL_STALE", "CALL_ATTEMPTS_REACHED",
      "TAG_ADDED", "DOCUMENT_UPLOADED", "AUTH_STATUS_CHANGED", "EMBED_REFERRAL_RECEIVED", "PIPELINE_CHANGED",
    ],
  },
  { key: "PROVIDER", label: "Provider",     triggers: ["PROVIDER_REFERRAL_COUNT"] },
  { key: "PRACTICE", label: "Practice",     triggers: ["PRACTICE_REFERRAL_COUNT"] },
  { key: "LOCATION", label: "Location",     triggers: ["LOCATION_REFERRAL_COUNT"] },
  { key: "SURGERY",  label: "Surgery Case", triggers: ["SURGERY_STATUS_CHANGED", "SURGERY_CALL_ATTEMPTS_REACHED"] },
]

export function workflowObjectFor(trigger: string): { key: string; label: string } {
  const obj = WORKFLOW_OBJECTS.find(o => o.triggers.includes(trigger))
  return obj ? { key: obj.key, label: obj.label } : { key: "REFERRAL", label: "Referral" }
}

export const WORKFLOW_TRIGGER_LABELS: Record<string, string> = {
  REFERRAL_CREATED: "New referral created",
  REFERRAL_STATUS_CHANGED: "Referral status changed",
  PROVIDER_REFERRAL_COUNT: "Provider reaches referral count",
  PRACTICE_REFERRAL_COUNT: "Practice reaches referral count",
  LOCATION_REFERRAL_COUNT: "Location reaches referral count",
  REFERRAL_NO_ACTIVITY: "Referral has no activity",
  APPOINTMENT_UPCOMING: "Appointment coming up",
  APPOINTMENT_OVERDUE: "Appointment date passed (still Scheduled)",
  REFERRAL_STALE: "Referral has no appointment set",
  CALL_ATTEMPTS_REACHED: "Call attempts reached",
  REFERRAL_ASSIGNED: "Referral assigned to user",
  TAG_ADDED: "Tag added to referral",
  DOCUMENT_UPLOADED: "Document uploaded to referral",
  AUTH_STATUS_CHANGED: "Auth status changed",
  EMBED_REFERRAL_RECEIVED: "Referral received via embed form",
  PIPELINE_CHANGED: "Referral moved to pipeline",
  SURGERY_STATUS_CHANGED: "Surgery case status changed",
  SURGERY_CALL_ATTEMPTS_REACHED: "Surgery call attempts reached",
}
