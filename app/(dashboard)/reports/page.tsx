import { requireView } from "@/lib/auth-guard"
import { getReportsList, getReportingCounts } from "@/app/actions/saved-reports"
import ReportingShell from "@/components/reporting-shell"
import ReportsListView from "@/components/reports-list-view"

export default async function MyReportsPage() {
  await requireView("REPORTS")
  const [reports, counts] = await Promise.all([getReportsList(), getReportingCounts()])

  return (
    <ReportingShell active="reports" counts={counts}>
      <ReportsListView reports={reports} />
    </ReportingShell>
  )
}
