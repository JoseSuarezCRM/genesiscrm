import { Suspense } from "react"
import { getOrCreateSchedule, getLocations, getStaff } from "@/app/actions/scheduler"
import ScheduleGrid from "@/components/schedule-grid"

function getMondayOf(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function toISO(date: Date): string {
  return date.toISOString().split("T")[0]
}

export default async function SchedulerPage({
  searchParams,
}: {
  searchParams: { week?: string }
}) {
  const rawWeek = searchParams.week
  let weekOf: string

  if (rawWeek && /^\d{4}-\d{2}-\d{2}$/.test(rawWeek)) {
    weekOf = toISO(getMondayOf(new Date(rawWeek + "T00:00:00")))
  } else {
    weekOf = toISO(getMondayOf(new Date()))
  }

  const [schedule, locations, staff] = await Promise.all([
    getOrCreateSchedule(weekOf),
    getLocations(),
    getStaff(),
  ])

  // Shape the schedule data to match the ScheduleGrid Props interface
  const scheduleData = {
    id: schedule.id,
    weekOf: weekOf,
    notes: schedule.notes,
    entries: (schedule.entries as any[]).map((e) => ({
      id: e.id,
      locationId: e.locationId,
      staffId: e.staffId,
      assignedRole: e.assignedRole,
      day: e.day,
      staff: {
        id: e.staff.id,
        name: e.staff.name,
        primaryRole: e.staff.primaryRole,
        isLastResort: e.staff.isLastResort,
      },
    })),
  }

  return (
    <div className="p-6 space-y-2">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900">Staff Scheduler</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Assign staff to locations for each day of the week.{" "}
          <a href="/scheduler/staff" className="text-blue-600 hover:underline">
            Manage staff →
          </a>
        </p>
      </div>

      <Suspense fallback={<div className="text-sm text-slate-400">Loading schedule…</div>}>
        <ScheduleGrid
          schedule={scheduleData}
          locations={locations}
          staff={staff}
        />
      </Suspense>
    </div>
  )
}
