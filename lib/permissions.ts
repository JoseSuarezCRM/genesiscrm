// Single source of truth for permissions, shared by client (user/team editors,
// gated buttons) and server (action enforcement). Pure data + helper — safe to
// import anywhere.

export interface PermissionDef { key: string; label: string; description: string }

// Nav sections (control sidebar visibility). Keep keys in sync with sidebar.tsx.
export const NAV_PERMISSIONS: PermissionDef[] = [
  { key: "NAV_REFERRALS",    label: "Referrals",    description: "Dashboard, Referrals, Providers, Activities, Tasks, SMS, Reports, Broadcasts" },
  { key: "NAV_APPOINTMENTS", label: "Appointments", description: "Completed appointments and referring providers" },
  { key: "NAV_SCHEDULING",   label: "Scheduling",   description: "Weekly schedule and staff roster" },
  { key: "NAV_SURGERY",      label: "Surgery",      description: "Surgery cases tracker with file import, call log, and documents" },
  { key: "NAV_COMMUNICATIONS", label: "Communications", description: "Reusable SMS and Email templates" },
  { key: "NAV_ADMIN",        label: "Admin",        description: "User management, automations, templates, and settings" },
]

// Feature/action permissions (control what a user can DO). Admins always pass.
export const FEATURE_PERMISSIONS: PermissionDef[] = [
  { key: "MANAGE_PROVIDERS",   label: "Manage Providers",   description: "Create, edit, and delete providers" },
  { key: "MANAGE_PRACTICES",   label: "Manage Practices",   description: "Create, edit, and delete practices and locations" },
  { key: "MERGE_RECORDS",      label: "Merge Records",      description: "Merge duplicate practices, locations, and providers" },
  { key: "MANAGE_REFERRALS",   label: "Manage Referrals",   description: "Create, edit, and delete referrals" },
  { key: "MANAGE_ACTIVITIES",  label: "Manage Activities",  description: "Log and edit activities" },
  { key: "MANAGE_SURGERY",     label: "Manage Surgery Cases", description: "Create, edit, import, and delete surgery cases" },
  { key: "MANAGE_TASKS",       label: "Manage Tasks",       description: "Create, assign, and complete tasks" },
  { key: "SEND_SMS",           label: "Send SMS",           description: "Send text messages from the SMS inbox" },
  { key: "MANAGE_TEMPLATES",   label: "Manage Templates",   description: "Create and edit SMS and email templates" },
  { key: "MANAGE_BROADCASTS",  label: "Manage Broadcasts",  description: "Create and send patient broadcasts" },
  { key: "MANAGE_AUTOMATIONS", label: "Manage Automations", description: "Create and edit automation rules" },
  { key: "MANAGE_SCHEDULING",  label: "Manage Scheduling",  description: "Access the staff scheduler, assign staff, and auto-generate schedules" },
  { key: "MANAGE_CUSTOM_PROPERTIES", label: "Manage Custom Properties", description: "Create, edit, and delete custom properties" },
  { key: "MANAGE_VIEWS",       label: "Manage Views & Cards", description: "Edit card sections and create/share saved views" },
  { key: "MANAGE_PIPELINES",   label: "Manage Pipelines",   description: "Create and edit referral pipelines" },
  { key: "MANAGE_TAGS",        label: "Manage Tags",        description: "Create, rename, recolor, and delete tags" },
  { key: "IMPORT_DATA",        label: "Import Data",        description: "Import referrals and surgery cases from CSV / XLSX" },
  { key: "VIEW_REPORTS",       label: "View Reports",       description: "Access the Reports page" },
  { key: "EXPORT_DATA",        label: "Export Data",        description: "Export record lists to CSV" },
  { key: "MANAGE_USERS",       label: "Manage Users & Teams", description: "Add users, manage teams and permission sets" },
]

export const ALL_PERMISSIONS: PermissionDef[] = [...NAV_PERMISSIONS, ...FEATURE_PERMISSIONS]

export interface SessionUserLike { role?: string | null; permissions?: string[] | null }

// The one check to gate any function, button, action, property, or view.
// Admins implicitly have every permission.
export function userCan(user: SessionUserLike | null | undefined, key: string): boolean {
  if (!user) return false
  if (user.role === "ADMIN") return true
  return (user.permissions ?? []).includes(key)
}
