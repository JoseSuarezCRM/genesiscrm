import { settingsPageOrRedirect } from "@/lib/auth-guard"
import ReconcileManager from "@/components/reconcile-manager"

export default async function ReconcilePage() {
  const session = await settingsPageOrRedirect("reconcile")

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Appointment Reconciliation</h1>
        <p className="text-sm text-slate-500">
          Upload a completed appointments report to automatically mark matching referrals as Completed.
          Matches on Genesis MRN, patient MRN, or phone number.
        </p>
      </div>

      <ReconcileManager />
    </div>
  )
}
