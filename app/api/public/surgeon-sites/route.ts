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

import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateApiRequest, apiError } from "@/lib/api-tokens"

export const dynamic = "force-dynamic"

const SCOPE = "surgeon_sites:read"
const DRAFT_SCOPE = "surgeon_sites:read_draft"

/**
 * Does the key on a preview link match the one this site holds?
 *
 * Constant-time, so the comparison cannot be used to discover a token a
 * character at a time. Both are random and 52 characters long, which makes that
 * attack impractical anyway — but `timingSafeEqual` costs nothing and removes
 * the need to have made that judgement correctly.
 *
 * A site with no token has never been previewed, so no key can be valid for it.
 */
function matchesPreviewKey(given: string | null, stored: string | null): boolean {
  if (!given || !stored) return false
  const a = Buffer.from(given)
  const b = Buffer.from(stored)
  // timingSafeEqual throws on a length mismatch, which is itself a leak of one
  // bit; comparing lengths first is equivalent and does not throw.
  return a.length === b.length && timingSafeEqual(a, b)
}

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
  const url = new URL(req.url)
  const domain = url.searchParams.get("domain")

  // `?draft=1` asks for the draft instead of the published snapshot, so staff
  // can see a site before it goes live. It is authenticated against a DIFFERENT
  // scope, not merely flagged: a draft is work in progress — wording nobody has
  // signed off, a photograph that may still be replaced — and a token handed to
  // a public site must not be able to reach it. A token without the draft scope
  // gets 403 here rather than silently falling back to published content, which
  // would look like the draft simply having no changes.
  const wantsDraft = url.searchParams.get("draft") === "1"
  const auth = await authenticateApiRequest(req, wantsDraft ? DRAFT_SCOPE : SCOPE)
  if ("error" in auth) return auth.error

  // A draft read is always for ONE named site. There is no key that unlocks
  // every draft at once, and offering a bulk read would have to invent one.
  if (wantsDraft && !domain) {
    return apiError(400, "A draft read needs ?domain= — drafts are fetched one site at a time.", "bad_request")
  }

  try {
    // Normally only the published snapshot: a site being edited right now keeps
    // serving what it served yesterday, which is what makes editing safe. The
    // draft is included only for a caller that asked and proved the scope.
    const select = {
      slug: true,
      domain: true,
      status: true,
      redirectUrl: true,
      publishedContent: true,
      publishedAt: true,
      ...(wantsDraft ? { content: true, updatedAt: true, previewToken: true } : {}),
    }

    // A draft preview has to reach a DRAFT site too — that is the whole point,
    // seeing one before it goes live. Published reads keep the narrow list, so
    // a draft site is still invisible to the public sites.
    const statuses = wantsDraft
      ? ["DRAFT", "PUBLISHED", "REDIRECTED", "RETIRED"]
      : ["PUBLISHED", "REDIRECTED", "RETIRED"]

    if (domain) {
      const wanted = normalizeDomain(domain)
      // Matched in memory rather than by query so that "www." and casing are
      // handled the same way the site app handles its Host header.
      const rows = await (prisma as any).surgeonSite.findMany({
        where: { status: { in: statuses } },
        select,
      })
      const site = rows.find((r: any) => r.domain && normalizeDomain(r.domain) === wanted)

      if (!site) {
        return apiError(404, `No ${wantsDraft ? "" : "published "}site is served on "${domain}".`, "not_found")
      }
      if (wantsDraft) {
        // The site's own preview key, checked here rather than by the caller.
        // The CRM owns this content and already knows who may read it; making
        // the public site hold a copy of a secret to decide for itself was the
        // arrangement this replaces.
        //
        // The scope check above is a separate, independent gate: reading a
        // draft needs both a token allowed to read drafts AND this site's key.
        if (!matchesPreviewKey(url.searchParams.get("key"), site.previewToken)) {
          return apiError(403, "That preview link is not valid for this site.", "forbidden")
        }
        // Hand the draft back in the field the caller renders from, so nothing
        // downstream has to know which it asked for. The raw draft and the key
        // are dropped: one so it cannot be mistaken for published content, the
        // other because a response should not echo a secret back.
        const { content, previewToken: _t, ...rest } = site
        return NextResponse.json({
          site: { ...rest, publishedContent: content, isDraft: true },
        })
      }
      // A redirected or retired site still answers, because the site app needs
      // to know *how* to respond — 301 to the practice, or 410 so Google drops
      // the pages rather than retrying a 404 indefinitely.
      return NextResponse.json({ site })
    }

    // Published only — a draft read is rejected above unless it names a domain,
    // so this path never carries drafts and needs no branch for them.
    const sites = await (prisma as any).surgeonSite.findMany({
      where: { status: { in: statuses } },
      orderBy: { slug: "asc" },
      select,
    })
    return NextResponse.json({ sites })
  } catch (e: any) {
    console.error("surgeon-sites read failed:", e)
    return apiError(500, "Could not read surgeon sites.", "server_error")
  }
}
