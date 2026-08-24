import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { getDashboard } from "@/app/actions/dashboards"
import { getSavedReports } from "@/app/actions/saved-reports"
import { getViewShareOptions } from "@/app/actions/view-share-options"
import DashboardDetailClient from "@/components/reports-dashboard-detail-client"

export default async function DashboardDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await auth()
  if (!session) redirect("/login")

  const [dashboard, allReports, shareOptions] = await Promise.all([
    getDashboard(params.id),
    getSavedReports(),
    getViewShareOptions(),
  ])

  if (!dashboard) notFound()

  return <DashboardDetailClient dashboard={dashboard} allReports={allReports} shareUsers={shareOptions.users} shareTeams={shareOptions.teams} />
}
