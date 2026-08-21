import { requireView } from "@/lib/auth-guard"
import { listReportObjects } from "@/lib/reporting/objects"
import ReportBuilderV2 from "@/components/report-builder-v2"

export default async function ReportBuilderV2Page() {
  await requireView("REPORTS")
  const objects = await listReportObjects()
  return (
    <div className="h-full">
      <ReportBuilderV2 objects={objects} />
    </div>
  )
}
