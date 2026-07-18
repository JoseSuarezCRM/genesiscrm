"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { StickyNote, CheckSquare, Mail, MessageSquare, CalendarClock, Phone, Trash2 } from "lucide-react"
import { deleteRecordNote, deleteRecordEmail, deleteRecordSms, type ActivityItem, type ActivityKind } from "@/app/actions/record-activity"
import RecordEngagementBar from "@/components/record-engagement-bar"
import { cn } from "@/lib/utils"

const KIND_ICON: Record<ActivityKind, typeof StickyNote> = {
  NOTE: StickyNote,
  TASK: CheckSquare,
  EMAIL: Mail,
  SMS: MessageSquare,
  CALL: Phone,
  ACTIVITY: CalendarClock,
  MEETING: CalendarClock,
}

const SUBTABS: { key: "ALL" | ActivityKind; label: string }[] = [
  { key: "ALL", label: "All activities" },
  { key: "NOTE", label: "Notes" },
  { key: "EMAIL", label: "Emails" },
  { key: "CALL", label: "Calls" },
  { key: "SMS", label: "SMS" },
  { key: "TASK", label: "Tasks" },
  { key: "MEETING", label: "Meetings" },
  { key: "ACTIVITY", label: "Activities" },
]

function fmt(d: string | Date) {
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })
}

// Long bodies (emails especially) render at a fixed height and expand on click.
function ActivityBody({ body }: { body: string }) {
  const [open, setOpen] = useState(false)
  const isLong = body.length > 280 || body.split("\n").length > 4
  return (
    <div className="mt-0.5">
      <p className={cn("text-sm text-slate-600 whitespace-pre-wrap break-words", !open && isLong && "line-clamp-4")}>{body}</p>
      {isLong && (
        <button onClick={() => setOpen((v) => !v)} className="mt-1 text-xs font-medium text-blue-600 hover:text-blue-700">
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  )
}

export default function RecordActivityFeed({ recordType, recordId, items, users = [], canEdit, showActions = true, canDeleteActivities = false }: {
  recordType: string
  recordId: string
  items: ActivityItem[]
  users?: { id: string; label: string }[]
  canEdit: boolean
  /** Hide the engagement bar when it's already shown elsewhere on the page. */
  showActions?: boolean
  /** DELETE_ACTIVITIES capability — enables deleting any engagement from the feed. */
  canDeleteActivities?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [sub, setSub] = useState<"ALL" | ActivityKind>("ALL")

  const filtered = sub === "ALL" ? items : items.filter((i) => i.kind === sub)

  // Which feed items can be deleted (with the permission): notes/calls/meetings
  // (RecordNote), emails (DirectEmail) and SMS (SmsMessage). Legacy provider notes
  // (pn_ prefix) and federated tasks/activities aren't deletable here.
  function deleteItem(item: ActivityItem) {
    startTransition(async () => {
      if (["NOTE", "CALL", "MEETING"].includes(item.kind)) await deleteRecordNote(item.id)
      else if (item.kind === "EMAIL") await deleteRecordEmail(item.id)
      else if (item.kind === "SMS") await deleteRecordSms(item.id)
      router.refresh()
    })
  }
  function canDelete(item: ActivityItem) {
    if (!canDeleteActivities) return false
    if (["NOTE", "CALL", "MEETING"].includes(item.kind)) return !item.id.startsWith("pn_")
    return item.kind === "EMAIL" || item.kind === "SMS"
  }

  return (
    <div className="space-y-4">
      {showActions && <RecordEngagementBar recordType={recordType} recordId={recordId} users={users} canEdit={canEdit} />}

      <div className="flex flex-wrap items-center gap-1 text-sm border-b border-slate-200 pb-2">
        {SUBTABS.map((t) => (
          <button key={t.key} onClick={() => setSub(t.key)}
            className={cn("px-2.5 py-1 rounded-lg font-medium transition-colors", sub === t.key ? "bg-zinc-900 text-white" : "text-slate-500 hover:bg-slate-100")}>
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-xl px-5 py-10 text-center text-sm text-slate-400">
          {sub === "ALL" ? "No activity yet." : `No ${SUBTABS.find((t) => t.key === sub)?.label.toLowerCase()}.`}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => {
            const Icon = KIND_ICON[item.kind] ?? StickyNote
            const deletable = canDelete(item)
            return (
              <div key={`${item.kind}-${item.id}`} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><Icon className="h-3.5 w-3.5 text-slate-500" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800">{item.title}</p>
                      <span className="text-xs text-slate-400 shrink-0">{fmt(item.date)}</span>
                    </div>
                    {item.body && <ActivityBody body={item.body} />}
                    <p className="text-xs text-slate-400 mt-1">{item.by ? `by ${item.by}` : ""}</p>
                  </div>
                  {deletable && (
                    <button onClick={() => deleteItem(item)} disabled={isPending} title="Delete" className="h-6 w-6 inline-flex items-center justify-center text-slate-300 hover:text-red-500 rounded shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
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
