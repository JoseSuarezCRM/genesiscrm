"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"

// ─── Practices ────────────────────────────────────────────────────────────────

const PracticeSchema = z.object({
  name: z.string().min(1, "Practice name is required"),
  phone: z.string().optional(),
  fax: z.string().optional(),
  address: z.string().optional(),
})

export async function createPractice(data: unknown) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const parsed = PracticeSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  const existing = await prisma.referringPractice.findFirst({
    where: { name: { equals: parsed.data.name, mode: "insensitive" } },
  })
  if (existing) return { error: `A practice named "${existing.name}" already exists.`, id: existing.id, duplicate: true }

  const practice = await prisma.referringPractice.create({
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      fax: parsed.data.fax || null,
      address: parsed.data.address || null,
    },
  })

  revalidatePath("/referring-doctors")
  return { success: true, id: practice.id }
}

export async function updatePractice(id: string, data: unknown) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const parsed = PracticeSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  await prisma.referringPractice.update({
    where: { id },
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      fax: parsed.data.fax || null,
      address: parsed.data.address || null,
    },
  })

  revalidatePath("/referring-doctors")
  return { success: true }
}

export async function deletePractice(id: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

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
})

export async function createLocation(data: unknown) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

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
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      fax: parsed.data.fax || null,
      address: parsed.data.address || null,
      practiceId: parsed.data.practiceId,
    },
  })

  revalidatePath("/referring-doctors")
  return { success: true, id: location.id }
}

export async function updateLocation(id: string, data: unknown) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const parsed = LocationSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  await prisma.practiceLocation.update({
    where: { id },
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      fax: parsed.data.fax || null,
      address: parsed.data.address || null,
      practiceId: parsed.data.practiceId,
    },
  })

  revalidatePath("/referring-doctors")
  return { success: true }
}

export async function deleteLocation(id: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

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
    return { success: true }
  } catch (e: any) {
    return { error: e?.message ?? "Failed to delete location." }
  }
}

export async function mergeLocation(sourceId: string, targetId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

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

    revalidatePath("/referring-doctors")
    return { success: true }
  } catch (e: any) {
    console.error("mergeLocation error:", e)
    return { error: e?.message ?? "Failed to merge locations. Please try again." }
  }
}

export async function mergePractice(sourceId: string, targetId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

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
      }
    }

    await prisma.referringPractice.delete({ where: { id: sourceId } })

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
  email: z.string().email().optional().or(z.literal("")),
  practiceId: z.string().min(1, "Practice is required"),
  locationIds: z.array(z.string()).optional(),
})

export async function createDoctor(data: unknown) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const parsed = DoctorSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  const { locationIds = [], ...rest } = parsed.data

  const existing = await prisma.referringDoctor.findFirst({
    where: {
      practiceId: rest.practiceId,
      name: { equals: rest.name, mode: "insensitive" },
    },
  })
  if (existing) return { error: `A provider named "${existing.name}" already exists in this practice.`, id: existing.id, duplicate: true }

  const doctor = await prisma.referringDoctor.create({
    data: {
      name: rest.name,
      title: rest.title || null,
      npi: rest.npi || null,
      specialty: rest.specialty || null,
      phone: rest.phone || null,
      email: rest.email || null,
      practiceId: rest.practiceId,
      locations: {
        create: locationIds.map((locationId) => ({ locationId })),
      },
    },
  })

  revalidatePath("/referring-doctors")
  return { success: true, id: doctor.id }
}

export async function updateDoctor(id: string, data: unknown) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const parsed = DoctorSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  const { locationIds = [], ...rest } = parsed.data

  await prisma.referringDoctor.update({
    where: { id },
    data: {
      name: rest.name,
      title: rest.title || null,
      npi: rest.npi || null,
      specialty: rest.specialty || null,
      phone: rest.phone || null,
      email: rest.email || null,
      practiceId: rest.practiceId,
      locations: {
        deleteMany: {},
        create: locationIds.map((locationId) => ({ locationId })),
      },
    },
  })

  revalidatePath("/referring-doctors")
  return { success: true }
}

export async function mergeDoctor(sourceId: string, targetId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

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

    revalidatePath("/referring-doctors")
    revalidatePath("/referrals")
    return { success: true }
  } catch (e: any) {
    console.error("mergeDoctor error:", e)
    return { error: e?.message ?? "Failed to merge providers. Please try again." }
  }
}

export async function createProviderNote(providerId: string, content: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
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
