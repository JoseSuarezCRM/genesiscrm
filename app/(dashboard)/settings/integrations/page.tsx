import Link from "next/link"
import { requireView } from "@/lib/auth-guard"
import { getIntegrationsList } from "@/app/actions/intakeq"
import { cn } from "@/lib/utils"
import { Plug, ChevronRight } from "lucide-react"

export default async function ConnectedAppsPage() {
  await requireView("REPORTS")
  const apps = await getIntegrationsList()

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Connected Apps</h1>
        <p className="text-sm text-slate-500 mt-1">Third-party services connected to the CRM.</p>
      </div>

      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <th className="text-left font-semibold px-4 py-2.5">App</th>
              <th className="text-left font-semibold px-4 py-2.5">Status</th>
              <th className="text-left font-semibold px-4 py-2.5 whitespace-nowrap">Last activity</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {apps.map((app) => (
              <tr key={app.provider} className="hover:bg-slate-50/70">
                <td className="px-4 py-3">
                  <Link href={app.href} className="flex items-center gap-3 group">
                    <span className="h-9 w-9 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0"><Plug className="h-4 w-4" /></span>
                    <span className="min-w-0">
                      <span className="block font-medium text-slate-900 group-hover:text-blue-700">{app.name}</span>
                      <span className="block text-xs text-slate-500 truncate">{app.description}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full",
                    app.status === "connected" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", app.status === "connected" ? "bg-emerald-500" : "bg-slate-400")} />
                    {app.status === "connected" ? (app.enabled ? "Connected" : "Connected · disabled") : "Not connected"}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                  {app.lastActivityAt ? new Date(app.lastActivityAt).toLocaleString() : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={app.href} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
                    Manage <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
