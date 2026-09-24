import { prisma } from "@/lib/prisma"

// The objects exposed on the public API. Built-ins are fixed; custom objects are
// discovered from their definitions, so a NEW object automatically gets API
// endpoints (/api/v1/<slug>) and scopes (<slug>:read / <slug>:write).

const BUILTIN: { slug: string; entity: string; label: string }[] = [
  { slug: "referrals", entity: "REFERRAL", label: "Referrals" },
  { slug: "providers", entity: "PROVIDER", label: "Providers" },
  { slug: "practices", entity: "PRACTICE", label: "Practices" },
  { slug: "locations", entity: "LOCATION", label: "Locations" },
  { slug: "surgery", entity: "SURGERY", label: "Surgery Cases" },
]

export interface ApiObject { slug: string; entity: string; label: string; custom: boolean }

export async function getApiObjects(): Promise<ApiObject[]> {
  const customs = await (prisma as any).customObjectDef.findMany({ orderBy: { order: "asc" } }).catch(() => [])
  return [
    ...BUILTIN.map((b) => ({ ...b, custom: false })),
    ...customs.map((c: any) => ({ slug: c.key, entity: `CO:${c.key}`, label: c.plural || c.singular || c.key, custom: true })),
  ]
}

export async function resolveApiObject(slug: string): Promise<ApiObject | null> {
  return (await getApiObjects()).find((o) => o.slug === slug) ?? null
}

export interface ApiScopeDef { key: string; label: string; group: string; description: string }

/**
 * Scopes that aren't tied to a CRM object.
 *
 * The surgeon-sites one is read-only by design: it feeds the public marketing
 * sites, which run outside this network and must never be able to write here.
 * It reaches only published website copy — no patient data of any kind — which
 * is what makes it safe to hand to a public-facing app.
 */
const STANDALONE_SCOPES: ApiScopeDef[] = [
  {
    key: "surgeon_sites:read",
    label: "Read published surgeon websites",
    group: "Surgeon Websites",
    description:
      "Read published website content for the surgeons' public sites. No patient data. Read-only.",
  },
]

// Two scopes per object (read / write) — regenerated from the live object list.
export async function getApiScopes(): Promise<ApiScopeDef[]> {
  const objs = await getApiObjects()
  return [
    ...objs.flatMap((o) => {
      const lower = o.label.toLowerCase()
      return [
        { key: `${o.slug}:read`, label: `Read ${lower}`, group: o.label, description: `List and fetch ${lower}` },
        { key: `${o.slug}:write`, label: `Create & update ${lower}`, group: o.label, description: `Create and update ${lower}` },
      ]
    }),
    ...STANDALONE_SCOPES,
  ]
}

export async function getApiScopeKeys(): Promise<string[]> {
  return (await getApiScopes()).map((s) => s.key)
}
