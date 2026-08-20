import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { getSchedulingState } from "@/app/actions/scheduling-state"
import { SchedulingProvider } from "@/components/scheduling-v2/store"
import SchedulingNav from "@/components/scheduling-v2/nav"
import "./planner.css"

export default async function SchedulingV2Layout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  const user = session?.user as any
  const perms = user?.permissions as string[] | undefined
  const allowed =
    user?.role === "ADMIN" ||
    perms?.includes("MANAGE_SCHEDULING") ||
    perms?.includes("NAV_SCHEDULING")
  if (!allowed) redirect("/")

  const initialState = await getSchedulingState()

  return (
    <SchedulingProvider initialState={initialState}>
      <div className="flex h-full flex-col">
        <SchedulingNav />
        <div className="svtwo flex-1 overflow-auto bg-white px-5 py-5">{children}</div>
      </div>
    </SchedulingProvider>
  )
}
