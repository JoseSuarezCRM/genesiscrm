import { requireView } from "@/lib/auth-guard"
import { userCanLevel } from "@/lib/permissions"
import { getReferralSourceReport } from "@/app/actions/intakeq"
import IntakeqReferralReport from "@/components/intakeq-referral-report"

export default async function IntakeqIntegrationPage() {
  const session = await requireView("REPORTS")
  const canEdit = userCanLevel(session?.user as any, "REPORTS", "EDIT")
  const report = await getReferralSourceReport(12)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">IntakeQ — Referral Sources</h1>
        <p className="text-sm text-slate-500 mt-1">
          New-patient referral sources from the “Gosm 2026 Full Intake” form, summed across English and Spanish, by week.
        </p>
      </div>
      <IntakeqReferralReport initial={report} canEdit={canEdit} />
    </div>
  )
}
