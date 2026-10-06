/**
 * Per-page Settings permissions (lib/settings-pages.ts), checked against the
 * source and the real permission sets. Read-only.
 *
 *   npx tsx --env-file=.env.local scripts/check-settings-access.ts
 *
 * Targets are DERIVED, never listed: every settings page file found on disk, and
 * every server action those pages' components import (followed through their
 * import statements) — a hand-written list is how a new page ships ungated.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "fs"
import { join, relative } from "path"
import { prisma } from "../lib/prisma"
import { SETTINGS_PAGES, canOpenSettingsPage, settingsPageForPath } from "../lib/settings-pages"
import { ungrantable, canManageAccess, holdsPermission, userCanLevel, userCan } from "../lib/permissions"

let failures = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${!ok && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`)
}

const ROOT = process.cwd()
const SETTINGS_DIR = join(ROOT, "app", "(dashboard)", "settings")
const read = (p: string) => readFileSync(p, "utf8")

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name === "page.tsx") out.push(p)
  }
  return out
}

// "@/x/y" → a file on disk (.ts/.tsx), or null.
function resolveAlias(spec: string): string | null {
  if (!spec.startsWith("@/")) return null
  const base = join(ROOT, spec.slice(2))
  for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) if (existsSync(base + ext)) return base + ext
  return null
}

// Server actions a page reaches: imports from "@/app/actions/*" in the page and,
// recursively, in the components it imports.
function actionsReachedFrom(file: string, seen = new Set<string>()): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  if (seen.has(file)) return out
  seen.add(file)
  const src = read(file)
  for (const m of Array.from(src.matchAll(/import\s+(?:type\s+)?(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*"([^"]+)"/g))) {
    const spec = m[3]
    if (spec.startsWith("@/app/actions/")) {
      if (/^import\s+type/.test(m[0])) continue
      const names = (m[2] ?? "").split(",").map((x) => x.trim()).filter((x) => x && !x.startsWith("type "))
        .map((x) => x.split(/\s+as\s+/)[0].trim())
      const f = resolveAlias(spec)
      if (f) { if (!out.has(f)) out.set(f, new Set()); names.forEach((n) => out.get(f)!.add(n)) }
    } else if (spec.startsWith("@/components/")) {
      const f = resolveAlias(spec)
      if (f) for (const [k, v] of Array.from(actionsReachedFrom(f, seen))) {
        if (!out.has(k)) out.set(k, new Set())
        v.forEach((n) => out.get(k)!.add(n))
      }
    }
  }
  return out
}

function functionBody(src: string, name: string): string | null {
  const start = src.search(new RegExp(`export async function ${name}\\b`))
  if (start < 0) return null
  const next = src.indexOf("\nexport ", start + 10)
  return src.slice(start, next < 0 ? undefined : next)
}

// What counts as a gate inside a settings action.
const GATES: [RegExp, string][] = [
  [/requireSettingsPage\(|hasSettingsPage\(/, "settings page"],
  [/requirePageAccess\(\)|requireIntegration(View|Edit)\(\)|requireFilesAnywhere\(\)|requireTeamAccess\(/, "settings page (file helper)"],
  [/= \(\) => requireSettingsPage/, "settings page"],
  [/requireAdmin\(\)/, "file helper"], // users.ts aliases requireAdmin to requireSettingsPage("users") — verified below
  [/requireAuth\(\)/, "file helper"], // marketing.ts aliases requireAuth to requireSettingsPage("marketing") — verified below
  [/requireAccess\(importPermKey\(|userCanLevel\([^)]*importPermKey\(/, "per-object access (import, by design)"],
  [/canManage\(|userCanLevel\(user, "TEMPLATES", "EDIT"\)/, "Templates Edit (media library, shared)"],
]
// Reads every page — and much of the app — calls without a gate; out of scope,
// listed in the plan. Anything else ungated fails.
const KNOWN_UNGATED_READS = new Set([
  "listCustomProperties", "getPropertyDisplays", "listAssociationDefs", "listObjectTypes", "listCustomObjects",
  "getTeams", "getOrgRules", "getOrgRulesPoller", "getOrgRulesRunLogs", "getPipelineColorStyle", "getPipelineRules",
  "getNativeVisibilityControllers", "getOrgSignature", "getMySignature", "saveMySignature", "sendMyTestEmail",
  "importSignatureImages", "getCustomObject", "getPipelines", "getStagesForPipeline",
])

async function main() {
  // 1. Every settings page file belongs to a registry page and gates on it.
  const pages = walk(SETTINGS_DIR)
  console.log(`${pages.length} settings page files found\n`)
  for (const file of pages) {
    const route = "/" + relative(join(ROOT, "app", "(dashboard)"), file).replace(/\\/g, "/").replace(/\/page\.tsx$/, "")
    if (route === "/settings" || route === "/settings/account") { console.log(`     ${route} — index / your own account, no box`); continue }
    const reg = settingsPageForPath(route)
    check(`${route} belongs to a settings page`, !!reg)
    if (!reg) continue
    const src = read(file)
    const gated = src.includes(`settingsPageOrRedirect("${reg.slug}"`)
    check(`${route} gates on "${reg.slug}"`, gated)
    check(`${route} has no Admin-role check left`, !/role\s*!==\s*"ADMIN"/.test(src))

    // 2. Every action its components reach has a gate.
    for (const [actionFile, names] of Array.from(actionsReachedFrom(file))) {
      const src2 = read(actionFile)
      for (const name of Array.from(names)) {
        const body = functionBody(src2, name)
        if (!body) continue // re-export or non-function
        const gate = GATES.find(([re]) => re.test(body))?.[1]
        if (gate) continue
        if (KNOWN_UNGATED_READS.has(name)) continue
        check(`${route}: ${relative(ROOT, actionFile)} ${name}() has a gate`, false, body.slice(0, 120))
      }
    }
  }
  // The two file-local aliases really are settings gates.
  check("users.ts requireAdmin is the User Management gate", /const requireAdmin = \(\) => requireSettingsPage\("users"\)/.test(read(join(ROOT, "app/actions/users.ts"))))
  check("marketing.ts requireAuth is the Marketing gate", /const requireAuth = \(\) => requireSettingsPage\("marketing"\)/.test(read(join(ROOT, "app/actions/marketing.ts"))))
  check("every registry page has a page file", SETTINGS_PAGES.every((p) => pages.some((f) => f.replace(/\\/g, "/").includes(`/settings${p.href.slice("/settings".length)}/page.tsx`))))

  // 3. Delegated user management: can't grant beyond yourself.
  console.log("\nDelegated user management")
  const mgr = { role: "STAFF", permissions: ["SETTINGS_USERS", "NAV_REFERRALS", "REFERRALS:EDIT", "SETTINGS_IMPORT"] }
  check("EDIT holds VIEW", holdsPermission(mgr.permissions, "REFERRALS:VIEW"))
  check("VIEW doesn't hold EDIT", !holdsPermission(["REFERRALS:VIEW"], "REFERRALS:EDIT"))
  check("can grant what they hold", ungrantable(mgr, ["REFERRALS:VIEW", "SETTINGS_IMPORT"]).length === 0)
  check("can't grant what they don't", ungrantable(mgr, ["SETTINGS_API_KEYS", "REFERRALS:DELETE"]).join() === "SETTINGS_API_KEYS,REFERRALS:DELETE")
  check("can't manage an admin", !canManageAccess(mgr, { role: "ADMIN", permissions: [] }))
  check("can't manage someone with more access", !canManageAccess(mgr, { role: "STAFF", permissions: ["SURGERY:EDIT"] }))
  check("can manage someone within their access", canManageAccess(mgr, { role: "STAFF", permissions: ["REFERRALS:VIEW"] }))
  check("Reports alone doesn't open Connected Apps", !canOpenSettingsPage({ role: "STAFF", permissions: ["REPORTS:EDIT"] }, "integrations"))
  check("an admin can grant and manage anything", ungrantable({ role: "ADMIN" }, ["X"]).length === 0 && canManageAccess({ role: "ADMIN" }, { role: "ADMIN", permissions: ["X"] }))

  // 4. Nobody loses a way in they have today (real permission sets, own + teams).
  console.log("\nExisting access (active non-admins)")
  const users = await prisma.user.findMany({
    where: { role: { not: "ADMIN" }, isActive: true },
    select: { name: true, role: true, permissions: true, teamMemberships: { select: { team: { select: { permissions: true } } } } },
  })
  let reportsUsers = 0, mergeUsers = 0
  for (const u of users) {
    const me = { role: u.role, permissions: Array.from(new Set([...u.permissions, ...u.teamMemberships.flatMap((m) => m.team.permissions)])) }
    if (userCanLevel(me, "REPORTS", "VIEW")) {
      reportsUsers++
      // User's decision (2026-10-06): Connected Apps is its own box; Reports alone no longer opens it.
      const hasBox = me.permissions.includes("SETTINGS_INTEGRATIONS")
      check(`${u.name}: Connected Apps follows its box only (has box: ${hasBox})`, canOpenSettingsPage(me, "integrations") === hasBox)
    }
    if (userCan(me, "MANAGE_USERS")) check(`${u.name}: Manage Users still opens API Keys`, canOpenSettingsPage(me, "api-keys"))
    if (userCan(me, "MERGE_RECORDS")) mergeUsers++
  }
  console.log(`     ${reportsUsers} with Reports, ${mergeUsers} with Merge Records (merge actions accept it — gated in referring-doctors.ts)`)
  const mergeSrc = read(join(ROOT, "app/actions/referring-doctors.ts"))
  check("merge actions still accept Merge Records", (mergeSrc.match(/alsoAllow: \(u\) => userCan\(u, "MERGE_RECORDS"\)/g) ?? []).length === 4)
}

main()
  .catch((e) => { failures++; console.error("ERROR", e instanceof Error ? e.stack : e) })
  .finally(async () => {
    await prisma.$disconnect()
    console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED")
    process.exit(failures ? 1 : 0)
  })
