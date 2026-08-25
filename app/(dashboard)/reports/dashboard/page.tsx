import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getDashboards } from "@/app/actions/dashboards"
import { getReportingCounts } from "@/app/actions/saved-reports"
import ReportingShell from "@/components/reporting-shell"
import DashboardsListView from "@/components/dashboards-list-view"

export default async function ReportsDashboardPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const [dashboards, counts] = await Promise.all([getDashboards(), getReportingCounts()])

  return (
    <ReportingShell active="dashboards" counts={counts}>
      <DashboardsListView dashboards={dashboards} />
    </ReportingShell>
  )
}
