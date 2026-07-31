import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { requireView } from "@/lib/auth-guard"
import { userCanLevel } from "@/lib/permissions"
import { getReferralSourceReport, getIntegrationSettings, getIntegrationActivity } from "@/app/actions/intakeq"
import IntakeqIntegrationClient from "@/components/intakeq-integration-client"

export default async function IntakeqIntegrationPage() {
  const session = await requireView("REPORTS")
  const canEdit = userCanLevel(session?.user as any, "REPORTS", "EDIT")
  const [report, settings, activity] = await Promise.all([getReferralSourceReport("week"), getIntegrationSettings(), getIntegrationActivity()])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link href="/settings/integrations" className="inline-flex items-center text-xs text-slate-500 hover:text-slate-800 mb-3">
        <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Connected Apps
      </Link>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">IntakeQ — Referral Sources</h1>
        <p className="text-sm text-slate-500 mt-1">
          New-patient referral sources from the “Gosm 2026 Full Intake” form, summed across English and Spanish, by week.
        </p>
      </div>
      <IntakeqIntegrationClient settings={settings} report={report} activity={activity} canEdit={canEdit} />
    </div>
  )
}
