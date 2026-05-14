import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getDashboards } from "@/app/actions/dashboards"
import DashboardListClient from "@/components/reports-dashboard-client"

export default async function ReportsDashboardPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const dashboards = await getDashboards()

  return <DashboardListClient dashboards={dashboards} />
}
