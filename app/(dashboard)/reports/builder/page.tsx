import { requireView } from "@/lib/auth-guard"
import { listReportObjects } from "@/lib/reporting/objects"
import ReportBuilderV2 from "@/components/report-builder-v2"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { getViewShareOptions } from "@/app/actions/view-share-options"

// The cross-object Report Builder (v2). The old referrals-only builder lives on
// at /reports/builder/classic for legacy v1 saved reports.
export default async function ReportBuilderPage({ searchParams }: { searchParams: { report?: string } }) {
  await requireView("REPORTS")
  const [objects, shareOptions] = await Promise.all([listReportObjects(), getViewShareOptions()])

  // Open an existing v2 report for editing (from a dashboard card / saved list).
  let initial: { id: string; name: string; config: any } | null = null
  if (searchParams.report) {
    const session = await auth()
    const rep = await (prisma as any).savedReport.findFirst({
      where: { id: searchParams.report, createdById: session?.user?.id },
      select: { id: true, name: true, config: true, visibility: true, teamId: true, sharedUserIds: true },
    }).catch(() => null)
    if (rep && (rep.config?.v === 2 || (rep.config?.primary && Array.isArray(rep.config?.measures)))) initial = rep
  }

  return (
    <div className="h-full">
      <ReportBuilderV2 objects={objects} initial={initial} shareUsers={shareOptions.users} shareTeams={shareOptions.teams} />
    </div>
  )
}
