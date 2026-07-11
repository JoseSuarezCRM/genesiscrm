"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { StickyNote, CheckSquare, Mail, MessageSquare, CalendarClock, Loader2, Send, Trash2 } from "lucide-react"
import { addRecordNote, deleteRecordNote, type ActivityItem, type ActivityKind } from "@/app/actions/record-activity"
import { cn } from "@/lib/utils"

const KIND_META: Record<ActivityKind, { label: string; icon: typeof StickyNote }> = {
  NOTE: { label: "Notes", icon: StickyNote },
  TASK: { label: "Tasks", icon: CheckSquare },
  EMAIL: { label: "Emails", icon: Mail },
  SMS: { label: "SMS", icon: MessageSquare },
  ACTIVITY: { label: "Activities", icon: CalendarClock },
  MEETING: { label: "Meetings", icon: CalendarClock },
}

const SUBTABS: { key: "ALL" | ActivityKind; label: string }[] = [
  { key: "ALL", label: "All activities" },
  { key: "NOTE", label: "Notes" },
  { key: "EMAIL", label: "Emails" },
  { key: "SMS", label: "SMS" },
  { key: "TASK", label: "Tasks" },
  { key: "MEETING", label: "Meetings" },
]

function fmt(d: string | Date) {
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })
}

export default function RecordActivityFeed({ recordType, recordId, items, canEdit }: {
  recordType: string; recordId: string; items: ActivityItem[]; canEdit: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [sub, setSub] = useState<"ALL" | ActivityKind>("ALL")
  const [note, setNote] = useState("")

  const filtered = sub === "ALL" ? items : items.filter((i) => i.kind === sub)

  function addNote() {
    if (!note.trim()) return
    startTransition(async () => {
      const res = await addRecordNote(recordType, recordId, note)
      if (!(res as any)?.error) { setNote(""); router.refresh() }
    })
  }
  function removeNote(id: string) {
    startTransition(async () => { await deleteRecordNote(id); router.refresh() })
  }

  return (
    <div className="space-y-4">
      {/* Note composer */}
      {canEdit && (
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="flex justify-end mt-2">
            <button onClick={addNote} disabled={isPending || !note.trim()}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50">
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Add note
            </button>
          </div>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex flex-wrap items-center gap-1 text-sm">
        {SUBTABS.map((t) => (
          <button key={t.key} onClick={() => setSub(t.key)}
            className={cn("px-2.5 py-1 rounded-lg font-medium transition-colors", sub === t.key ? "bg-zinc-900 text-white" : "text-slate-500 hover:bg-slate-100")}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-xl px-5 py-10 text-center text-sm text-slate-400">
          {sub === "ALL" ? "No activity yet." : `No ${SUBTABS.find((t) => t.key === sub)?.label.toLowerCase()}.`}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => {
            const Meta = KIND_META[item.kind]
            const Icon = Meta?.icon ?? StickyNote
            return (
              <div key={`${item.kind}-${item.id}`} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><Icon className="h-3.5 w-3.5 text-slate-500" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800">{item.title}</p>
                      <span className="text-xs text-slate-400 shrink-0">{fmt(item.date)}</span>
                    </div>
                    {item.body && <p className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap break-words">{item.body}</p>}
                    <p className="text-xs text-slate-400 mt-1">{item.by ? `by ${item.by}` : ""}</p>
                  </div>
                  {canEdit && item.kind === "NOTE" && (
                    <button onClick={() => removeNote(item.id)} disabled={isPending} className="h-6 w-6 inline-flex items-center justify-center text-slate-300 hover:text-red-500 rounded shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
