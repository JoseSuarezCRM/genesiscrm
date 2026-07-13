// Workflow object grouping — pure data, safe to import from both server
// components (logs page) and client components (editor).

// Object-agnostic triggers: every object gets these, including custom objects.
// The object itself is stored in triggerConfig.objectType.
export const GENERIC_TRIGGERS = ["RECORD_CREATED", "RECORD_PROPERTY_CHANGED", "RECORD_OWNER_CHANGED"]

export function isGenericTrigger(trigger: string): boolean {
  return GENERIC_TRIGGERS.includes(trigger)
}

const BUILTIN_OBJECTS: { key: string; label: string; triggers: string[] }[] = [
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

// Every object also offers the generic triggers.
export const WORKFLOW_OBJECTS: { key: string; label: string; triggers: string[] }[] =
  BUILTIN_OBJECTS.map(o => ({ ...o, triggers: [...o.triggers, ...GENERIC_TRIGGERS] }))

// Custom objects are workflow objects too — they only have the generic triggers.
export interface CustomWorkflowObject { key: string; singular: string; plural: string }

export function workflowObjectsWith(customObjects: CustomWorkflowObject[] = []) {
  return [
    ...WORKFLOW_OBJECTS,
    ...customObjects.map(c => ({ key: `CO:${c.key}`, label: c.singular, triggers: [...GENERIC_TRIGGERS] })),
  ]
}

// A generic trigger belongs to whichever object the workflow names in its config,
// so pass triggerConfig.objectType when the trigger is generic.
export function workflowObjectFor(trigger: string, objectType?: string | null): { key: string; label: string } {
  if (isGenericTrigger(trigger) && objectType) {
    const builtin = WORKFLOW_OBJECTS.find(o => o.key === objectType)
    if (builtin) return { key: builtin.key, label: builtin.label }
    if (objectType.startsWith("CO:")) return { key: objectType, label: objectType.slice(3) }
  }
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
  RECORD_CREATED: "Record created",
  RECORD_PROPERTY_CHANGED: "Property changed",
  RECORD_OWNER_CHANGED: "Record owner changed",
}
