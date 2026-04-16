import { getStaff } from "@/app/actions/scheduler"
import StaffManager from "@/components/staff-manager"
import { ChevronLeft } from "lucide-react"
import Link from "next/link"

export default async function SchedulerStaffPage() {
  const staff = await getStaff()

  return (
    <div className="p-6 space-y-2">
      <div className="mb-4">
        <Link
          href="/scheduler"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 mb-2"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to Scheduler
        </Link>
        <h1 className="text-xl font-bold text-slate-900">Staff Roster</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Manage staff members, roles, and weekly availability.
        </p>
      </div>

      <StaffManager staff={staff} />
    </div>
  )
}
