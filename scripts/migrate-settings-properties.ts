/**
 * One-off (2026-10-07): give the new Properties settings box to everyone who held
 * the boxes it replaced — Custom Properties and Property Customization.
 *
 *   npx tsx --env-file=.env.local scripts/migrate-settings-properties.ts          # dry run
 *   npx tsx --env-file=.env.local scripts/migrate-settings-properties.ts --apply
 *
 * ADDITIVE: the old keys stay, so the version still running in production (which
 * reads them) keeps working until this change is deployed; the new code reads
 * them too (lib/settings-pages.ts alsoOpenedBy). Idempotent.
 */
import { prisma } from "../lib/prisma"

const OLD = ["SETTINGS_CUSTOM_PROPERTIES", "SETTINGS_CUSTOMIZATION"]
const NEW = "SETTINGS_PROPERTIES"
const apply = process.argv.includes("--apply")

async function main() {
  const [users, teams] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true, email: true, permissions: true } }),
    prisma.team.findMany({ select: { id: true, name: true, permissions: true } }),
  ])
  const needs = (perms: string[]) => perms.some((p) => OLD.includes(p)) && !perms.includes(NEW)

  for (const u of users.filter((u) => needs(u.permissions))) {
    console.log(`user  ${u.name ?? u.email}`)
    if (apply) await prisma.user.update({ where: { id: u.id }, data: { permissions: { set: [...u.permissions, NEW] } } })
  }
  for (const t of teams.filter((t) => needs(t.permissions))) {
    console.log(`team  ${t.name}`)
    if (apply) await prisma.team.update({ where: { id: t.id }, data: { permissions: { set: [...t.permissions, NEW] } } })
  }
  console.log(apply ? "applied" : "dry run — pass --apply to write")
}

main().finally(() => prisma.$disconnect())
