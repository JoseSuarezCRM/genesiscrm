import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { userCan, userCanLevel, userCanDelete, type AccessLevel, type SessionUserLike } from "@/lib/permissions"
import { canOpenSettingsPage, settingsPage } from "@/lib/settings-pages"

// Server-side gate for a binary capability (Export, Import, Merge, etc).
export async function requirePermission(key: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  if (!userCan(session.user as any, key)) throw new Error("You don't have permission to do this")
  return session
}

// Server-side gate for graded object access (VIEW / EDIT).
export async function requireAccess(objectKey: string, level: AccessLevel) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  if (!userCanLevel(session.user as any, objectKey, level)) throw new Error("You don't have permission to do this")
  return session
}

// Server-side gate that passes if the user has `level` on ANY of the given
// objects. Used where a record is reachable from more than one object surface —
// e.g. a location can be edited from the Locations object or from its Practice.
export async function requireAnyAccess(objectKeys: string[], level: AccessLevel) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  if (!objectKeys.some((k) => userCanLevel(session.user as any, k, level))) {
    throw new Error("You don't have permission to do this")
  }
  return session
}

// Delete variant of requireAnyAccess.
export async function requireAnyDelete(objectKeys: string[]) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  if (!objectKeys.some((k) => userCanDelete(session.user as any, k))) {
    throw new Error("You don't have permission to delete this")
  }
  return session
}

// Page guard: redirect away if the user has no View access to an object, so
// "No access" objects aren't reachable (even by deep link). Returns the session.
export async function requireView(objectKey: string, to = "/") {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!userCanLevel(session.user as any, objectKey, "VIEW")) redirect(to)
  return session
}

// ── Settings pages (lib/settings-pages.ts) ────────────────────────────────────
// Each settings page has its own permission, SETTINGS_<SLUG>. These gates are
// used on the page AND on every action behind it, so a page can't be opened by
// URL, or its actions called directly, without the page's box. `alsoAllow`
// covers an action that a non-settings permission has always opened too (e.g.
// Reports for IntakeQ, Merge Records for merging).

export interface SettingsGateOptions {
  /** Another permission that also allows THIS action or sub-page. */
  alsoAllow?: (user: SessionUserLike) => boolean
  /**
   * Ignore the page's own older way in (`alsoOpenedBy`). Connected Apps opens to
   * anyone with Reports View, but IntakeQ's saves need Reports Edit and
   * FilesAnywhere needed Manage Users — those pass `boxOnly` plus their own
   * `alsoAllow`, so view-only Reports users don't gain them.
   */
  boxOnly?: boolean
}

function settingsAllowed(user: SessionUserLike | null | undefined, slug: string, opts: SettingsGateOptions = {}): boolean {
  if (!user) return false
  const ok = opts.boxOnly
    ? user.role === "ADMIN" || (user.permissions ?? []).includes(settingsPage(slug).key)
    : canOpenSettingsPage(user, slug)
  return ok || !!opts.alsoAllow?.(user)
}

/** Action gate: throws unless the user may use this settings page. */
export async function requireSettingsPage(slug: string, opts?: SettingsGateOptions) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  if (!settingsAllowed(session.user as any, slug, opts)) throw new Error("You don't have permission to do this")
  return session
}

/** The same check as a boolean, for actions that return `{ error }` instead of throwing. */
export async function hasSettingsPage(slug: string, opts?: SettingsGateOptions): Promise<boolean> {
  const session = await auth()
  return settingsAllowed(session?.user as any, slug, opts)
}

/** Page gate: back to /settings (which lands on a page they can open) when they can't use this one. */
export async function settingsPageOrRedirect(slug: string, opts?: SettingsGateOptions) {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!settingsAllowed(session.user as any, slug, opts)) redirect("/settings")
  return session
}

// Server-side gate for the separate delete capability.
export async function requireDelete(objectKey: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  if (!userCanDelete(session.user as any, objectKey)) throw new Error("You don't have permission to delete this")
  return session
}
