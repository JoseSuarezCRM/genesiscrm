"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { StaffRole, SchedDay, AvailabilityType } from "@prisma/client"

// ── Auth ──────────────────────────────────────────────────────────────────────

async function requireAdmin() {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  const user = session.user as any
  const isAdmin = user.role === "ADMIN"
  const hasSchedulingPerm = (user.permissions as string[] | undefined)?.includes("MANAGE_SCHEDULING") || (user.permissions as string[] | undefined)?.includes("NAV_SCHEDULING")
  if (!isAdmin && !hasSchedulingPerm) throw new Error("Unauthorized")
}

// ── Locations ─────────────────────────────────────────────────────────────────

export async function getLocations() {
  return prisma.scheduleLocation.findMany({
    orderBy: { order: "asc" },
    include: { requirements: true },
  })
}

type ReqInput = { role: string; countMon: number; countTue: number; countWed: number; countThu: number; countFri: number }

export async function createLocation(input: {
  code: string
  name: string
  openDays: string[]
  requirements: ReqInput[]
}): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()
  try {
    const max = await prisma.scheduleLocation.aggregate({ _max: { order: true } })
    await prisma.scheduleLocation.create({
      data: {
        code: input.code,
        name: input.name,
        openDays: input.openDays,
        order: (max._max.order ?? 0) + 1,
        requirements: {
          create: input.requirements.map(r => ({
            role: r.role as any,
            countMon: r.countMon, countTue: r.countTue, countWed: r.countWed,
            countThu: r.countThu, countFri: r.countFri,
          })),
        },
      },
    })
    revalidatePath("/scheduler")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message }
  }
}

export async function updateLocation(
  id: string,
  input: {
    code: string
    name: string
    openDays: string[]
    requirements: ReqInput[]
  }
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()
  try {
    await prisma.$transaction([
      prisma.scheduleLocation.update({
        where: { id },
        data: { code: input.code, name: input.name, openDays: input.openDays },
      }),
      prisma.locationRoleRequirement.deleteMany({ where: { locationId: id } }),
      prisma.locationRoleRequirement.createMany({
        data: input.requirements.map(r => ({
          locationId: id, role: r.role as any,
          countMon: r.countMon, countTue: r.countTue, countWed: r.countWed,
          countThu: r.countThu, countFri: r.countFri,
        })),
      }),
    ])
    revalidatePath("/scheduler")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message }
  }
}

export async function deleteLocation(id: string): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()
  try {
    await prisma.scheduleLocation.delete({ where: { id } })
    revalidatePath("/scheduler")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message }
  }
}

// ── Staff ─────────────────────────────────────────────────────────────────────

export async function getStaff() {
  return prisma.staffMember.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: { availability: true, locationAssignments: true },
  })
}

export async function setStaffLocations(
  staffId: string,
  locationIds: string[]
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()
  try {
    await prisma.$transaction([
      prisma.staffLocationAssignment.deleteMany({ where: { staffId } }),
      ...(locationIds.length > 0
        ? [prisma.staffLocationAssignment.createMany({
            data: locationIds.map(locationId => ({ staffId, locationId })),
          })]
        : []),
    ])
    revalidatePath("/scheduler")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message }
  }
}

export async function createStaffMember(input: {
  name: string
  primaryRole: StaffRole
  roles: StaffRole[]
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
  input: { name: string; primaryRole: StaffRole; roles: StaffRole[]; isLastResort: boolean; isActive: boolean }
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
      prisma.scheduleLocation.findMany({
        orderBy: { order: "asc" },
        include: { requirements: true },
      }),
      prisma.staffMember.findMany({
        where: { isActive: true },
        include: { availability: true, locationAssignments: true },
      }),
    ])

    await prisma.scheduleEntry.deleteMany({ where: { scheduleId } })

    const ALL_DAYS: SchedDay[] = ["MON", "TUE", "WED", "THU", "FRI"]
    const entriesToCreate: {
      scheduleId: string; locationId: string; staffId: string; assignedRole: StaffRole; day: SchedDay
    }[] = []

    type StaffPool = typeof allStaff

    const pickOne = (candidates: StaffPool, exclude: Set<string>) => {
      const avail = candidates.filter((s) => !exclude.has(s.id) && !s.isLastResort)
      return avail[0] ?? candidates.find((s) => !exclude.has(s.id)) ?? null
    }

    // Role eligibility: check staff's roles array
    const eligible = (role: StaffRole, memberRoles: StaffRole[]) =>
      memberRoles.includes(role)

    for (const day of ALL_DAYS) {
      const available = allStaff.filter((s) => {
        const a = s.availability.find((av) => av.day === day)
        return !a || a.type !== "UNAVAILABLE"
      })

      // Per-role tracker to avoid double-booking the same person in the same role on the same day
      const assignedPerRole: Record<StaffRole, Set<string>> = {
        XR_TECH: new Set(), MA: new Set(), FD: new Set(),
      }

      for (const loc of locations) {
        // Skip location if today is not one of its open days (empty = all days)
        if (loc.openDays.length > 0 && !loc.openDays.includes(day)) continue

        // Only use staff explicitly assigned to this location
        const locAvailable = available.filter((s) =>
          s.locationAssignments.some((a) => a.locationId === loc.id)
        )
        const locRegular    = locAvailable.filter((s) => !s.isLastResort)
        const locLastResort = locAvailable.filter((s) => s.isLastResort)

        for (const req of loc.requirements) {
          const role = req.role as StaffRole
          const dayCount: Record<SchedDay, number> = {
            MON: req.countMon, TUE: req.countTue, WED: req.countWed, THU: req.countThu, FRI: req.countFri,
          }
          for (let i = 0; i < dayCount[day]; i++) {
            const pool = [...locRegular, ...locLastResort].filter(
              (s) => eligible(role, s.roles) && !assignedPerRole[role].has(s.id)
            )
            const pick = pickOne(pool, assignedPerRole[role])
            if (pick) {
              entriesToCreate.push({ scheduleId, locationId: loc.id, staffId: pick.id, assignedRole: role, day })
              assignedPerRole[role].add(pick.id)
            }
          }
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
