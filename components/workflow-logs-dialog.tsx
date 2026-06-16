"use client"

import { useState, useTransition } from "react"
import { ScrollText, X, Loader2, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react"
import { getAutomationRuns } from "@/app/actions/automations"
import { cn } from "@/lib/utils"

interface Run {
  id: string
  triggeredAt: string
  result: string
  contextType: string
  contextId: string
  detail: string | null
}

export default function WorkflowLogsDialog({ automationId, name }: { automationId: string; name: string }) {
  const [open, setOpen] = useState(false)
  const [runs, setRuns] = useState<Run[]>([])
  const [pending, startTransition] = useTransition()
  const [loaded, setLoaded] = useState(false)

  function load() {
    startTransition(async () => {
      const data = await getAutomationRuns(automationId)
      setRuns(data as Run[])
      setLoaded(true)
    })
  }

  function openDialog() {
    setOpen(true)
    load()
  }

  const isError = (r: Run) => r.result === "error" || r.result === "failed"

  return (
    <>
      <button
        onClick={openDialog}
        title="View action logs"
        className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
      >
        <ScrollText className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-900 truncate">Action logs</h2>
                <p className="text-xs text-slate-500 truncate">{name}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={load} disabled={pending} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600" title="Refresh">
                  <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} />
                </button>
                <button onClick={() => setOpen(false)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {pending && !loaded ? (
                <div className="flex items-center justify-center py-16 text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : runs.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-16">No runs yet. The log fills in as this workflow fires.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {runs.map(r => (
                    <li key={r.id} className="px-6 py-3 flex items-start gap-3">
                      {isError(r)
                        ? <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                        : <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn("text-xs font-semibold uppercase tracking-wide", isError(r) ? "text-red-600" : "text-emerald-600")}>
                            {r.result}
                          </span>
                          <span className="text-xs text-slate-400">
                            {new Date(r.triggeredAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                          </span>
                          <span className="text-[10px] text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">{r.contextType}</span>
                        </div>
                        {r.detail && <p className={cn("text-sm mt-0.5 break-words", isError(r) ? "text-red-700" : "text-slate-600")}>{r.detail}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
