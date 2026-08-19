"use server"

import { revalidatePath } from "next/cache"
import { runTrigger_RecordCreated, runTrigger_RecordPropertyChanged } from "@/lib/automation-engine"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { requireAccess, requireDelete, requirePermission, requireAnyAccess, requireAnyDelete } from "@/lib/auth-guard"
import { recordMergeRedirect } from "@/lib/merge-redirect"
import { toProperCase } from "@/lib/name-format"

// A location is reachable both as a first-class Locations object and from within
// its Practice, so writes are allowed with edit/delete on either.
const LOCATION_OBJECTS = ["LOCATIONS", "PRACTICES"]

// Words that should stay lowercase in title case (unless first word)
// ─── Practices ────────────────────────────────────────────────────────────────

const PracticeSchema = z.object({
  name: z.string().min(1, "Practice name is required"),
  phone: z.string().optional(),
  fax: z.string().optional(),
  address: z.string().optional(),
  customProperties: z.record(z.any()).optional(),
  ownerId: z.string().optional(),
})

export async function createPractice(data: unknown) {
  const session = await requireAccess("PRACTICES", "EDIT")

  const parsed = PracticeSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  const existing = await prisma.referringPractice.findFirst({
    where: { name: { equals: parsed.data.name, mode: "insensitive" } },
  })
  if (existing) return { error: `A practice named "${existing.name}" already exists.`, id: existing.id, duplicate: true }

  const practice = await prisma.referringPractice.create({
    data: {
      name: toProperCase(parsed.data.name),
      phone: parsed.data.phone || null,
      fax: parsed.data.fax || null,
      address: parsed.data.address || null,
      customProperties: parsed.data.customProperties ?? {},
      ownerId: parsed.data.ownerId || (session?.user as any)?.id || null,
      createdById: (session?.user as any)?.id ?? null,
    },
  })

  await runTrigger_RecordCreated("PRACTICE", practice.id, (session?.user as any)?.id).catch(() => {})
  revalidatePath("/referring-doctors")
  return { success: true, id: practice.id }
}

export async function updatePractice(id: string, data: unknown) {
  const session = await requireAccess("PRACTICES", "EDIT")

  const parsed = PracticeSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  await prisma.referringPractice.update({
    where: { id },
    data: {
      name: toProperCase(parsed.data.name),
      phone: parsed.data.phone || null,
      fax: parsed.data.fax || null,
      address: parsed.data.address || null,
      updatedById: (session?.user as any)?.id ?? null,
    },
  })

  await runTrigger_RecordPropertyChanged("PRACTICE", id, parsed.data as Record<string, unknown>, (session?.user as any)?.id).catch(() => {})
  revalidatePath("/referring-doctors")
  return { success: true }
}

export async function deletePractice(id: string) {
  const session = await requireDelete("PRACTICES")

  const [referralCount, locationCount, doctorCount] = await Promise.all([
    prisma.referral.count({ where: { referringPracticeId: id } }),
    prisma.practiceLocation.count({ where: { practiceId: id } }),
    prisma.referringDoctor.count({ where: { practiceId: id } }),
  ])

  const reasons: string[] = []
  if (referralCount > 0) reasons.push(`${referralCount} referral${referralCount !== 1 ? "s" : ""}`)
  if (locationCount > 0) reasons.push(`${locationCount} location${locationCount !== 1 ? "s" : ""}`)
  if (doctorCount > 0) reasons.push(`${doctorCount} provider${doctorCount !== 1 ? "s" : ""}`)

  if (reasons.length > 0) {
    return { error: `Cannot delete — this practice has ${reasons.join(", ")} linked to it. Remove or reassign them first, or use Merge instead.` }
  }

  try {
    await prisma.referringPractice.delete({ where: { id } })
    revalidatePath("/referring-doctors")
    return { success: true }
  } catch (e: any) {
    return { error: e?.message ?? "Failed to delete practice." }
  }
}

// ─── Locations ────────────────────────────────────────────────────────────────

const LocationSchema = z.object({
  name: z.string().min(1, "Location name is required"),
  phone: z.string().optional(),
  fax: z.string().optional(),
  address: z.string().optional(),
  practiceId: z.string().min(1, "Practice is required"),
  customProperties: z.record(z.any()).optional(),
  ownerId: z.string().optional(),
})

export async function createLocation(data: unknown) {
  const session = await requireAnyAccess(LOCATION_OBJECTS, "EDIT")

  const parsed = LocationSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  const existing = await prisma.practiceLocation.findFirst({
    where: {
      practiceId: parsed.data.practiceId,
      name: { equals: parsed.data.name, mode: "insensitive" },
    },
  })
  if (existing) return { error: `A location named "${existing.name}" already exists in this practice.`, id: existing.id, duplicate: true }

  // Check for address duplicate (normalize: lowercase, strip extra spaces, strip trailing zip+4, strip commas)
  if (parsed.data.address) {
    const normalize = (s: string) =>
      s.toLowerCase().replace(/,/g, "").replace(/\b(\d{5})-\d{4}\b/, "$1").replace(/\s+/g, " ").trim()
    const newAddr = normalize(parsed.data.address)
    const siblings = await prisma.practiceLocation.findMany({
      where: { practiceId: parsed.data.practiceId, address: { not: null } },
      select: { id: true, name: true, address: true },
    })
    const addrMatch = siblings.find((s) => normalize(s.address!) === newAddr)
    if (addrMatch) return { error: `A location at this address already exists: "${addrMatch.name}". Consider merging instead.`, id: addrMatch.id, duplicate: true }
  }

  const location = await prisma.practiceLocation.create({
    data: {
      name: toProperCase(parsed.data.name),
      phone: parsed.data.phone || null,
      fax: parsed.data.fax || null,
      address: parsed.data.address || null,
      practiceId: parsed.data.practiceId,
      customProperties: parsed.data.customProperties ?? {},
      ownerId: parsed.data.ownerId || (session?.user as any)?.id || null,
      createdById: (session?.user as any)?.id ?? null,
    },
  })

  await runTrigger_RecordCreated("LOCATION", location.id, (session?.user as any)?.id).catch(() => {})
  revalidatePath("/referring-doctors")
  revalidatePath("/locations")
  return { success: true, id: location.id }
}

export async function updateLocation(id: string, data: unknown) {
  const session = await requireAnyAccess(LOCATION_OBJECTS, "EDIT")

  const parsed = LocationSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  await prisma.practiceLocation.update({
    where: { id },
    data: {
      name: toProperCase(parsed.data.name),
      phone: parsed.data.phone || null,
      fax: parsed.data.fax || null,
      address: parsed.data.address || null,
      practiceId: parsed.data.practiceId,
      updatedById: (session?.user as any)?.id ?? null,
    },
  })

  await runTrigger_RecordPropertyChanged("LOCATION", id, parsed.data as Record<string, unknown>, (session?.user as any)?.id).catch(() => {})
  revalidatePath("/referring-doctors")
  revalidatePath("/locations")
  return { success: true }
}

export async function deleteLocation(id: string) {
  const session = await requireAnyDelete(LOCATION_OBJECTS)

  const [referralCount, doctorCount] = await Promise.all([
    prisma.referral.count({ where: { referringLocationId: id } }),
    prisma.doctorLocation.count({ where: { locationId: id } }),
  ])

  const reasons: string[] = []
  if (referralCount > 0) reasons.push(`${referralCount} referral${referralCount !== 1 ? "s" : ""}`)
  if (doctorCount > 0) reasons.push(`${doctorCount} provider${doctorCount !== 1 ? "s" : ""} linked to it`)

  if (reasons.length > 0) {
    return { error: `Cannot delete — this location has ${reasons.join(" and ")}. Remove them first, or use Merge instead.` }
  }

  try {
    await prisma.practiceLocation.delete({ where: { id } })
    revalidatePath("/referring-doctors")
    revalidatePath("/locations")
    return { success: true }
  } catch (e: any) {
    return { error: e?.message ?? "Failed to delete location." }
  }
}

// Bulk delete for the Locations list. Skips any location still linked to
// referrals or providers and reports how many were blocked.
export async function bulkDeleteLocations(ids: string[]) {
  await requireAnyDelete(LOCATION_OBJECTS)
  if (!ids.length) return { success: true, deleted: 0, blocked: 0 }

  let deleted = 0
  let blocked = 0
  for (const id of ids) {
    const [referralCount, doctorCount] = await Promise.all([
      prisma.referral.count({ where: { referringLocationId: id } }),
      prisma.doctorLocation.count({ where: { locationId: id } }),
    ])
    if (referralCount > 0 || doctorCount > 0) { blocked += 1; continue }
    try {
      await prisma.practiceLocation.delete({ where: { id } })
      deleted += 1
    } catch { blocked += 1 }
  }

  revalidatePath("/referring-doctors")
  revalidatePath("/locations")
  return { success: true, deleted, blocked }
}

// First-class Locations object list. One row per location with its practice,
// provider/referral/activity counts — the data source for the /locations page.
export async function getLocations() {
  await requireAccess("LOCATIONS", "VIEW")

  const locations = await prisma.practiceLocation.findMany({
    orderBy: [{ referrals: { _count: "desc" } }, { name: "asc" }],
    include: {
      practice: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true, email: true } },
      _count: { select: { referrals: true, doctors: true, activities: true } },
    },
  })

  return locations.map((l) => ({
    id: l.id,
    name: l.name,
    phone: l.phone,
    fax: l.fax,
    address: l.address,
    practiceId: l.practiceId,
    practiceName: l.practice.name,
    ownerId: l.owner?.id ?? null,
    ownerName: l.owner?.name ?? l.owner?.email ?? null,
    createdAt: l.createdAt,
    customProperties: (l.customProperties as Record<string, any>) ?? {},
    referralCount: l._count.referrals,
    providerCount: l._count.doctors,
    activityCount: l._count.activities,
  }))
}

export async function mergeLocation(sourceId: string, targetId: string) {
  const session = await requirePermission("MERGE_RECORDS")

  if (sourceId === targetId) return { error: "Cannot merge a location into itself." }

  try {
    // Re-point all referrals from source → target
    await prisma.referral.updateMany({
      where: { referringLocationId: sourceId },
      data: { referringLocationId: targetId },
    })

    // Re-point doctor-location links, skipping any that would create a duplicate
    const sourceDoctorLinks = await prisma.doctorLocation.findMany({ where: { locationId: sourceId } })
    for (const link of sourceDoctorLinks) {
      const alreadyLinked = await prisma.doctorLocation.findFirst({
        where: { doctorId: link.doctorId, locationId: targetId },
      })
      if (!alreadyLinked) {
        await prisma.doctorLocation.update({
          where: { doctorId_locationId: { doctorId: link.doctorId, locationId: sourceId } },
          data: { locationId: targetId },
        })
      } else {
        await prisma.doctorLocation.delete({
          where: { doctorId_locationId: { doctorId: link.doctorId, locationId: sourceId } },
        })
      }
    }

    // Delete the source location
    await prisma.practiceLocation.delete({ where: { id: sourceId } })
    await recordMergeRedirect("LOCATION", sourceId, targetId)

    revalidatePath("/referring-doctors")
    revalidatePath("/locations")
    return { success: true }
  } catch (e: any) {
    console.error("mergeLocation error:", e)
    return { error: e?.message ?? "Failed to merge locations. Please try again." }
  }
}

export async function mergePractice(sourceId: string, targetId: string) {
  const session = await requirePermission("MERGE_RECORDS")

  if (sourceId === targetId) return { error: "Cannot merge a practice into itself." }

  try {
    await prisma.referral.updateMany({ where: { referringPracticeId: sourceId }, data: { referringPracticeId: targetId } })
    await prisma.practiceLocation.updateMany({ where: { practiceId: sourceId }, data: { practiceId: targetId } })

    const sourceDoctors = await prisma.referringDoctor.findMany({ where: { practiceId: sourceId }, select: { id: true, name: true } })
    for (const doc of sourceDoctors) {
      const existing = await prisma.referringDoctor.findFirst({ where: { practiceId: targetId, name: { equals: doc.name, mode: "insensitive" } } })
      if (!existing) {
        // No name collision — just move the doctor to the target practice
        await prisma.referringDoctor.update({ where: { id: doc.id }, data: { practiceId: targetId } })
      } else {
        // Same-name doctor already exists in target — fully merge source into target
        await prisma.referral.updateMany({ where: { referringDoctorId: doc.id }, data: { referringDoctorId: existing.id } })
        await prisma.providerNote.updateMany({ where: { providerId: doc.id }, data: { providerId: existing.id } })

        const sourceLinks = await prisma.doctorLocation.findMany({ where: { doctorId: doc.id } })
        for (const link of sourceLinks) {
          const already = await prisma.doctorLocation.findFirst({ where: { doctorId: existing.id, locationId: link.locationId } })
          if (!already) {
            await prisma.doctorLocation.update({
              where: { doctorId_locationId: { doctorId: doc.id, locationId: link.locationId } },
              data: { doctorId: existing.id },
            })
          } else {
            await prisma.doctorLocation.delete({ where: { doctorId_locationId: { doctorId: doc.id, locationId: link.locationId } } })
          }
        }

        await prisma.referringDoctor.delete({ where: { id: doc.id } })
        await recordMergeRedirect("PROVIDER", doc.id, existing.id)
      }
    }

    await prisma.referringPractice.delete({ where: { id: sourceId } })
    await recordMergeRedirect("PRACTICE", sourceId, targetId)

    revalidatePath("/referring-doctors")
    revalidatePath("/referrals")
    revalidatePath("/")
    return { success: true }
  } catch (e: any) {
    console.error("mergePractice error:", e)
    return { error: e?.message ?? "Failed to merge practices. Please try again." }
  }
}

// ─── Doctors ──────────────────────────────────────────────────────────────────

const DoctorSchema = z.object({
  name: z.string().min(1, "Provider name is required"),
  title: z.string().optional(),
  npi: z.string().optional(),
  specialty: z.string().optional(),
  phone: z.string().optional(),
  officePhone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  contactType: z.enum(["PROVIDER", "STAFF"]).optional().default("PROVIDER"),
  practiceId: z.string().min(1, "Practice is required"),
  locationIds: z.array(z.string()).optional(),
  customProperties: z.record(z.any()).optional(),
  ownerId: z.string().optional(),
})

export async function createDoctor(data: unknown) {
  const session = await requireAccess("PROVIDERS", "EDIT")

  const parsed = DoctorSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  const { locationIds = [], customProperties, ownerId, ...rest } = parsed.data

  // Normalize before dedup — handles "Last, First" vs "First Last" variations
  const normalizedName = toProperCase(rest.name)
  const existing = await prisma.referringDoctor.findFirst({
    where: {
      practiceId: rest.practiceId,
      name: { equals: normalizedName, mode: "insensitive" },
    },
  })
  if (existing) return { error: `A provider named "${existing.name}" already exists in this practice.`, id: existing.id, duplicate: true }

  const doctor = await prisma.referringDoctor.create({
    data: {
      name: toProperCase(rest.name),
      title: rest.title || null,
      npi: rest.npi || null,
      specialty: rest.specialty || null,
      phone: rest.phone || null,
      officePhone: rest.officePhone || null,
      email: rest.email || null,
      contactType: rest.contactType,
      practiceId: rest.practiceId,
      customProperties: customProperties ?? {},
      ownerId: ownerId || (session?.user as any)?.id || null,
      createdById: (session?.user as any)?.id ?? null,
      locations: {
        create: locationIds.map((locationId) => ({ locationId })),
      },
    },
  })

  await runTrigger_RecordCreated("PROVIDER", doctor.id, (session?.user as any)?.id).catch(() => {})
  revalidatePath("/referring-doctors")
  return { success: true, id: doctor.id }
}

export async function updateDoctor(id: string, data: unknown) {
  const session = await requireAccess("PROVIDERS", "EDIT")

  const parsed = DoctorSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  const { locationIds = [], ...rest } = parsed.data

  await prisma.referringDoctor.update({
    where: { id },
    data: {
      name: toProperCase(rest.name),
      title: rest.title || null,
      npi: rest.npi || null,
      specialty: rest.specialty || null,
      phone: rest.phone || null,
      officePhone: rest.officePhone || null,
      email: rest.email || null,
      contactType: rest.contactType,
      practiceId: rest.practiceId,
      updatedById: (session?.user as any)?.id ?? null,
      locations: {
        deleteMany: {},
        create: locationIds.map((locationId) => ({ locationId })),
      },
    },
  })

  await runTrigger_RecordPropertyChanged("PROVIDER", id, rest as Record<string, unknown>, (session?.user as any)?.id).catch(() => {})
  revalidatePath("/referring-doctors")
  return { success: true }
}

const EDITABLE_DOCTOR_FIELDS = ["name", "title", "npi", "phone", "officePhone", "email"] as const

// Updates a single doctor field without touching practice or location links
export async function updateDoctorField(id: string, field: string, value: string | null) {
  const session = await requireAccess("PROVIDERS", "EDIT")

  if (!(EDITABLE_DOCTOR_FIELDS as readonly string[]).includes(field)) {
    return { error: "Invalid field" }
  }

  const trimmed = value?.trim() || null

  if (field === "name" && !trimmed) return { error: "Provider name is required" }
  if (field === "email" && trimmed && !z.string().email().safeParse(trimmed).success) {
    return { error: "Invalid email address" }
  }

  await prisma.referringDoctor.update({
    where: { id },
    data: { [field]: field === "name" ? toProperCase(trimmed!) : trimmed },
  })

  revalidatePath("/referring-doctors")
  revalidatePath("/activities")
  return { success: true }
}

export async function mergeDoctor(sourceId: string, targetId: string) {
  const session = await requirePermission("MERGE_RECORDS")

  if (sourceId === targetId) return { error: "Cannot merge a provider into itself." }

  try {
    await prisma.referral.updateMany({ where: { referringDoctorId: sourceId }, data: { referringDoctorId: targetId } })
    await prisma.providerNote.updateMany({ where: { providerId: sourceId }, data: { providerId: targetId } })

    const sourceLinks = await prisma.doctorLocation.findMany({ where: { doctorId: sourceId } })
    for (const link of sourceLinks) {
      const already = await prisma.doctorLocation.findFirst({ where: { doctorId: targetId, locationId: link.locationId } })
      if (!already) {
        await prisma.doctorLocation.update({
          where: { doctorId_locationId: { doctorId: sourceId, locationId: link.locationId } },
          data: { doctorId: targetId },
        })
      } else {
        await prisma.doctorLocation.delete({ where: { doctorId_locationId: { doctorId: sourceId, locationId: link.locationId } } })
      }
    }

    await prisma.referringDoctor.delete({ where: { id: sourceId } })
    await recordMergeRedirect("PROVIDER", sourceId, targetId)

    revalidatePath("/referring-doctors")
    revalidatePath("/referrals")
    return { success: true }
  } catch (e: any) {
    console.error("mergeDoctor error:", e)
    return { error: e?.message ?? "Failed to merge providers. Please try again." }
  }
}

// Merge a whole batch of exact-duplicate pairs in one pass (the "Merge all exact
// duplicates" button). Pairs can chain/overlap (A↔B, B↔C), so we track which ids
// have been removed and redirect any later reference to the surviving record.
export async function mergeExactDuplicates(
  pairs: { kind: "practice" | "location" | "doctor"; keepId: string; sourceId: string }[]
) {
  await requirePermission("MERGE_RECORDS")

  // removed id → survivor id (followed transitively)
  const redirect = new Map<string, string>()
  const resolve = (id: string) => { let cur = id; while (redirect.has(cur)) cur = redirect.get(cur)!; return cur }

  let mergedCount = 0
  const errors: string[] = []

  for (const p of pairs) {
    const keep = resolve(p.keepId)
    const source = resolve(p.sourceId)
    if (keep === source) continue // already merged together by an earlier pair

    let result: { error?: string | null; success?: boolean } | undefined
    if (p.kind === "practice") result = await mergePractice(source, keep)
    else if (p.kind === "location") result = await mergeLocation(source, keep)
    else result = await mergeDoctor(source, keep)

    if (result?.error) { errors.push(result.error); continue }
    redirect.set(source, keep)
    mergedCount++
  }

  revalidatePath("/settings/duplicates")
  return { success: true, mergedCount, errors }
}

export async function createProviderNote(providerId: string, content: string) {
  const session = await requireAccess("PROVIDERS", "EDIT")
  if (!content.trim()) return { error: "Note cannot be empty" }

  // Look up the provider's practice so the activity is linked to it too
  const provider = await prisma.referringDoctor.findUnique({
    where: { id: providerId },
    select: { practiceId: true },
  })

  await prisma.$transaction([
    prisma.providerNote.create({
      data: {
        content: content.trim(),
        providerId,
        createdById: session.user.id,
      },
    }),
    prisma.activity.create({
      data: {
        notes: content.trim(),
        practiceId: provider?.practiceId ?? null,
        date: new Date(),
        createdById: session.user.id,
        providers: { create: [{ doctorId: providerId }] },
      },
    }),
  ])

  revalidatePath(`/referring-doctors/${providerId}`)
  revalidatePath("/activities")
  return { success: true }
}

export async function updateProviderNote(noteId: string, content: string, providerId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  if (!content.trim()) return { error: "Note cannot be empty" }

  await prisma.providerNote.update({
    where: { id: noteId },
    data: { content: content.trim() },
  })

  revalidatePath(`/referring-doctors/${providerId}`)
  return { success: true }
}

export async function deleteProviderNote(noteId: string, providerId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  await prisma.providerNote.delete({ where: { id: noteId } })

  revalidatePath(`/referring-doctors/${providerId}`)
  return { success: true }
}

export async function linkDoctorToLocation(doctorId: string, locationId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const already = await prisma.doctorLocation.findFirst({ where: { doctorId, locationId } })
  if (already) return { success: true }

  await prisma.doctorLocation.create({ data: { doctorId, locationId } })
  revalidatePath("/referring-doctors")
  return { success: true }
}

export async function deleteDoctor(id: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const count = await prisma.referral.count({ where: { referringDoctorId: id } })
  if (count > 0) {
    return { error: `Cannot delete — this provider has ${count} referral(s) linked to them.` }
  }

  try {
    await prisma.referringDoctor.delete({ where: { id } })
  } catch (e: any) {
    return { error: e?.message ?? "Failed to delete provider." }
  }
  revalidatePath("/referring-doctors")
  return { success: true }
}
