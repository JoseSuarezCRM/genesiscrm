"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Phone, Loader2, Plus } from "lucide-react"
import { listRecordCalls, logCall } from "@/app/actions/record-activity"
import StyledSelect from "@/components/ui/styled-select"
import { cn } from "@/lib/utils"

const OUTCOMES = ["Connected", "Left voicemail", "No answer", "Busy", "Wrong number"]

interface Call { id: string; outcome: string | null; body: string; date: string | Date; by: string | null }

// A configurable call-log card: N slots you fill by logging calls, plus the history.
export default function CallLogCard({ recordType, recordId, maxCalls = 3, canEdit }: {
  recordType: string; recordId: string; maxCalls?: number; canEdit: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [calls, setCalls] = useState<Call[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [outcome, setOutcome] = useState(OUTCOMES[0])
  const [notes, setNotes] = useState("")

  useEffect(() => { listRecordCalls(recordType, recordId).then(setCalls as any) }, [recordType, recordId])

  function save() {
    if (!notes.trim()) return
    startTransition(async () => {
      await logCall(recordType, recordId, { body: notes, outcome })
      setNotes(""); setAdding(false)
      setCalls(await listRecordCalls(recordType, recordId) as any)
      router.refresh()
    })
  }

  const done = calls ?? []
  const slots = Array.from({ length: Math.max(maxCalls, done.length) })
  const canAdd = canEdit && done.length < maxCalls

  return (
    <div className="p-5 space-y-3">
      <div className="flex gap-2 flex-wrap">
        {slots.map((_, i) => {
          const c = done[done.length - 1 - i] // oldest first in the slots
          return (
            <div key={i} className={cn("flex-1 min-w-[90px] h-10 rounded-lg border flex items-center justify-center text-xs font-medium px-2 text-center",
              c ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-200 text-slate-300")}>
              {c ? (c.outcome ?? "Logged") : `Call ${i + 1}`}
            </div>
          )
        })}
      </div>

      {canAdd && !adding && (
        <button onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900">
          <Plus className="h-3.5 w-3.5" /> Log call {done.length + 1}
        </button>
      )}

      {adding && (
        <div className="bg-slate-50 rounded-xl p-3 space-y-2">
          <StyledSelect value={outcome} onChange={(e) => setOutcome(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-zinc-400">
            {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
          </StyledSelect>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was discussed?"
            className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:border-zinc-400" />
          <div className="flex items-center gap-1">
            <button onClick={save} disabled={isPending || !notes.trim()}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />} Log call
            </button>
            <button onClick={() => setAdding(false)} className="h-8 px-2 text-sm text-slate-500 hover:text-slate-800">Cancel</button>
          </div>
        </div>
      )}

      {done.length > 0 && (
        <div className="divide-y divide-slate-100 pt-1">
          {done.map((c) => (
            <div key={c.id} className="py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-800">{c.outcome ?? "Call"}</span>
                <span className="text-xs text-slate-400">{new Date(c.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              </div>
              {c.body && <p className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap break-words">{c.body}</p>}
              {c.by && <p className="text-xs text-slate-400 mt-0.5">by {c.by}</p>}
            </div>
          ))}
        </div>
      )}

      {calls === null && <Loader2 className="h-4 w-4 animate-spin text-slate-300" />}
    </div>
  )
}
