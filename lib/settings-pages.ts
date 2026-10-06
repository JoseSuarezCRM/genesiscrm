// Every settings page, and who may open it. Plain and client-safe: the settings
// menu, the sidebar and toolbar gears, the command palette, the permissions
// editor and every server gate (lib/auth-guard.ts requireSettingsPage) read this
// one list, so a page can't be listed in one place and ungated in another.
//
// Each page has its own binary permission, SETTINGS_<SLUG>, granted per user or
// team in User Management. Admins open everything. A few pages were already
// reachable through an older permission; those keep working (`alsoOpenedBy`) so
// granting page access only ever adds a way in.

import { userCan, userCanLevel, type SessionUserLike } from "@/lib/permissions"

export type SettingsSection = "Team & Access" | "Objects & Data" | "Tools" | "Integrations" | "Automations"

export interface SettingsPage {
  slug: string
  key: string
  href: string
  label: string
  section: SettingsSection
  description: string
  /** Shown in the settings menu (Appt Reconciliation lives under Automations in the sidebar). */
  inMenu: boolean
  /** An older permission that already opens this page — kept so nobody loses access. */
  alsoOpenedBy?: (user: SessionUserLike) => boolean
}

const page = (slug: string, label: string, section: SettingsSection, description: string, extra: Partial<SettingsPage> = {}): SettingsPage => ({
  slug,
  key: `SETTINGS_${slug.toUpperCase().replace(/-/g, "_")}`,
  href: `/settings/${slug}`,
  label,
  section,
  description,
  inMenu: true,
  ...extra,
})

export const SETTINGS_PAGES: SettingsPage[] = [
  page("users", "User Management", "Team & Access", "Users, teams and their permissions — they can't grant more than they hold"),
  page("objects", "Custom Objects", "Objects & Data", "Create and edit custom objects and their properties"),
  page("data-model", "Data Model", "Objects & Data", "Which objects can be associated with each other"),
  page("custom-properties", "Custom Properties", "Objects & Data", "Properties on Referrals, Providers, Practices and other built-in objects"),
  page("customization", "Property Customization", "Objects & Data", "Labels, order and visibility of built-in properties"),
  page("import", "Import Records", "Objects & Data", "Import CSV / Excel files into objects they can edit"),
  page("pipelines", "Pipelines", "Objects & Data", "Pipelines, stages and stage rules"),
  page("org-rules", "Org Name Rules", "Objects & Data", "Rules that normalise practice names"),
  page("email", "Email", "Tools", "Organization signature and shared mailboxes"),
  page("outreach", "Outreach Templates", "Tools", "Templates for outreach emails"),
  page("embed", "Embed Referral Form", "Tools", "The public referral form and who it notifies"),
  page("duplicates", "Duplicate Detection", "Tools", "Find and merge duplicate practices, locations and providers"),
  page("marketing", "Marketing Materials", "Tools", "Marketing categories, items and orders"),
  page("surgeon-sites", "Surgeon Websites", "Tools", "Each surgeon's public website content and publishing"),
  page("on-call-ai", "On-call AI", "Tools", "What the AI pulls from referral calls, and where"),
  page("practice", "Practice", "Tools", "The practice record the surgeon websites share"),
  page("integrations", "Connected Apps", "Integrations", "IntakeQ, FilesAnywhere and other connected apps", {
    // Reports access has always opened Connected Apps and IntakeQ (its referral-source report).
    alsoOpenedBy: (u) => userCanLevel(u, "REPORTS", "VIEW"),
  }),
  page("api-keys", "API Keys", "Integrations", "Keys that let outside systems read and write CRM data", {
    href: "/settings/integrations/api-keys",
    alsoOpenedBy: (u) => userCan(u, "MANAGE_USERS"),
  }),
  page("reconcile", "Appt Reconciliation", "Automations", "Import the weekly appointments file and reconcile referrals", { inMenu: false }),
]

export type SettingsSlug = (typeof SETTINGS_PAGES)[number]["slug"]

export const SETTINGS_PAGE_KEYS: string[] = SETTINGS_PAGES.map((p) => p.key)

export function settingsPage(slug: string): SettingsPage {
  const p = SETTINGS_PAGES.find((x) => x.slug === slug)
  if (!p) throw new Error(`Unknown settings page "${slug}"`)
  return p
}

/** Admins open every page; others need the page's box, or a permission that already opened it. */
export function canOpenSettingsPage(user: SessionUserLike | null | undefined, slug: string): boolean {
  if (!user) return false
  if (user.role === "ADMIN") return true
  const p = settingsPage(slug)
  return (user.permissions ?? []).includes(p.key) || !!p.alsoOpenedBy?.(user)
}

/** The settings pages this user can open, in menu order. */
export function openableSettingsPages(user: SessionUserLike | null | undefined): SettingsPage[] {
  return SETTINGS_PAGES.filter((p) => canOpenSettingsPage(user, p.slug))
}

/** Where the Settings gear should land: the first page in the menu they can open. */
export function firstSettingsPage(user: SessionUserLike | null | undefined): SettingsPage | null {
  return openableSettingsPages(user).find((p) => p.inMenu) ?? openableSettingsPages(user)[0] ?? null
}

/** The settings page a pathname belongs to (the most specific href wins). */
export function settingsPageForPath(pathname: string): SettingsPage | null {
  return SETTINGS_PAGES
    .filter((p) => pathname === p.href || pathname.startsWith(p.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0] ?? null
}
