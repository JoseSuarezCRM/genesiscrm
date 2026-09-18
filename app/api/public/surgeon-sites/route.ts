/**
 * What the public surgeon sites read to render themselves.
 *
 * The site app runs on separate infrastructure with no database credentials. It
 * asks this endpoint for the surgeon whose domain was requested, and gets back
 * only what has been *published* — never the draft, never anything else in the
 * CRM. That one-way boundary is the point: a marketing site is the most-scanned
 * surface an org puts online, and a flaw in one must not be able to reach PHI.
 *
 *   GET /api/public/surgeon-sites?domain=nolanhornermd.com
 *   GET /api/public/surgeon-sites            → every published site
 *
 * Authorization: Bearer <token with the "surgeon_sites:read" scope>.
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateApiRequest, apiError } from "@/lib/api-tokens"

export const dynamic = "force-dynamic"

const SCOPE = "surgeon_sites:read"

/** Compare hosts the way a browser would: case-insensitively, without www. */
function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split(":")[0]
    .replace(/^www\./, "")
}

export async function GET(req: Request) {
  const auth = await authenticateApiRequest(req, SCOPE)
  if ("error" in auth) return auth.error

  const url = new URL(req.url)
  const domain = url.searchParams.get("domain")

  try {
    // Only ever the published snapshot. A site being edited right now keeps
    // serving what it served yesterday, which is what makes editing safe.
    const select = {
      slug: true,
      domain: true,
      status: true,
      redirectUrl: true,
      publishedContent: true,
      publishedAt: true,
    }

    if (domain) {
      const wanted = normalizeDomain(domain)
      // Matched in memory rather than by query so that "www." and casing are
      // handled the same way the site app handles its Host header.
      const rows = await (prisma as any).surgeonSite.findMany({
        where: { status: { in: ["PUBLISHED", "REDIRECTED", "RETIRED"] } },
        select,
      })
      const site = rows.find((r: any) => r.domain && normalizeDomain(r.domain) === wanted)

      if (!site) {
        return apiError(404, `No published site is served on "${domain}".`, "not_found")
      }
      // A redirected or retired site still answers, because the site app needs
      // to know *how* to respond — 301 to the practice, or 410 so Google drops
      // the pages rather than retrying a 404 indefinitely.
      return NextResponse.json({ site })
    }

    const sites = await (prisma as any).surgeonSite.findMany({
      where: { status: { in: ["PUBLISHED", "REDIRECTED", "RETIRED"] } },
      orderBy: { slug: "asc" },
      select,
    })
    return NextResponse.json({ sites })
  } catch (e: any) {
    console.error("surgeon-sites read failed:", e)
    return apiError(500, "Could not read surgeon sites.", "server_error")
  }
}
