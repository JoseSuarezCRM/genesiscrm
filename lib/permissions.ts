// Single source of truth for permissions, shared by client (user/team editors,
// gated buttons) and server (action enforcement). Pure data + helpers.
//
// Two kinds of permissions, both stored in the same `permissions: string[]`:
//  • Object access (graded): encoded as "OBJECT:LEVEL", e.g. "REFERRALS:EDIT".
//    Levels are hierarchical: NONE < VIEW < EDIT < DELETE.
//  • Binary: a plain key, e.g. "EXPORT_DATA" or a "NAV_*" section.
// Admins implicitly get the highest access to everything.

export interface PermissionDef { key: string; label: string; description: string }

// ── Object access ──────────────────────────────────────────────────────────────
// A graded level (No access / View / View & Edit) PLUS a separate "can delete"
// flag — delete is an independent capability, not the top of the ladder.
// Encoded in the permissions array as "OBJECT:VIEW" | "OBJECT:EDIT" for the
// level, and "OBJECT:DELETE" (present or not) for the delete flag.
export type AccessLevel = "NONE" | "VIEW" | "EDIT"

export const ACCESS_LEVELS: { value: AccessLevel; label: string }[] = [
  { value: "NONE", label: "No access" },
  { value: "VIEW", label: "View" },
  { value: "EDIT", label: "View & Edit" },
]

const RANK: Record<AccessLevel, number> = { NONE: 0, VIEW: 1, EDIT: 2 }

// Objects that support graded access.
export const ACCESS_OBJECTS: { key: string; label: string }[] = [
  { key: "REFERRALS",         label: "Referrals" },
  { key: "PROVIDERS",         label: "Providers" },
  { key: "PRACTICES",         label: "Practices" },
  { key: "LOCATIONS",         label: "Locations" },
  { key: "ACTIVITIES",        label: "Activities" },
  { key: "SURGERY",           label: "Surgery Cases" },
  { key: "TASKS",             label: "Tasks" },
  { key: "SMS",               label: "SMS / Messages" },
  { key: "TEMPLATES",         label: "SMS & Email Templates" },
  { key: "BROADCASTS",        label: "Broadcasts" },
  { key: "AUTOMATIONS",       label: "Automations" },
  { key: "PIPELINES",         label: "Pipelines" },
  { key: "TAGS",              label: "Tags" },
  { key: "CUSTOM_PROPERTIES", label: "Custom Properties" },
  { key: "VIEWS",             label: "Views & Card Sections" },
  { key: "REPORTS",           label: "Reports" },
]

// Binary capabilities (on/off — they aren't a view/edit/delete spectrum).
export const CAPABILITIES: PermissionDef[] = [
  { key: "MERGE_RECORDS",     label: "Merge Records",        description: "Merge duplicate practices, locations, and providers" },
  { key: "EXPORT_DATA",       label: "Export Data",          description: "Export record lists to CSV" },
  { key: "IMPORT_DATA",       label: "Import Data",          description: "Import referrals and surgery cases from CSV / XLSX" },
  { key: "MANAGE_SCHEDULING", label: "Manage Scheduling",    description: "Use the staff scheduler, assign staff, auto-generate schedules" },
  { key: "MANAGE_USERS",      label: "Manage Users & Teams", description: "Add users, manage teams and permission sets" },
  { key: "DELETE_ACTIVITIES", label: "Delete Activities",    description: "Delete notes, calls, meetings, emails and SMS from a record's activity feed" },
]

// Nav sections (control sidebar visibility). Keep keys in sync with sidebar.tsx.
export const NAV_PERMISSIONS: PermissionDef[] = [
  { key: "NAV_REFERRALS",    label: "Referrals",    description: "Dashboard, Referrals, Practices, Locations, Providers, Activities, Tasks, SMS, Reports, Broadcasts" },
  { key: "NAV_APPOINTMENTS", label: "Appointments", description: "Completed appointments and referring providers" },
  { key: "NAV_SCHEDULING",   label: "Scheduling",   description: "Weekly schedule and staff roster" },
  { key: "NAV_SURGERY",      label: "Surgery",      description: "Surgery cases tracker with file import, call log, and documents" },
  { key: "NAV_COMMUNICATIONS", label: "Communications", description: "Reusable SMS and Email templates" },
  { key: "NAV_AUTOMATIONS",  label: "Automations",  description: "Workflows and appointment reconciliation" },
  { key: "NAV_ADMIN",        label: "Settings",     description: "User management, objects, data model, templates, and settings" },
]

export interface SessionUserLike { role?: string | null; permissions?: string[] | null }

// Read the granted access level (No access / View / Edit) for an object.
export function accessLevelFromPerms(perms: string[] | null | undefined, objectKey: string): AccessLevel {
  const p = perms ?? []
  if (p.includes(objectKey + ":EDIT")) return "EDIT"
  if (p.includes(objectKey + ":VIEW")) return "VIEW"
  return "NONE"
}

// Is the separate "can delete" flag granted for an object?
export function canDeleteFromPerms(perms: string[] | null | undefined, objectKey: string): boolean {
  return (perms ?? []).includes(objectKey + ":DELETE")
}

export function levelFor(user: SessionUserLike | null | undefined, objectKey: string): AccessLevel {
  if (!user) return "NONE"
  if (user.role === "ADMIN") return "EDIT"
  return accessLevelFromPerms(user.permissions, objectKey)
}

// Graded check: does the user have at least `required` access (VIEW/EDIT)?
export function userCanLevel(user: SessionUserLike | null | undefined, objectKey: string, required: AccessLevel): boolean {
  return RANK[levelFor(user, objectKey)] >= RANK[required]
}

// Separate delete check.
export function userCanDelete(user: SessionUserLike | null | undefined, objectKey: string): boolean {
  if (!user) return false
  if (user.role === "ADMIN") return true
  return canDeleteFromPerms(user.permissions, objectKey)
}

// Binary check (capabilities + nav sections). Admins always pass.
export function userCan(user: SessionUserLike | null | undefined, key: string): boolean {
  if (!user) return false
  if (user.role === "ADMIN") return true
  return (user.permissions ?? []).includes(key)
}
