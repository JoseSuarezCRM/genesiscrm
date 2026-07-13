// Every object that supports custom properties (New Object Playbook: all of them).
// Client-safe — no prisma import.

export type CPEntity = "REFERRAL" | "PROVIDER" | "PRACTICE" | "LOCATION" | "SURGERY" | "ACTIVITY" | "TASK"

export interface CPEntityMeta {
  type: CPEntity
  label: string
  icon: string
  /** Permission object key that gates editing a record of this type. */
  object: string
  /** URL segment of the record's detail page, for revalidation. */
  basePath: string
}

export const CP_ENTITIES: CPEntityMeta[] = [
  { type: "REFERRAL", label: "Referrals",     icon: "📋", object: "REFERRALS",  basePath: "referrals" },
  { type: "PROVIDER", label: "Providers",     icon: "👨‍⚕️", object: "PROVIDERS",  basePath: "referring-doctors" },
  { type: "PRACTICE", label: "Practices",     icon: "🏥", object: "PRACTICES",  basePath: "practices" },
  { type: "LOCATION", label: "Locations",     icon: "📍", object: "LOCATIONS",  basePath: "locations" },
  { type: "SURGERY",  label: "Surgery Cases", icon: "🦴", object: "SURGERY",    basePath: "surgery" },
  { type: "ACTIVITY", label: "Activities",    icon: "📅", object: "ACTIVITIES", basePath: "activities" },
  { type: "TASK",     label: "Tasks",         icon: "✅", object: "TASKS",      basePath: "tasks" },
]

export function cpMeta(type: CPEntity): CPEntityMeta {
  return CP_ENTITIES.find((e) => e.type === type) ?? CP_ENTITIES[0]
}
