"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { StaffRole, SchedDay, AvailabilityType } from "@prisma/client"

// ── Auth ──────────────────────────────────────────────────────────────────────

async function requireAdmin() {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") throw new Error("Unauthorized")
}

// ── Locations ─────────────────────────────────────────────────────────────────

export async function getLocations() {
  return prisma.scheduleLocation.findMany({ orderBy: { order: "asc" } })
}

// ── Staff ─────────────────────────────────────────────────────────────────────

export async function getStaff() {
  return prisma.staffMember.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: { availability: true },
  })
}

export async function createStaffMember(input: {
  name: string
  primaryRole: StaffRole
  isLastResort: boolean
}): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()
  try {
    await prisma.staffMember.create({ data: input })
    revalidatePath("/scheduler")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message }
  }
}

export async function updateStaffMember(
  id: string,
  input: { name: string; primaryRole: StaffRole; isLastResort: boolean; isActive: boolean }
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()
  try {
    await prisma.staffMember.update({ where: { id }, data: input })
    revalidatePath("/scheduler")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message }
  }
}

export async function deleteStaffMember(id: string): Promise<{ success: boolean }> {
  await requireAdmin()
  await prisma.staffMember.update({ where: { id }, data: { isActive: false } })
  revalidatePath("/scheduler")
  return { success: true }
}

export async function setAvailability(
  staffId: string,
  day: SchedDay,
  type: AvailabilityType
): Promise<void> {
  await prisma.staffAvailability.upsert({
    where: { staffId_day: { staffId, day } },
    update: { type },
    create: { staffId, day, type },
  })
  revalidatePath("/scheduler")
}

// ── Schedule ──────────────────────────────────────────────────────────────────

/** Get or create a WeeklySchedule for the given Monday date (ISO string YYYY-MM-DD) */
export async function getOrCreateSchedule(weekOf: string) {
  const date = new Date(weekOf)
  let schedule = await prisma.weeklySchedule.findUnique({
    where: { weekOf: date },
    include: {
      entries: {
        include: {
          staff: true,
          location: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  })

  if (!schedule) {
    schedule = await prisma.weeklySchedule.create({
      data: { weekOf: date },
      include: {
        entries: {
          include: { staff: true, location: true },
        },
      },
    })
  }

  return schedule
}

export async function assignStaff(
  scheduleId: string,
  locationId: string,
  staffId: string,
  assignedRole: StaffRole,
  day: SchedDay
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.scheduleEntry.upsert({
      where: { scheduleId_locationId_staffId_day: { scheduleId, locationId, staffId, day } },
      update: { assignedRole },
      create: { scheduleId, locationId, staffId, assignedRole, day },
    })
    revalidatePath("/scheduler")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message }
  }
}

export async function removeEntry(entryId: string): Promise<{ success: boolean }> {
  await prisma.scheduleEntry.delete({ where: { id: entryId } })
  revalidatePath("/scheduler")
  return { success: true }
}

export async function clearSchedule(scheduleId: string): Promise<void> {
  await requireAdmin()
  await prisma.scheduleEntry.deleteMany({ where: { scheduleId } })
  revalidatePath("/scheduler")
}

// ── Auto-generate ─────────────────────────────────────────────────────────────

/**
 * Greedy auto-scheduler:
 * - For each day, for each location in order:
 *   - XR locations: assign one XR_TECH (non-last-resort first)
 *   - All locations: assign one MA (MA or XR_TECH not already used as XR)
 *   - All locations: assign one FD (FD or MA not already used)
 * - Last-resort staff only fill remaining gaps
 * - Never schedule the same person at two locations in the same role the same day
 */
export async function autoGenerate(scheduleId: string): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()
  try {
    const [locations, allStaff] = await Promise.all([
      prisma.scheduleLocation.findMany({ orderBy: { order: "asc" } }),
      prisma.staffMember.findMany({
        where: { isActive: true },
        include: { availability: true },
      }),
    ])

    // Clear existing entries
    await prisma.scheduleEntry.deleteMany({ where: { scheduleId } })

    const days: SchedDay[] = ["MON", "TUE", "WED", "THU", "FRI"]
    const entriesToCreate: {
      scheduleId: string
      locationId: string
      staffId: string
      assignedRole: StaffRole
      day: SchedDay
    }[] = []

    for (const day of days) {
      // Staff available this day (not UNAVAILABLE)
      const available = allStaff.filter((s) => {
        const a = s.availability.find((av) => av.day === day)
        return !a || a.type !== "UNAVAILABLE"
      })

      const regular = available.filter((s) => !s.isLastResort)
      const lastResort = available.filter((s) => s.isLastResort)

      // Track assigned staff this day to avoid double-booking in same role
      const assignedAsXR = new Set<string>()
      const assignedAsMA = new Set<string>()
      const assignedAsFD = new Set<string>()

      function pickOne(
        candidates: typeof regular,
        exclude: Set<string>
      ) {
        // Prefer staff who are AVAILABLE over LAST_RESORT
        const avail = candidates.filter(
          (s) => !exclude.has(s.id) && !s.isLastResort &&
            (available.find((a) => a.id === s.id)?.availability.find((av) => av.day === day)?.type ?? "AVAILABLE") === "AVAILABLE"
        )
        return avail[0] ?? candidates.find((s) => !exclude.has(s.id)) ?? null
      }

      for (const loc of locations) {
        // ── XR slot ──
        if (loc.hasXray) {
          const xrPool = [...regular, ...lastResort].filter(
            (s) => s.primaryRole === "XR_TECH" && !assignedAsXR.has(s.id)
          )
          const pick = pickOne(xrPool, assignedAsXR)
          if (pick) {
            entriesToCreate.push({ scheduleId, locationId: loc.id, staffId: pick.id, assignedRole: "XR_TECH", day })
            assignedAsXR.add(pick.id)
          }
        }

        // ── MA slot ──
        // Eligible: MA or XR_TECH (who isn't doing XR at this location today)
        const maPool = [...regular, ...lastResort].filter(
          (s) =>
            (s.primaryRole === "MA" || s.primaryRole === "XR_TECH") &&
            !assignedAsMA.has(s.id)
        )
        const maPick = pickOne(maPool, assignedAsMA)
        if (maPick) {
          entriesToCreate.push({ scheduleId, locationId: loc.id, staffId: maPick.id, assignedRole: "MA", day })
          assignedAsMA.add(maPick.id)
        }

        // ── FD slot ──
        // Eligible: FD or MA (who isn't doing MA at this location today)
        const fdPool = [...regular, ...lastResort].filter(
          (s) =>
            (s.primaryRole === "FD" || s.primaryRole === "MA") &&
            !assignedAsFD.has(s.id)
        )
        const fdPick = pickOne(fdPool, assignedAsFD)
        if (fdPick) {
          entriesToCreate.push({ scheduleId, locationId: loc.id, staffId: fdPick.id, assignedRole: "FD", day })
          assignedAsFD.add(fdPick.id)
        }
      }
    }

    // Deduplicate by unique constraint before insert
    const seen = new Set<string>()
    const unique = entriesToCreate.filter((e) => {
      const key = `${e.scheduleId}-${e.locationId}-${e.staffId}-${e.day}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    await prisma.scheduleEntry.createMany({ data: unique })
    revalidatePath("/scheduler")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message }
  }
}

export async function updateScheduleNotes(scheduleId: string, notes: string): Promise<void> {
  await prisma.weeklySchedule.update({ where: { id: scheduleId }, data: { notes } })
  revalidatePath("/scheduler")
}
