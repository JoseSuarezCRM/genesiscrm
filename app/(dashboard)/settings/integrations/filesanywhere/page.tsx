import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { settingsPageOrRedirect } from "@/lib/auth-guard"
import { userCan } from "@/lib/permissions"
import { getFaSettings } from "@/app/actions/filesanywhere"
import FilesanywhereConfig from "@/components/filesanywhere-config"

// Server actions on this page (import batches) may need more than the default
// serverless budget; give them headroom.
export const maxDuration = 60

export default async function FilesanywherePage() {
  // Connected Apps box, or Manage Users as before.
  const session = await settingsPageOrRedirect("integrations", { boxOnly: true, alsoAllow: (u) => userCan(u, "MANAGE_USERS") })
  const settings = await getFaSettings()

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link href="/settings/integrations" className="inline-flex items-center text-xs text-slate-500 hover:text-slate-800 mb-3">
        <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Connected Apps
      </Link>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">FilesAnywhere — EMR Appointments</h1>
        <p className="text-sm text-slate-500 mt-1">
          Pulls the weekly EMR CSV and creates a referring provider (matched by NPI) + an appointment record for each row, linked together — on your schedule.
        </p>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 mb-4">
        These files are PHI. Keep a BAA with FilesAnywhere. Pulled over SFTP (connect.filesanywhere.com).
      </div>
      <FilesanywhereConfig settings={settings} />
    </div>
  )
}
