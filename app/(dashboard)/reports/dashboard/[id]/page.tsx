import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { getDashboard } from "@/app/actions/dashboards"
import { getSavedReports } from "@/app/actions/saved-reports"
import DashboardDetailClient from "@/components/reports-dashboard-detail-client"

export default async function DashboardDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await auth()
  if (!session) redirect("/login")

  const [dashboard, allReports] = await Promise.all([
    getDashboard(params.id),
    getSavedReports(),
  ])

  if (!dashboard) notFound()

  return <DashboardDetailClient dashboard={dashboard} allReports={allReports} />
}
