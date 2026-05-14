import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getSavedReports } from "@/app/actions/saved-reports"
import DashboardClient from "@/components/reports-dashboard-client"

export default async function ReportsDashboardPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const savedReports = await getSavedReports()

  return <DashboardClient savedReports={savedReports} />
}
