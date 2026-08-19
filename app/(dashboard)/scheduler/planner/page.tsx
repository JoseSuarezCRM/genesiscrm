import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { getSchedulingState } from "@/app/actions/scheduling-state"
import SchedulingPlanner from "@/components/scheduling-planner"

export default async function SchedulingPlannerPage() {
  const session = await auth()
  const user = session?.user as any
  const perms = user?.permissions as string[] | undefined
  const allowed = user?.role === "ADMIN" || perms?.includes("MANAGE_SCHEDULING") || perms?.includes("NAV_SCHEDULING")
  if (!allowed) redirect("/")

  const initialState = await getSchedulingState()

  return (
    <div className="h-full">
      <SchedulingPlanner initialState={initialState} />
    </div>
  )
}
