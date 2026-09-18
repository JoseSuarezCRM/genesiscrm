"use server"

/**
 * Authoring for the surgeons' public websites.
 *
 * The sites themselves are a separate app on separate infrastructure; this is
 * where staff write their content. Two things about that boundary are load-
 * bearing:
 *
 *  - The public app never touches this database. It reads `publishedContent`
 *    over a scoped token. A marketing site is the most-scanned surface an org
 *    puts online, and it must not be able to reach PHI.
 *  - Editing changes nothing live. `content` is the draft; `publishedContent` is
 *    what the world sees. That is also what makes preview simply "render the
 *    draft instead" rather than a separate pipeline.
 */

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import {
  emptyContent,
  missingCredentials,
  parseContent,
  slugifyName,
  type SurgeonSiteContent,
} from "@/lib/surgeon-site"

async function requireAdmin() {
  const session = await auth()
  const user = session?.user as any
  if (!user) throw new Error("Unauthorized")
  if (user.role !== "ADMIN") throw new Error("You don't have permission to do this")
  return session!
}

export async function listSurgeonSites() {
  await requireAdmin()
  const rows = await (prisma as any).surgeonSite.findMany({
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      credential: true,
      domain: true,
      status: true,
      publishedAt: true,
      updatedAt: true,
    },
  })
  return rows
}

export async function getSurgeonSite(id: string) {
  await requireAdmin()
  const row = await (prisma as any).surgeonSite.findUnique({ where: { id } })
  if (!row) return null
  const content = parseContent(row.content)
  return {
    ...row,
    content,
    // Computed here rather than in the client so the same rule decides what the
    // UI warns about and what `publishSurgeonSite` refuses.
    missing: missingCredentials(content, row.domain),
  }
}

export async function createSurgeonSite(input: { name: string; credential?: string }) {
  const session = await requireAdmin()
  const name = input.name.trim()
  if (!name) throw new Error("A name is required")

  const slug = slugifyName(name)
  if (!slug) throw new Error("That name doesn't produce a usable URL key")

  const clash = await (prisma as any).surgeonSite.findUnique({ where: { slug } })
  if (clash) throw new Error(`A site already exists for "${name}"`)

  const credential = (input.credential ?? "MD").trim()
  const content: SurgeonSiteContent = {
    ...emptyContent(),
    // Only what the name itself tells us. Everything else — the training, the
    // affiliations, the biography — is left blank on purpose: a new surgeon's
    // site must not start out describing a different surgeon.
    name: credential ? `${name}, ${credential}` : name,
    shortName: `Dr. ${name.split(/\s+/).slice(-1)[0]}`,
    credential,
  }

  const row = await (prisma as any).surgeonSite.create({
    data: {
      slug,
      name,
      credential: credential || null,
      status: "DRAFT",
      content,
      createdById: (session.user as any).id ?? null,
    },
  })
  revalidatePath("/settings/surgeon-sites")
  return row.id as string
}

export async function updateSurgeonSite(
  id: string,
  patch: {
    domain?: string | null
    seoTitle?: string | null
    seoDescription?: string | null
    redirectUrl?: string | null
    headshotId?: string | null
    ogImageId?: string | null
    content?: SurgeonSiteContent
  },
) {
  const session = await requireAdmin()
  const data: Record<string, unknown> = { updatedById: (session.user as any).id ?? null }

  if (patch.domain !== undefined) {
    const domain = patch.domain?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "")
    data.domain = domain || null
  }
  for (const k of ["seoTitle", "seoDescription", "redirectUrl", "headshotId", "ogImageId"] as const) {
    if (patch[k] !== undefined) data[k] = patch[k] || null
  }
  if (patch.content) {
    data.content = patch.content
    // Keep the columns in step with the draft so the list can show a name
    // without parsing every site's JSON.
    if (patch.content.name) data.name = patch.content.name.replace(/,\s*[A-Za-z.-]+$/, "")
    if (patch.content.credential) data.credential = patch.content.credential
  }

  await (prisma as any).surgeonSite.update({ where: { id }, data })
  revalidatePath("/settings/surgeon-sites")
  revalidatePath(`/settings/surgeon-sites/${id}`)
}

/**
 * Make the draft live.
 *
 * Refuses while anything on `missingCredentials()` is unfilled. That list is
 * mostly the fields describing this surgeon's training, and the refusal is the
 * whole safety mechanism: a site that cannot be completed cannot go live, which
 * is the correct outcome, whereas a site published with gaps would be filled by
 * whatever the template carried.
 */
export async function publishSurgeonSite(id: string) {
  const session = await requireAdmin()
  const row = await (prisma as any).surgeonSite.findUnique({ where: { id } })
  if (!row) throw new Error("Site not found")

  const content = parseContent(row.content)
  const missing = missingCredentials(content, row.domain)
  if (missing.length > 0) {
    throw new Error(
      `This site isn't ready to publish yet. Still needed: ${missing.join("; ")}.`,
    )
  }

  await (prisma as any).surgeonSite.update({
    where: { id },
    data: {
      publishedContent: content,
      publishedAt: new Date(),
      status: "PUBLISHED",
      updatedById: (session.user as any).id ?? null,
    },
  })
  revalidatePath("/settings/surgeon-sites")
  revalidatePath(`/settings/surgeon-sites/${id}`)
}

/**
 * Change what a site does without deleting its content.
 *
 * When a surgeon leaves, the choice is usually not "delete": the pages have
 * search history and inbound links. REDIRECTED sends visitors somewhere useful;
 * RETIRED answers 410, which tells Google to drop the pages rather than keep
 * retrying a 404. DRAFT takes it offline while keeping the draft intact.
 */
export async function setSurgeonSiteStatus(
  id: string,
  status: "DRAFT" | "PUBLISHED" | "REDIRECTED" | "RETIRED",
) {
  const session = await requireAdmin()
  if (status === "PUBLISHED") return publishSurgeonSite(id)

  if (status === "REDIRECTED") {
    const row = await (prisma as any).surgeonSite.findUnique({ where: { id } })
    if (!row?.redirectUrl) {
      throw new Error("Set the redirect destination before switching to Redirected")
    }
  }

  await (prisma as any).surgeonSite.update({
    where: { id },
    data: { status, updatedById: (session.user as any).id ?? null },
  })
  revalidatePath("/settings/surgeon-sites")
  revalidatePath(`/settings/surgeon-sites/${id}`)
}

export async function deleteSurgeonSite(id: string) {
  await requireAdmin()
  await (prisma as any).surgeonSite.delete({ where: { id } })
  revalidatePath("/settings/surgeon-sites")
}
