// Registry of "associable" object types — custom objects ("CO:<key>") and the
// main built-ins — so the data model can relate any of them. Each resolver knows
// how to label a type, list its records (for a picker), resolve records by id,
// and build a record URL. Server-only (Prisma).

import { prisma } from "@/lib/prisma"

export interface RegistryRecord { id: string; name: string; url: string }
export interface ObjectType { key: string; label: string }

interface Resolver {
  label: string
  url: (id: string) => string
  list: (q: string) => Promise<RegistryRecord[]>
  byIds: (ids: string[]) => Promise<RegistryRecord[]>
}

const BUILTINS: Record<string, Omit<Resolver, "byIds" | "list"> & {
  list: (q: string) => Promise<RegistryRecord[]>
  byIds: (ids: string[]) => Promise<RegistryRecord[]>
}> = {
  REFERRAL: {
    label: "Referrals",
    url: (id) => `/referrals/${id}`,
    list: async (q) => {
      const rows = await prisma.referral.findMany({
        where: q ? { OR: [{ patientFirstName: { contains: q, mode: "insensitive" } }, { patientLastName: { contains: q, mode: "insensitive" } }] } : {},
        select: { id: true, patientFirstName: true, patientLastName: true }, take: 25, orderBy: { referralDate: "desc" },
      })
      return rows.map((r) => ({ id: r.id, name: `${r.patientFirstName ?? ""} ${r.patientLastName ?? ""}`.trim() || "Referral", url: `/referrals/${r.id}` }))
    },
    byIds: async (ids) => {
      const rows = await prisma.referral.findMany({ where: { id: { in: ids } }, select: { id: true, patientFirstName: true, patientLastName: true } })
      return rows.map((r) => ({ id: r.id, name: `${r.patientFirstName ?? ""} ${r.patientLastName ?? ""}`.trim() || "Referral", url: `/referrals/${r.id}` }))
    },
  },
  PROVIDER: {
    label: "Providers",
    url: (id) => `/referring-doctors/${id}`,
    list: async (q) => {
      const rows = await prisma.referringDoctor.findMany({ where: q ? { name: { contains: q, mode: "insensitive" } } : {}, select: { id: true, name: true }, take: 25, orderBy: { name: "asc" } })
      return rows.map((r) => ({ id: r.id, name: r.name, url: `/referring-doctors/${r.id}` }))
    },
    byIds: async (ids) => {
      const rows = await prisma.referringDoctor.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      return rows.map((r) => ({ id: r.id, name: r.name, url: `/referring-doctors/${r.id}` }))
    },
  },
  PRACTICE: {
    label: "Practices",
    url: (id) => `/practices/${id}`,
    list: async (q) => {
      const rows = await prisma.referringPractice.findMany({ where: q ? { name: { contains: q, mode: "insensitive" } } : {}, select: { id: true, name: true }, take: 25, orderBy: { name: "asc" } })
      return rows.map((r) => ({ id: r.id, name: r.name, url: `/practices/${r.id}` }))
    },
    byIds: async (ids) => {
      const rows = await prisma.referringPractice.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      return rows.map((r) => ({ id: r.id, name: r.name, url: `/practices/${r.id}` }))
    },
  },
  LOCATION: {
    label: "Locations",
    url: (id) => `/locations/${id}`,
    list: async (q) => {
      const rows = await prisma.practiceLocation.findMany({ where: q ? { name: { contains: q, mode: "insensitive" } } : {}, select: { id: true, name: true }, take: 25, orderBy: { name: "asc" } })
      return rows.map((r) => ({ id: r.id, name: r.name, url: `/locations/${r.id}` }))
    },
    byIds: async (ids) => {
      const rows = await prisma.practiceLocation.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      return rows.map((r) => ({ id: r.id, name: r.name, url: `/locations/${r.id}` }))
    },
  },
  SURGERY: {
    label: "Surgery Cases",
    url: (id) => `/surgery/${id}`,
    list: async (q) => {
      const rows = await (prisma as any).surgeryCase.findMany({ where: q ? { patientName: { contains: q, mode: "insensitive" } } : {}, select: { id: true, patientName: true }, take: 25, orderBy: { createdAt: "desc" } })
      return rows.map((r: any) => ({ id: r.id, name: r.patientName, url: `/surgery/${r.id}` }))
    },
    byIds: async (ids) => {
      const rows = await (prisma as any).surgeryCase.findMany({ where: { id: { in: ids } }, select: { id: true, patientName: true } })
      return rows.map((r: any) => ({ id: r.id, name: r.patientName, url: `/surgery/${r.id}` }))
    },
  },
}

function customName(def: any, r: any): string {
  const primary = (def.properties as any[]).find((p) => p.primary) ?? (def.properties as any[])[0]
  const v = primary ? (r.values as any)?.[primary.id] : null
  return (v && String(v)) || `${def.singular} #${r.recordNumber ?? ""}`.trim()
}

async function customResolver(typeKey: string): Promise<Resolver | null> {
  const key = typeKey.slice(3) // strip "CO:"
  const def = await (prisma as any).customObjectDef.findUnique({ where: { key } })
  if (!def) return null
  return {
    label: def.plural,
    url: (id) => `/objects/${key}/${id}`,
    list: async (q) => {
      const rows = await (prisma as any).customObjectRecord.findMany({ where: { objectDefId: def.id }, orderBy: { createdAt: "desc" }, take: 100 })
      const mapped = rows.map((r: any) => ({ id: r.id, name: customName(def, r), url: `/objects/${key}/${r.id}` }))
      return q ? mapped.filter((m: RegistryRecord) => m.name.toLowerCase().includes(q.toLowerCase())).slice(0, 25) : mapped.slice(0, 25)
    },
    byIds: async (ids) => {
      const rows = await (prisma as any).customObjectRecord.findMany({ where: { id: { in: ids } } })
      return rows.map((r: any) => ({ id: r.id, name: customName(def, r), url: `/objects/${key}/${r.id}` }))
    },
  }
}

export async function resolverFor(typeKey: string): Promise<Resolver | null> {
  if (typeKey.startsWith("CO:")) return customResolver(typeKey)
  return BUILTINS[typeKey] ?? null
}

export async function labelFor(typeKey: string): Promise<string> {
  if (typeKey.startsWith("CO:")) {
    const def = await (prisma as any).customObjectDef.findUnique({ where: { key: typeKey.slice(3) }, select: { plural: true } })
    return def?.plural ?? typeKey
  }
  return BUILTINS[typeKey]?.label ?? typeKey
}

// All associable object types (built-ins + custom), for the data-model picker.
export async function listObjectTypes(): Promise<ObjectType[]> {
  const customs = await (prisma as any).customObjectDef.findMany({ orderBy: { plural: "asc" }, select: { key: true, plural: true } })
  return [
    ...Object.entries(BUILTINS).map(([key, v]) => ({ key, label: v.label })),
    ...customs.map((c: any) => ({ key: `CO:${c.key}`, label: c.plural })),
  ]
}
