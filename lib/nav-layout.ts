// The organisation's menu layout (Settings → Navigation) and how it becomes the
// sidebar. Pure — shared by the sidebar, the editor's live preview, the server's
// validator and scripts/check-nav-layout.ts.
//
// Rules:
// - No saved layout = the default menu (lib/nav-catalog.ts) exactly.
// - An item nobody placed (a page or custom object added later) appears in its
//   default section; an id that no longer exists (a deleted object) is dropped.
// - Access travels with each item (see nav-catalog): rearranging never shows an
//   item to anyone new or hides it from anyone. A section shows when one of its
//   items does.

import { NAV_ITEMS, NAV_SECTIONS, UNHIDEABLE_ITEMS, customObjectNavItems, type NavItemDef } from "@/lib/nav-catalog"
import { userCanLevel } from "@/lib/permissions"
import { canOpenSettingsPage, SETTINGS_PAGE_KEYS } from "@/lib/settings-pages"

export interface NavLayoutSection { id: string; title?: string; icon?: string; items: string[] }
export interface NavLink { id: string; label: string; url: string }
export interface NavLayoutData {
  version: 1
  /** Rail order. Built-in section ids override title/icon; `custom:<id>` are new sections. */
  sections: NavLayoutSection[]
  /** Item renames, by item id. */
  labels?: Record<string, string>
  hidden?: string[]
  links?: NavLink[]
}

export interface ResolvedNavItem extends NavItemDef { defaultLabel: string; hidden: boolean }
export interface ResolvedNavSection {
  id: string
  title: string
  icon: string
  /** The built-in default (null for a new section). */
  defaultTitle: string | null
  defaultIcon: string | null
  custom: boolean
  items: ResolvedNavItem[]
}

export const isCustomSectionId = (id: string) => /^custom:[a-z0-9-]{1,40}$/.test(id)
export const isLinkId = (id: string) => /^ext:[a-z0-9-]{1,40}$/.test(id)

/** Every item the menu can hold: the catalog, each custom object, the layout's links. */
export function allNavItems(customObjects: { key: string; plural: string }[], links: NavLink[] = []): NavItemDef[] {
  return [
    ...NAV_ITEMS,
    ...customObjectNavItems(customObjects),
    ...links.map((l): NavItemDef => ({ id: l.id, href: l.url, label: l.label, section: "", external: true })),
  ]
}

export function resolveNav(layout: NavLayoutData | null | undefined, customObjects: { key: string; plural: string }[]): ResolvedNavSection[] {
  const items = allNavItems(customObjects, layout?.links ?? [])
  const byId = new Map(items.map((it) => [it.id, it]))
  const hidden = new Set((layout?.hidden ?? []).filter((id) => !UNHIDEABLE_ITEMS.has(id)))
  const labels = layout?.labels ?? {}
  const placed = new Set<string>()
  const builtin = new Map(NAV_SECTIONS.map((s) => [s.id, s]))

  const resolveItem = (it: NavItemDef): ResolvedNavItem => ({
    ...it,
    label: it.external ? it.label : (labels[it.id]?.trim() || it.label),
    defaultLabel: it.label,
    hidden: hidden.has(it.id),
  })

  const sections: ResolvedNavSection[] = []
  const seenSections = new Set<string>()
  for (const s of layout?.sections ?? []) {
    if (seenSections.has(s.id)) continue
    const def = builtin.get(s.id)
    if (!def && !(isCustomSectionId(s.id) && s.title?.trim())) continue
    seenSections.add(s.id)
    const own = (s.items ?? []).filter((id) => byId.has(id) && !placed.has(id))
    own.forEach((id) => placed.add(id))
    sections.push({
      id: s.id,
      title: s.title?.trim() || def?.title || "",
      icon: s.icon || def?.icon || "Box",
      defaultTitle: def?.title ?? null,
      defaultIcon: def?.icon ?? null,
      custom: !def,
      items: own.map((id) => resolveItem(byId.get(id)!)),
    })
  }
  // Built-in sections the layout doesn't mention (none saved, or added since).
  for (const def of NAV_SECTIONS) {
    if (seenSections.has(def.id)) continue
    sections.push({ id: def.id, title: def.title, icon: def.icon, defaultTitle: def.title, defaultIcon: def.icon, custom: false, items: [] })
  }
  // Items nobody placed go to their default section, in catalog order. A link
  // always belongs to a section, so an unplaced one is dropped.
  const byIdSection = new Map(sections.map((s) => [s.id, s]))
  for (const it of items) {
    if (placed.has(it.id) || it.external) continue
    byIdSection.get(it.section)?.items.push(resolveItem(it))
  }
  return sections
}

export interface NavViewer { role?: string | null; permissions?: string[] | null }

/** Whether this person sees the item — the same gates the sidebar always applied. */
export function navItemVisible(item: NavItemDef, me: NavViewer): boolean {
  if (me.role === "ADMIN") return true
  const perms = me.permissions ?? []
  if (item.navKey) {
    // Settings shows for its menu box or any settings page's box. With no Menu
    // Access boxes at all (no team assigned) every other section shows.
    const ok = item.navKey === "NAV_ADMIN"
      ? perms.includes("NAV_ADMIN") || perms.some((p) => SETTINGS_PAGE_KEYS.includes(p))
      : !perms.some((p) => p.startsWith("NAV_")) || perms.includes(item.navKey)
    if (!ok) return false
  }
  if (item.object && !userCanLevel(me, item.object, item.level ?? "VIEW")) return false
  if (item.settingsPage && !canOpenSettingsPage(me, item.settingsPage)) return false
  return true
}

/**
 * What one person's sidebar shows: hidden items and items they can't open
 * removed, a page listed twice shown once (the first — this is what keeps the
 * call log under On-call rather than also under Objects), empty sections dropped.
 */
export function visibleNav(sections: ResolvedNavSection[], me: NavViewer): ResolvedNavSection[] {
  const seenHref = new Set<string>()
  return sections
    .map((s) => ({
      ...s,
      items: s.items.filter((it) => {
        if (it.hidden || !navItemVisible(it, me) || seenHref.has(it.href)) return false
        seenHref.add(it.href)
        return true
      }),
    }))
    .filter((s) => s.items.length > 0)
}

/** The layout an admin edits, from what the sidebar resolved — every item placed explicitly. */
export function layoutFromResolved(sections: ResolvedNavSection[], links: NavLink[]): NavLayoutData {
  const labels: Record<string, string> = {}
  const hidden: string[] = []
  for (const s of sections) for (const it of s.items) {
    if (!it.external && it.label !== it.defaultLabel) labels[it.id] = it.label
    if (it.hidden) hidden.push(it.id)
  }
  return {
    version: 1,
    sections: sections.map((s) => ({
      id: s.id,
      ...(s.custom || s.title !== s.defaultTitle ? { title: s.title } : {}),
      ...(s.custom || s.icon !== s.defaultIcon ? { icon: s.icon } : {}),
      items: s.items.map((it) => it.id),
    })),
    labels,
    hidden,
    links,
  }
}

const LABEL_MAX = 60
const TITLE_MAX = 40
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "")

export function isSafeLinkUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return (u.protocol === "https:" || u.protocol === "http:") && !!u.hostname
  } catch { return false }
}

/**
 * The server's check on a layout an admin saves. Refuses anything malformed;
 * quietly drops a custom object that was deleted while the editor was open.
 */
export function sanitizeNavLayout(
  input: unknown,
  ctx: { customObjectKeys: string[]; isIcon: (name: unknown) => boolean },
): { layout: NavLayoutData } | { error: string } {
  const raw = input as any
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.sections)) return { error: "That isn't a menu layout." }
  if (raw.sections.length > 40) return { error: "Too many sections (40 at most)." }

  // Links first — sections may hold them.
  const rawLinks: any[] = Array.isArray(raw.links) ? raw.links : []
  if (rawLinks.length > 50) return { error: "Too many links (50 at most)." }
  const links: NavLink[] = []
  for (const l of rawLinks) {
    const id = typeof l?.id === "string" ? l.id : ""
    const label = clean(l?.label, LABEL_MAX)
    const url = typeof l?.url === "string" ? l.url.trim() : ""
    if (!isLinkId(id)) return { error: "A link has an invalid id." }
    if (links.some((x) => x.id === id)) return { error: "Two links share an id." }
    if (!label) return { error: "Every link needs a name." }
    if (!isSafeLinkUrl(url)) return { error: `"${label}" needs a web address starting with https:// or http://.` }
    links.push({ id, label, url })
  }

  const catalogIds = new Set(NAV_ITEMS.map((i) => i.id))
  const objectIds = new Set(ctx.customObjectKeys.map((k) => `co:${k}`))
  const linkIds = new Set(links.map((l) => l.id))
  const builtin = new Map(NAV_SECTIONS.map((s) => [s.id, s]))

  const placed = new Set<string>()
  const sectionIds = new Set<string>()
  const sections: NavLayoutSection[] = []
  for (const s of raw.sections) {
    const id = typeof s?.id === "string" ? s.id : ""
    const def = builtin.get(id)
    if (!def && !isCustomSectionId(id)) return { error: "A section has an invalid id." }
    if (sectionIds.has(id)) return { error: "A section appears twice." }
    sectionIds.add(id)
    const title = clean(s?.title, TITLE_MAX)
    const icon = s?.icon
    if (!def && !title) return { error: "Every new section needs a name." }
    if (icon !== undefined && icon !== null && icon !== "" && !ctx.isIcon(icon)) return { error: "Pick an icon from the list." }
    if (!def && !icon) return { error: `"${title}" needs an icon.` }
    if (!Array.isArray(s?.items)) return { error: "A section's items must be a list." }
    const items: string[] = []
    for (const itemId of s.items) {
      if (typeof itemId !== "string") return { error: "An item id must be text." }
      if (itemId.startsWith("co:") && !objectIds.has(itemId)) continue // object deleted meanwhile
      if (!catalogIds.has(itemId) && !objectIds.has(itemId) && !linkIds.has(itemId)) return { error: "The menu names a page that doesn't exist." }
      if (placed.has(itemId)) return { error: "An item appears twice." }
      placed.add(itemId)
      items.push(itemId)
    }
    sections.push({
      id,
      ...(title && title !== def?.title ? { title } : {}),
      ...(icon && icon !== def?.icon ? { icon } : {}),
      items,
    })
  }
  for (const l of links) if (!placed.has(l.id)) return { error: `The link "${l.label}" isn't in a section.` }

  const known = (id: string) => catalogIds.has(id) || objectIds.has(id)
  const labels: Record<string, string> = {}
  for (const [id, v] of Object.entries(raw.labels && typeof raw.labels === "object" ? raw.labels : {})) {
    if (!known(id)) continue
    const label = clean(v, LABEL_MAX)
    const original = NAV_ITEMS.find((i) => i.id === id)?.label
    if (label && label !== original) labels[id] = label
  }
  const hidden: string[] = []
  for (const id of Array.isArray(raw.hidden) ? raw.hidden : []) {
    if (typeof id !== "string" || !(known(id) || linkIds.has(id))) continue
    if (UNHIDEABLE_ITEMS.has(id)) return { error: "Settings can't be hidden — it's how admins get back here." }
    if (!hidden.includes(id)) hidden.push(id)
  }
  return { layout: { version: 1, sections, labels, hidden, links } }
}
