"use client"

import { useState, useTransition } from "react"
import { Phone, PhoneOff, PhoneIncoming, PhoneMissed, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { logCallAttempt, deleteCallAttempt } from "@/app/actions/call-attempts"
import { CallOutcome } from "@prisma/client"

const MAX_ATTEMPTS = 3

const OUTCOMES: { value: CallOutcome; label: string; color: string }[] = [
  { value: "NO_ANSWER", label: "No Answer", color: "text-slate-500" },
  { value: "VOICEMAIL", label: "Voicemail", color: "text-yellow-600" },
  { value: "ANSWERED", label: "Answered", color: "text-green-600" },
]

const OUTCOME_ICON = {
  NO_ANSWER: PhoneOff,
  VOICEMAIL: PhoneMissed,
  ANSWERED: PhoneIncoming,
}

const OUTCOME_COLORS = {
  NO_ANSWER: { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-300", dot: "bg-slate-400" },
  VOICEMAIL: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-300", dot: "bg-yellow-400" },
  ANSWERED: { bg: "bg-green-50", text: "text-green-700", border: "border-green-300", dot: "bg-green-500" },
}

interface CallAttempt {
  id: string
  outcome: CallOutcome
  notes: string | null
  createdAt: Date
  calledBy?: { name: string | null; email: string } | null
}

interface Props {
  referralId: string
  attempts: CallAttempt[]
}

function formatTime(date: Date) {
  return new Date(date).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
    hour12: true,
  })
}

export default function CallTracker({ referralId, attempts: initial }: Props) {
  const [attempts, setAttempts] = useState<CallAttempt[]>(initial)
  const [showLog, setShowLog] = useState(false)
  const [outcome, setOutcome] = useState<CallOutcome>("NO_ANSWER")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const count = attempts.length
  const canLog = count < MAX_ATTEMPTS

  function handleLog() {
    setError(null)
    startTransition(async () => {
      const result = await logCallAttempt({ referralId, outcome, notes })
      if ("error" in result && result.error) { setError(result.error); return }
      // Optimistic update won't have full data — reload via revalidation, but also close form
      setNotes("")
      setShowLog(false)
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteCallAttempt(id, referralId)
      setAttempts((prev) => prev.filter((a) => a.id !== id))
    })
  }

  return (
    <div className="space-y-3">
      {/* Attempt slots */}
      <div className="flex gap-3">
        {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => {
          const attempt = attempts[i]
          if (attempt) {
            const colors = OUTCOME_COLORS[attempt.outcome]
            const Icon = OUTCOME_ICON[attempt.outcome]
            return (
              <div
                key={attempt.id}
                className={`flex-1 rounded-lg border px-3 py-2.5 ${colors.bg} ${colors.border} relative group`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`flex items-center justify-center w-6 h-6 rounded-full bg-white/70 ${colors.text}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div>
                      <p className={`text-xs font-semibold ${colors.text}`}>
                        Call {i + 1} · {OUTCOMES.find(o => o.value === attempt.outcome)?.label}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{formatTime(attempt.createdAt)}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(attempt.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-all"
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {attempt.notes && (
                  <p className="text-[11px] text-slate-600 mt-1.5 pl-8 leading-snug">{attempt.notes}</p>
                )}
              </div>
            )
          }
          return (
            <div
              key={i}
              className="flex-1 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 flex items-center gap-2"
            >
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-200">
                <Phone className="h-3 w-3 text-slate-400" />
              </span>
              <p className="text-xs text-slate-400">Call {i + 1}</p>
            </div>
          )
        })}
      </div>

      {/* Log call form */}
      {canLog && (
        <>
          {!showLog ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs h-8"
              onClick={() => setShowLog(true)}
              disabled={isPending}
            >
              <Phone className="h-3.5 w-3.5" />
              Log Call Attempt {count + 1}
            </Button>
          ) : (
            <div className="rounded-lg border bg-white p-3 space-y-2.5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Log Call {count + 1} of {MAX_ATTEMPTS}
              </p>
              <div className="flex gap-2">
                {OUTCOMES.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setOutcome(o.value)}
                    className={`flex-1 rounded-md border py-1.5 text-xs font-medium transition-colors ${
                      outcome === o.value
                        ? "border-slate-800 bg-slate-800 text-white"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (optional)"
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <Button type="button" size="sm" className="h-7 text-xs" onClick={handleLog} disabled={isPending}>
                  Save
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setShowLog(false); setNotes(""); setError(null) }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {!canLog && (
        <p className="text-xs text-slate-400">All 3 call attempts logged.</p>
      )}
    </div>
  )
}
