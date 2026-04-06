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

  const count = await prisma.referral.count({ where: { referringPracticeId: id } })
  if (count > 0) {
    return { error: `Cannot delete — this practice has ${count} referral(s) linked to it.` }
  }

  await prisma.referringPractice.delete({ where: { id } })
  revalidatePath("/referring-doctors")
  return { success: true }
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

  const count = await prisma.referral.count({ where: { referringLocationId: id } })
  if (count > 0) {
    return { error: `Cannot delete — this location has ${count} referral(s) linked to it.` }
  }

  await prisma.practiceLocation.delete({ where: { id } })
  revalidatePath("/referring-doctors")
  return { success: true }
}

export async function mergeLocation(sourceId: string, targetId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  if (sourceId === targetId) return { error: "Cannot merge a location into itself." }

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

export async function createProviderNote(providerId: string, content: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  if (!content.trim()) return { error: "Note cannot be empty" }

  await prisma.providerNote.create({
    data: {
      content: content.trim(),
      providerId,
      createdById: session.user.id,
    },
  })

  revalidatePath(`/referring-doctors/${providerId}`)
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

  await prisma.referringDoctor.delete({ where: { id } })
  revalidatePath("/referring-doctors")
  return { success: true }
}
