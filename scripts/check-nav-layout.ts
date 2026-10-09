/**
 * The sidebar menu and its Settings → Navigation layout (lib/nav-catalog.ts,
 * lib/nav-layout.ts).
 *
 *   npx tsx --env-file=.env.local scripts/check-nav-layout.ts
 *
 * Targets are DERIVED, never listed: menu links are checked against the page
 * routes found on disk; access is compared for every real user (with their
 * teams) and team permission set in the database, read-only.
 *
 * 1. Catalog — ids unique; every link opens a real page; every icon exists.
 * 2. Default — no saved layout = every item once, in catalog order; every custom
 *    object gets an item.
 * 3. Access — rearranging (one scrambled layout: everything moved, renamed,
 *    reordered) shows every real permission set exactly the same pages.
 * 4. Resolver + validator rules, and mutation tests proving the checks can fail.
 * 5. A rolled-back DB write of a layout is read back by the loader.
 */
import { readdirSync, statSync } from "fs"
import { join, relative, sep } from "path"
import { prisma } from "../lib/prisma"
import { NAV_ITEMS, NAV_SECTIONS, UNHIDEABLE_ITEMS } from "../lib/nav-catalog"
import { resolveNav, visibleNav, sanitizeNavLayout, allNavItems, type NavLayoutData, type ResolvedNavSection, type NavViewer } from "../lib/nav-layout"
import { NAV_ICONS, isNavIcon } from "../lib/nav-icons"
import { getNavLayout } from "../lib/nav-layout-server"

let failures = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${!ok && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`)
}

// ── Page routes on disk ───────────────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name === "page.tsx" || name === "page.ts") out.push(p)
  }
  return out
}
/** Route segments of each page, route groups "(x)" removed. */
const ROUTES: string[][] = walk(join(process.cwd(), "app")).map((p) =>
  relative(join(process.cwd(), "app"), p).split(sep).slice(0, -1).filter((s) => !/^\(.*\)$/.test(s)))

function routeExists(href: string): boolean {
  const segs = href.split("?")[0].split("/").filter(Boolean)
  return ROUTES.some((r) => {
    for (let i = 0; i < r.length; i++) {
      if (/^\[\.\.\..+\]$/.test(r[i]) || /^\[\[\.\.\..+\]\]$/.test(r[i])) return segs.length >= i
      if (i >= segs.length) return false
      if (!/^\[.+\]$/.test(r[i]) && r[i] !== segs[i]) return false
    }
    return r.length === segs.length
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const hrefsOf = (sections: ResolvedNavSection[]) => sections.flatMap((s) => s.items.map((i) => i.href)).sort()
const idsOf = (sections: ResolvedNavSection[]) => sections.flatMap((s) => s.items.map((i) => i.id))
const isIcon = (n: unknown) => isNavIcon(n)

/** Everything moved into new sections, reversed, renamed; built-ins reordered and retitled. */
function scrambled(customObjects: { key: string; plural: string }[]): NavLayoutData {
  const ids = allNavItems(customObjects).map((i) => i.id).reverse()
  const half = Math.ceil(ids.length / 2)
  return {
    version: 1,
    sections: [
      { id: "custom:everything-a", title: "Everything A", icon: "Trophy", items: ids.slice(0, half) },
      ...NAV_SECTIONS.slice().reverse().map((s) => ({ id: s.id, title: `${s.title} (renamed)`, icon: "Star", items: [] })),
      { id: "custom:everything-b", title: "Everything B", icon: "Rocket", items: ids.slice(half) },
    ],
    labels: Object.fromEntries(ids.map((id) => [id, `Renamed ${id}`])),
    hidden: [],
    links: [],
  }
}

async function permissionSets(): Promise<{ label: string; me: NavViewer }[]> {
  const sets: { label: string; me: NavViewer }[] = [
    { label: "admin", me: { role: "ADMIN", permissions: [] } },
    { label: "no permissions", me: { role: "STAFF", permissions: [] } },
    { label: "one menu box", me: { role: "STAFF", permissions: ["NAV_REFERRALS"] } },
    { label: "settings page box only", me: { role: "STAFF", permissions: ["SETTINGS_IMPORT"] } },
  ]
  const teams = await prisma.team.findMany({ select: { name: true, permissions: true } })
  for (const t of teams) sets.push({ label: `team ${t.name}`, me: { role: "STAFF", permissions: t.permissions } })
  const users = await prisma.user.findMany({ select: { id: true, role: true, permissions: true, teamMemberships: { select: { team: { select: { permissions: true } } } } } })
  for (const u of users) {
    const perms = Array.from(new Set([...(u.permissions ?? []), ...u.teamMemberships.flatMap((m) => m.team.permissions)]))
    sets.push({ label: `user ${u.id}`, me: { role: u.role, permissions: perms } })
  }
  return sets
}

// ── 1. Catalog ────────────────────────────────────────────────────────────────

function catalogChecks(customObjects: { key: string; plural: string }[]) {
  check(`found ${ROUTES.length} page routes on disk`, ROUTES.length > 40, ROUTES.length)
  const ids = NAV_ITEMS.map((i) => i.id)
  check("item ids are unique", new Set(ids).size === ids.length)
  check("section ids are unique", new Set(NAV_SECTIONS.map((s) => s.id)).size === NAV_SECTIONS.length)
  const broken = allNavItems(customObjects).filter((i) => !i.external && !routeExists(i.href)).map((i) => `${i.id} → ${i.href}`)
  check(`every menu link (${allNavItems(customObjects).length}) opens a page that exists`, broken.length === 0, broken)
  check("every item's default section exists", NAV_ITEMS.every((i) => NAV_SECTIONS.some((s) => s.id === i.section)))
  check("every default section icon is in the icon set", NAV_SECTIONS.every((s) => isNavIcon(s.icon)), NAV_SECTIONS.filter((s) => !isNavIcon(s.icon)))
  const notComponents = Object.entries(NAV_ICONS).filter(([, d]) => !d.Icon || (typeof d.Icon !== "function" && typeof d.Icon !== "object")).map(([n]) => n)
  check(`every icon in the set (${Object.keys(NAV_ICONS).length}) is a real component`, notComponents.length === 0, notComponents)
  check("every built-in item has a Menu Access box", NAV_ITEMS.every((i) => !!i.navKey))
}

// ── 2. Default menu ───────────────────────────────────────────────────────────

function defaultChecks(customObjects: { key: string; plural: string }[]) {
  const nav = resolveNav(null, customObjects)
  const ids = idsOf(nav)
  const all = allNavItems(customObjects).map((i) => i.id)
  check("default: every item exactly once", ids.length === all.length && new Set(ids).size === ids.length && all.every((id) => ids.includes(id)))
  check("default: sections in catalog order", JSON.stringify(nav.map((s) => s.id)) === JSON.stringify(NAV_SECTIONS.map((s) => s.id)))
  check("default: items in catalog order", JSON.stringify(ids) === JSON.stringify(all))
  check(`default: each of the ${customObjects.length} custom objects has an item`, customObjects.every((o) => ids.includes(`co:${o.key}`)))
  check("default: nothing renamed or hidden", nav.every((s) => s.items.every((i) => i.label === i.defaultLabel && !i.hidden)))
}

// ── 3. Access is unchanged by rearranging ─────────────────────────────────────

async function accessChecks(customObjects: { key: string; plural: string }[]) {
  const sets = await permissionSets()
  const layout = scrambled(customObjects)
  const sane = sanitizeNavLayout(layout, { customObjectKeys: customObjects.map((o) => o.key), isIcon })
  check("the scrambled layout passes the validator", "layout" in sane, sane)
  const differs: string[] = []
  for (const s of sets) {
    const a = hrefsOf(visibleNav(resolveNav(null, customObjects), s.me))
    const b = hrefsOf(visibleNav(resolveNav(layout, customObjects), s.me))
    if (JSON.stringify(a) !== JSON.stringify(b)) differs.push(s.label)
  }
  check(`rearranging shows each of ${sets.length} real permission sets exactly the same pages`, differs.length === 0, differs)

  // Mutation: a resolver that lets an item drop its Menu Access box when moved
  // must be caught by the same comparison.
  const leaky = (sections: ResolvedNavSection[], me: NavViewer) => visibleNav(
    sections.map((sec) => ({ ...sec, items: sec.items.map((it) => (sec.custom ? { ...it, navKey: undefined } : it)) })), me)
  const caught = sets.some((s) => JSON.stringify(hrefsOf(visibleNav(resolveNav(null, customObjects), s.me))) !==
    JSON.stringify(hrefsOf(leaky(resolveNav(layout, customObjects), s.me))))
  check("mutation: a move that drops the Menu Access gate is detected", caught)
}

// ── 4. Resolver and validator rules ───────────────────────────────────────────

function ruleChecks(customObjects: { key: string; plural: string }[]) {
  const keys = customObjects.map((o) => o.key)
  const ctx = { customObjectKeys: keys, isIcon }
  const base = (): NavLayoutData => ({ version: 1, sections: [{ id: "referrals", items: ["referrals.dashboard"] }], labels: {}, hidden: [], links: [] })

  // Resolver
  const partial = resolveNav(base(), customObjects)
  check("an item the layout doesn't place goes to its default section",
    partial.find((s) => s.id === "referrals")!.items.some((i) => i.id === "referrals.tasks"))
  check("a section the layout doesn't mention is still there", partial.some((s) => s.id === "surgery"))
  const gone = resolveNav({ ...base(), sections: [{ id: "objects", items: ["co:no-such-object"] }] }, customObjects)
  check("a deleted custom object is dropped", !idsOf(gone).includes("co:no-such-object"))
  const hid = resolveNav({ ...base(), hidden: ["referrals.broadcasts", "settings.settings"] }, customObjects)
  check("a hidden item is flagged and leaves the menu",
    hid.flatMap((s) => s.items).find((i) => i.id === "referrals.broadcasts")?.hidden === true &&
    !hrefsOf(visibleNav(hid, { role: "ADMIN" })).includes("/broadcasts"))
  check("Settings can't be hidden, even by a stored layout",
    hrefsOf(visibleNav(hid, { role: "ADMIN" })).includes("/settings") && UNHIDEABLE_ITEMS.has("settings.settings"))
  const renamed = resolveNav({ ...base(), labels: { "referrals.dashboard": "Home" }, sections: [{ id: "referrals", title: "Intake", icon: "Trophy", items: [] }] }, customObjects)
  const ref = renamed.find((s) => s.id === "referrals")!
  check("renames and icons apply", ref.title === "Intake" && ref.icon === "Trophy" && ref.items.find((i) => i.id === "referrals.dashboard")?.label === "Home")
  const dup = visibleNav(resolveNav(null, customObjects), { role: "ADMIN" })
  check("a page listed twice shows once (call log not also under Objects)",
    hrefsOf(dup).filter((h) => h === "/objects/referral-calls").length <= 1)

  // Validator
  const ok = sanitizeNavLayout({ ...base(), links: [{ id: "ext:epic", label: "Epic", url: "https://epic.example.com" }], sections: [{ id: "referrals", items: ["referrals.dashboard", "ext:epic"] }] }, ctx)
  check("validator: a good layout passes", "layout" in ok, ok)
  const refuses = (label: string, input: unknown) => {
    const r = sanitizeNavLayout(input, ctx)
    check(`validator refuses ${label}`, "error" in r, r)
  }
  refuses("a non-layout", { nope: true })
  refuses("an unknown item", { ...base(), sections: [{ id: "referrals", items: ["referrals.nope"] }] })
  refuses("an item twice", { ...base(), sections: [{ id: "referrals", items: ["referrals.tasks"] }, { id: "surgery", items: ["referrals.tasks"] }] })
  refuses("a section twice", { ...base(), sections: [{ id: "referrals", items: [] }, { id: "referrals", items: [] }] })
  refuses("an invalid section id", { ...base(), sections: [{ id: "custom:<script>", title: "X", icon: "Star", items: [] }] })
  refuses("a new section without a name", { ...base(), sections: [{ id: "custom:a", title: " ", icon: "Star", items: [] }] })
  refuses("a new section without an icon", { ...base(), sections: [{ id: "custom:a", title: "A", items: [] }] })
  refuses("an icon outside the set", { ...base(), sections: [{ id: "referrals", icon: "NotAnIcon", items: [] }] })
  refuses("a javascript: link", { ...base(), links: [{ id: "ext:x", label: "X", url: "javascript:alert(1)" }], sections: [{ id: "referrals", items: ["ext:x"] }] })
  refuses("a data: link", { ...base(), links: [{ id: "ext:x", label: "X", url: "data:text/html,hi" }], sections: [{ id: "referrals", items: ["ext:x"] }] })
  refuses("an ftp link", { ...base(), links: [{ id: "ext:x", label: "X", url: "ftp://files.example.com" }], sections: [{ id: "referrals", items: ["ext:x"] }] })
  refuses("a link without a name", { ...base(), links: [{ id: "ext:x", label: "", url: "https://a.example.com" }], sections: [{ id: "referrals", items: ["ext:x"] }] })
  refuses("a link that isn't in a section", { ...base(), links: [{ id: "ext:x", label: "X", url: "https://a.example.com" }] })
  refuses("hiding Settings", { ...base(), hidden: ["settings.settings"] })
  const quiet = sanitizeNavLayout({ ...base(), sections: [{ id: "objects", items: ["co:deleted-meanwhile"] }] }, ctx)
  check("validator quietly drops a custom object deleted while the editor was open",
    "layout" in quiet && !quiet.layout.sections[0].items.includes("co:deleted-meanwhile"), quiet)
  const tidy = sanitizeNavLayout({ ...base(), sections: [{ id: "referrals", title: "Referrals", icon: "Users", items: [] }], labels: { "referrals.tasks": "Tasks" } }, ctx)
  check("validator stores no override equal to the default",
    "layout" in tidy && !tidy.layout.sections[0].title && !tidy.layout.sections[0].icon && !("referrals.tasks" in (tidy.layout.labels ?? {})), tidy)

  // Mutation: the route check must flag a page that doesn't exist.
  check("mutation: a link to a missing page is flagged", !routeExists("/no-such-page") && routeExists("/objects/anything") && routeExists("/"))
}

// ── 5. DB round-trip, rolled back ─────────────────────────────────────────────

const ROLLBACK = new Error("rollback")
/** JSONB stores object keys in its own order — compare content, not key order. */
const canonical = (v: unknown): string => JSON.stringify(v, (_k, x) =>
  x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x)

async function dbCheck(customObjects: { key: string; plural: string }[]) {
  const before = await prisma.navLayout.findUnique({ where: { id: "default" } })
  const sane = sanitizeNavLayout(scrambled(customObjects), { customObjectKeys: customObjects.map((o) => o.key), isIcon })
  if (!("layout" in sane)) { check("DB test layout is valid", false, sane); return }
  let read: NavLayoutData | null = null
  try {
    await prisma.$transaction(async (tx) => {
      await tx.navLayout.upsert({ where: { id: "default" }, create: { id: "default", data: sane.layout as any }, update: { data: sane.layout as any } })
      read = await getNavLayout(tx)
      throw ROLLBACK
    })
  } catch (e) { if (e !== ROLLBACK) throw e }
  check("a saved layout is read back by the loader", canonical(read) === canonical(sane.layout))
  const after = await prisma.navLayout.findUnique({ where: { id: "default" } })
  check("the test write was rolled back", canonical(after) === canonical(before))
}

async function main() {
  const customObjects = await prisma.customObjectDef.findMany({ orderBy: [{ order: "asc" }, { plural: "asc" }], select: { key: true, plural: true } })
  catalogChecks(customObjects)
  defaultChecks(customObjects)
  await accessChecks(customObjects)
  ruleChecks(customObjects)
  await dbCheck(customObjects)
  // The live layout, if any, still resolves and validates.
  const live = await getNavLayout()
  if (live) {
    const r = sanitizeNavLayout(live, { customObjectKeys: customObjects.map((o) => o.key), isIcon })
    check("the saved layout still validates", "layout" in r, r)
  }
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED")
  await prisma.$disconnect()
  process.exit(failures ? 1 : 0)
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
