import { prisma } from "@/lib/prisma"
import { toProperCase } from "@/lib/name-format"

// Find or create a provider by name within a practice (case-insensitive), mirroring
// the manual "Add provider" dedup. Used by the public referral form, which has no
// session — auth is the caller's responsibility. Returns the provider id, or null
// when there's no usable name. Fills NPI/email only when creating a new record.
export async function resolveOrCreateProvider(params: {
  practiceId: string
  name: string
  npi?: string | null
  email?: string | null
  locationId?: string | null
}): Promise<string | null> {
  const name = toProperCase((params.name ?? "").trim())
  if (!name) return null

  let doctor = await prisma.referringDoctor.findFirst({
    where: { practiceId: params.practiceId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  })

  if (!doctor) {
    doctor = await prisma.referringDoctor.create({
      data: {
        name,
        npi: params.npi?.trim() || null,
        email: params.email?.trim() || null,
        practiceId: params.practiceId,
        ...(params.locationId ? { locations: { create: [{ locationId: params.locationId }] } } : {}),
      },
      select: { id: true },
    })
  } else if (params.locationId) {
    // Ensure the existing provider is linked to this location too.
    const link = await prisma.doctorLocation.findFirst({ where: { doctorId: doctor.id, locationId: params.locationId } })
    if (!link) await prisma.doctorLocation.create({ data: { doctorId: doctor.id, locationId: params.locationId } })
  }

  return doctor.id
}
