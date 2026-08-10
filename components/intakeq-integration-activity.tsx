"use client"

import { cn } from "@/lib/utils"
import { Activity, AlertCircle, Users } from "lucide-react"
import type { IntegrationActivity, IntakeSubmission } from "@/app/actions/intakeq"

function dayLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })
}

function submittedLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })
}

export default function IntakeqIntegrationActivity({ activity, submissions }: { activity: IntegrationActivity; submissions: IntakeSubmission[] }) {
  const max = Math.max(1, ...activity.perDay.map((d) => d.calls))

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><Activity className="h-3.5 w-3.5" /> API calls · 7 days</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{activity.totalCalls7d.toLocaleString()}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><AlertCircle className="h-3.5 w-3.5" /> Errors · 7 days</div>
          <div className={cn("text-2xl font-bold mt-1", activity.errors7d > 0 ? "text-red-600" : "text-slate-900")}>{activity.errors7d.toLocaleString()}</div>
        </div>
      </div>

      {/* Per-day mini chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold text-slate-600 mb-3">Calls per day</p>
        <div className="flex items-end gap-2 h-24">
          {activity.perDay.map((d) => (
            <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex-1 flex items-end">
                <div className="w-full rounded-t bg-blue-500/80" style={{ height: `${Math.round((d.calls / max) * 100)}%` }} title={`${d.calls} calls${d.errors ? `, ${d.errors} errors` : ""}`} />
              </div>
              <span className="text-[10px] text-slate-500">{dayLabel(d.day)}</span>
              <span className="text-[10px] text-slate-400 tabular-nums">{d.calls}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent submissions (who filled the intake) */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50 flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-slate-500" />
          <p className="text-xs font-semibold text-slate-600">Recent submissions</p>
        </div>
        {submissions.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-400 text-center">No submissions yet. They appear here as intakes are received or backfilled.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Referral source</th>
                  <th className="px-4 py-2 font-medium whitespace-nowrap">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {submissions.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2 text-slate-800">
                      {s.clientName ?? (s.clientId ? <span className="text-slate-500">Client #{s.clientId}</span> : <span className="text-slate-400">—</span>)}
                      {s.language && <span className="ml-1.5 text-[10px] text-slate-400">{s.language}</span>}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{s.category}</td>
                    <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{submittedLabel(s.submittedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent events */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
          <p className="text-xs font-semibold text-slate-600">Recent activity</p>
        </div>
        {activity.recent.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-400 text-center">No activity yet. It fills in as forms are submitted or you run a backfill.</p>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
            {activity.recent.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className={cn("h-2 w-2 rounded-full shrink-0", e.ok ? "bg-emerald-500" : "bg-red-500")} />
                <span className={cn("text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded shrink-0", e.kind === "webhook" ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-600")}>{e.kind}</span>
                <span className="font-mono text-xs text-slate-700 truncate">{e.endpoint}</span>
                {e.status != null && <span className={cn("text-xs tabular-nums shrink-0", e.ok ? "text-slate-500" : "text-red-600 font-medium")}>{e.status}</span>}
                {e.message && <span className="text-xs text-slate-400 truncate hidden sm:block">{e.message}</span>}
                <span className="text-xs text-slate-400 ml-auto shrink-0 whitespace-nowrap">{new Date(e.at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
