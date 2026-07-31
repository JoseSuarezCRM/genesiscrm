import { requireView } from "@/lib/auth-guard"
import { userCanLevel } from "@/lib/permissions"
import { getReferralSourceReport, getIntegrationSettings } from "@/app/actions/intakeq"
import IntakeqIntegrationClient from "@/components/intakeq-integration-client"

export default async function IntakeqIntegrationPage() {
  const session = await requireView("REPORTS")
  const canEdit = userCanLevel(session?.user as any, "REPORTS", "EDIT")
  const [report, settings] = await Promise.all([getReferralSourceReport(12), getIntegrationSettings()])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">IntakeQ — Referral Sources</h1>
        <p className="text-sm text-slate-500 mt-1">
          New-patient referral sources from the “Gosm 2026 Full Intake” form, summed across English and Spanish, by week.
        </p>
      </div>
      <IntakeqIntegrationClient settings={settings} report={report} canEdit={canEdit} />
    </div>
  )
}
