// Every destination the sidebar can show, and its default arrangement. Admins
// rearrange, rename and hide these in Settings → Navigation (lib/nav-layout.ts);
// with no saved layout the sidebar is exactly this.
//
// Access travels WITH the item: `navKey` is the Menu Access box of the section the
// item was born in, and `object`/`level`/`settingsPage` are its own gates. Moving an
// item to another section never shows it to anyone new, or hides it from anyone.
//
// No React here — the server validates layouts against it.

import type { AccessLevel } from "@/lib/permissions"

export interface NavItemDef {
  /** Stable id stored in saved layouts — never change one once shipped. */
  id: string
  href: string
  label: string
  /** The section it lives in until an admin moves it. */
  section: string
  /** Menu Access box (NAV_*) it needs; none for custom objects and external links. */
  navKey?: string
  /** Needs `level` (View unless stated) on this object. */
  object?: string
  level?: AccessLevel
  /** Shown only to people who can open this settings page (lib/settings-pages.ts). */
  settingsPage?: string
  /** An outside website — opens in a new tab. */
  external?: boolean
}

export interface NavSectionDef {
  id: string
  title: string
  /** lucide icon name (lib/nav-icons.tsx). */
  icon: string
}

/** Default rail order. */
export const NAV_SECTIONS: NavSectionDef[] = [
  { id: "referrals",      title: "Referrals",      icon: "Users" },
  { id: "appointments",   title: "Appointments",   icon: "ClipboardList" },
  { id: "scheduling",     title: "Scheduling",     icon: "CalendarRange" },
  { id: "scheduling-v2",  title: "Scheduling v2",  icon: "LayoutDashboard" },
  { id: "surgery",        title: "Surgery",        icon: "Stethoscope" },
  { id: "oncall",         title: "On-call",        icon: "PhoneIncoming" },
  { id: "communications", title: "Communications", icon: "MessageCircle" },
  { id: "reporting",      title: "Reporting",      icon: "BarChart3" },
  { id: "automations",    title: "Automations",    icon: "Workflow" },
  { id: "settings",       title: "Settings",       icon: "Settings" },
  // Custom objects land here until an admin places them elsewhere.
  { id: "objects",        title: "Objects",        icon: "Box" },
]

/** The Settings link can't be hidden — it's how an admin gets back to this editor. */
export const UNHIDEABLE_ITEMS = new Set(["settings.settings"])

const inSection = (section: string, navKey: string, items: Omit<NavItemDef, "section" | "navKey">[]): NavItemDef[] =>
  items.map((it) => ({ ...it, section, navKey }))

export const NAV_ITEMS: NavItemDef[] = [
  ...inSection("referrals", "NAV_REFERRALS", [
    { id: "referrals.dashboard",  href: "/",                  label: "Dashboard" },
    { id: "referrals.referrals",  href: "/referrals",         label: "Referrals",  object: "REFERRALS" },
    { id: "referrals.practices",  href: "/practices",         label: "Practices",  object: "PRACTICES" },
    { id: "referrals.locations",  href: "/locations",         label: "Locations",  object: "LOCATIONS" },
    { id: "referrals.providers",  href: "/referring-doctors", label: "Providers",  object: "PROVIDERS" },
    { id: "referrals.activities", href: "/activities",        label: "Activities", object: "ACTIVITIES" },
    { id: "referrals.tasks",      href: "/tasks",             label: "Tasks",      object: "TASKS" },
    { id: "referrals.segments",   href: "/segments",          label: "Segments",   object: "SEGMENTS" },
    { id: "referrals.sms-inbox",  href: "/messages",          label: "SMS Inbox",  object: "SMS" },
    { id: "referrals.analytics",  href: "/reports/referral-analytics", label: "Referral Analytics", object: "REPORTS" },
    { id: "referrals.broadcasts", href: "/broadcasts",        label: "Broadcasts", object: "BROADCASTS" },
  ]),
  ...inSection("appointments", "NAV_APPOINTMENTS", [
    { id: "appointments.completed", href: "/appointments",           label: "Completed Appts" },
    { id: "appointments.providers", href: "/appointments/providers", label: "Referring Providers" },
  ]),
  ...inSection("scheduling", "NAV_SCHEDULING", [
    { id: "scheduling.weekly", href: "/scheduler",       label: "Weekly Schedule" },
    { id: "scheduling.staff",  href: "/scheduler/staff", label: "Staff Roster" },
  ]),
  // The Operations Planner keeps its own nested sidebar, so the CRM's global nav
  // links only at its four sections.
  ...inSection("scheduling-v2", "NAV_SCHEDULING", [
    { id: "scheduling-v2.master",   href: "/scheduling-v2",                  label: "Master Schedule" },
    { id: "scheduling-v2.builder",  href: "/scheduling-v2/schedule-builder", label: "Schedule Builder" },
    { id: "scheduling-v2.roster",   href: "/scheduling-v2/roster",           label: "Roster" },
    { id: "scheduling-v2.settings", href: "/scheduling-v2/settings",         label: "Settings" },
  ]),
  ...inSection("surgery", "NAV_SURGERY", [
    { id: "surgery.cases",   href: "/surgery",         label: "Surgery Cases",   object: "SURGERY" },
    { id: "surgery.reports", href: "/surgery/reports", label: "Surgery Reports", object: "SURGERY" },
  ]),
  // "New call" is useless to someone who can only read the call log.
  ...inSection("oncall", "NAV_ONCALL", [
    { id: "oncall.new-call", href: "/on-call",                label: "New call", object: "CO:referral-calls", level: "EDIT" },
    { id: "oncall.call-log", href: "/objects/referral-calls", label: "Call log", object: "CO:referral-calls" },
  ]),
  ...inSection("communications", "NAV_COMMUNICATIONS", [
    { id: "communications.sms",       href: "/communications/sms",       label: "SMS",       object: "TEMPLATES" },
    { id: "communications.email",     href: "/communications/email",     label: "Email",     object: "TEMPLATES" },
    { id: "communications.documents", href: "/communications/documents", label: "Documents", object: "TEMPLATES" },
    { id: "communications.media",     href: "/communications/media",     label: "Media",     object: "TEMPLATES" },
  ]),
  ...inSection("reporting", "NAV_REPORTING", [
    { id: "reporting.dashboards", href: "/reports/dashboard", label: "Dashboards", object: "REPORTS" },
    { id: "reporting.reports",    href: "/reports",           label: "Reports",    object: "REPORTS" },
  ]),
  ...inSection("automations", "NAV_AUTOMATIONS", [
    { id: "automations.workflows", href: "/automations",        label: "Workflows", object: "AUTOMATIONS" },
    { id: "automations.reconcile", href: "/settings/reconcile", label: "Appt Reconciliation", settingsPage: "reconcile" },
  ]),
  // Admin/config pages live in the Settings page's own nav; the sidebar just links
  // to Settings, which lands on the first page this person can open.
  ...inSection("settings", "NAV_ADMIN", [
    { id: "settings.settings", href: "/settings", label: "Settings" },
  ]),
]

/** Each custom object is a menu item, gated by View access to it. */
export function customObjectNavItems(objects: { key: string; plural: string }[]): NavItemDef[] {
  return objects.map((o) => ({
    id: `co:${o.key}`,
    href: `/objects/${o.key}`,
    label: o.plural,
    section: "objects",
    object: `CO:${o.key}`,
  }))
}
