"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { ChevronLeft, RefreshCw, CheckCircle2, AlertCircle, ChevronRight, Flag } from "lucide-react"
import { getAutomationRuns } from "@/app/actions/automations"
import { cn } from "@/lib/utils"

interface Step { label: string; status: "ok" | "failed"; error?: string }
interface RunMeta { recordLabel?: string; recordType?: string; steps?: Step[] }
interface Run {
  id: string
  triggeredAt: string
  result: string
  contextType: string
  contextId: string
  detail: string | null
  meta: RunMeta | null
}

export default function WorkflowLogsClient({
  automationId, name, triggerLabel, initialRuns,
}: {
  automationId: string
  name: string
  triggerLabel: string
  initialRuns: Run[]
}) {
  const [runs, setRuns] = useState<Run[]>(initialRuns)
  const [pending, startTransition] = useTransition()

  function refresh() {
    startTransition(async () => {
      const data = await getAutomationRuns(automationId)
      setRuns(data as Run[])
    })
  }

  const isError = (r: Run) => r.result === "error" || r.result === "failed"

  return (
    <div className="min-h-full flex flex-col">
      <div className="sticky top-0 z-20 bg-slate-900 text-white px-5 py-3 flex items-center gap-4 shrink-0">
        <Link href="/automations" className="flex items-center gap-1 text-sm text-slate-300 hover:text-white shrink-0">
          <ChevronLeft className="h-4 w-4" /> Workflows
        </Link>
        <div className="w-px h-5 bg-slate-700 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{name}</p>
          <p className="text-xs text-slate-400 truncate">Run history · {triggerLabel}</p>
        </div>
        <Link href={`/automations/${automationId}`} className="text-sm text-slate-300 hover:text-white shrink-0">Edit workflow</Link>
        <button onClick={refresh} disabled={pending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-slate-700 hover:bg-slate-600 shrink-0">
          <RefreshCw className={cn("h-3.5 w-3.5", pending && "animate-spin")} /> Refresh
        </button>
      </div>

      <div className="flex-1 bg-slate-50 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-3">
          {runs.length === 0 ? (
            <div className="text-center py-20 text-slate-400 text-sm border-2 border-dashed rounded-xl bg-white">
              No runs yet. The log fills in each time this workflow fires.
            </div>
          ) : (
            runs.map(run => {
              const steps = run.meta?.steps ?? []
              const failed = isError(run)
              return (
                <div key={run.id} className={cn("bg-white border rounded-xl overflow-hidden", failed ? "border-red-200" : "border-slate-200")}>
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                    {failed
                      ? <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                      : <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {run.meta?.recordLabel ?? run.contextId}
                      </p>
                      <p className="text-xs text-slate-400">
                        {new Date(run.triggeredAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                        {" · "}
                        <span className="capitalize">{run.contextType}</span>
                      </p>
                    </div>
                    <span className={cn("text-xs font-semibold uppercase tracking-wide shrink-0", failed ? "text-red-600" : "text-emerald-600")}>
                      {failed ? "Failed" : "Completed"}
                    </span>
                  </div>

                  <div className="px-4 py-3">
                    {/* Enrollment / trigger row */}
                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                      <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-md px-2 py-0.5 font-medium">
                        <Flag className="h-3 w-3" /> Enrolled
                      </span>
                      <span className="truncate">{run.detail}</span>
                    </div>

                    {/* Steps */}
                    {steps.length === 0 ? (
                      <p className="text-xs text-slate-400 italic pl-1">No actions ran for this record (it didn't match any branch).</p>
                    ) : (
                      <ol className="space-y-1.5">
                        {steps.map((s, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-[10px] font-bold text-slate-400 w-4 shrink-0 mt-1 text-right">{i + 1}</span>
                            <ChevronRight className="h-3 w-3 text-slate-300 shrink-0 mt-1" />
                            {s.status === "failed"
                              ? <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                              : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />}
                            <div className="min-w-0">
                              <span className="text-sm text-slate-700">{s.label}</span>
                              {s.error && <p className="text-xs text-red-600 break-words">{s.error}</p>}
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
