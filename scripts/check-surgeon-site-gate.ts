/**
 * Prove the publish gate actually refuses an incomplete site.
 *
 * The gate is the whole safety mechanism: a surgeon's site must not be able to
 * go live until their own credentials and biography are filled in, because the
 * alternative — publishing with gaps — is what would otherwise be filled by
 * whatever the template carried. A rule that is never exercised is a rule that
 * quietly stops working, so this runs it end to end against the real database
 * and cleans up after itself.
 *
 *   npx tsx scripts/check-surgeon-site-gate.ts
 */

import fs from "fs"

for (const f of [".env.local", ".env"]) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
}

import { prisma } from "../lib/prisma"
import { emptyContent, missingCredentials, type SurgeonSiteContent } from "../lib/surgeon-site"

const SLUG = "zzz-gate-check"

function pass(label: string) { console.log(`  PASS  ${label}`) }
function fail(label: string, detail?: string): never {
  console.error(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`)
  process.exit(1)
}

async function main() {
  await (prisma as any).surgeonSite.deleteMany({ where: { slug: SLUG } })

  // 1. A brand-new site is not publishable, and says why.
  const blank = emptyContent()
  const missingBlank = missingCredentials(blank, null)
  if (missingBlank.length === 0) fail("a blank site should not be publishable")
  pass(`blank site blocked, ${missingBlank.length} items listed`)

  for (const required of ["Credentials (board certification, training)", "Biography paragraphs for the About page"]) {
    if (!missingBlank.includes(required)) fail(`blank site should require: ${required}`)
  }
  pass("credentials and biography are both required")

  // 2. Filling everything *except* the credentials still blocks it. This is the
  //    case that matters: a site can look finished and still be missing the one
  //    thing that must not be inherited.
  const almost: SurgeonSiteContent = {
    ...blank,
    name: "Ada Testwell, MD",
    shortName: "Dr. Testwell",
    title: "Board-Certified Orthopedic Surgeon",
    baseUrl: "https://example.invalid",
    email: "example@genesisortho.com",
    phone: "(555) 000-1111",
    description: "An orthopedic surgeon in Exampleton.",
    clinics: [{
      slug: "exampleton", name: "Exampleton", city: "Exampleton", day: "Tuesdays",
      street: "1 Example Way", cityStateZip: "Exampleton, IL 60000",
      mapQuery: "1 Example Way", bookingUrl: "https://example.invalid/book",
      lead: "Dr. Testwell sees patients on Tuesdays.", intro: [],
      seoTitle: "Exampleton", seoDescription: "Exampleton clinic.",
    }],
  }
  const missingAlmost = missingCredentials(almost, "example.invalid")
  if (missingAlmost.length === 0) fail("a site with no credentials should still be blocked")
  pass(`complete-looking site still blocked: ${missingAlmost.join("; ")}`)

  // 3. With the surgeon's own credentials and biography, it passes.
  const complete: SurgeonSiteContent = {
    ...almost,
    credentials: [{ label: "Board certified", detail: "Orthopedic surgery" }],
    profile: { ...almost.profile, bio: ["Dr. Testwell trained at the Example Institute."] },
  }
  const missingComplete = missingCredentials(complete, "example.invalid")
  if (missingComplete.length > 0) fail("a complete site should publish", missingComplete.join("; "))
  pass("complete site is publishable")

  // 4. The round trip through the database preserves the shape, since the site
  //    app reads this JSON and renders from it directly.
  const row = await (prisma as any).surgeonSite.create({
    data: { slug: SLUG, name: "Gate Check", status: "DRAFT", content: complete },
  })
  const read = await (prisma as any).surgeonSite.findUnique({ where: { id: row.id } })
  const back = read.content as SurgeonSiteContent
  if (back.credentials?.[0]?.detail !== "Orthopedic surgery") fail("credentials did not survive the round trip")
  if (back.clinics?.[0]?.slug !== "exampleton") fail("clinics did not survive the round trip")
  if (back.profile?.bio?.length !== 1) fail("biography did not survive the round trip")
  pass("content round-trips through the database intact")

  await (prisma as any).surgeonSite.delete({ where: { id: row.id } })
  pass("test row removed")
  console.log("\nAll checks passed.")
}

main()
  .catch((e) => { console.error("FAILED:", e); process.exit(1) })
  .finally(() => prisma.$disconnect())
