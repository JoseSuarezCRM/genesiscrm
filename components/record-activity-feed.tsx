"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { StickyNote, CheckSquare, Mail, MessageSquare, CalendarClock, Phone, Loader2, Send, Trash2, X } from "lucide-react"
import {
  addRecordNote, deleteRecordNote, createTaskForRecord,
  getRecordContact, sendEmailFromRecord, sendSmsFromRecord, logCall, logMeeting,
  type ActivityItem, type ActivityKind,
} from "@/app/actions/record-activity"
import StyledSelect from "@/components/ui/styled-select"
import { cn } from "@/lib/utils"

type Composer = "NOTE" | "EMAIL" | "CALL" | "SMS" | "TASK" | "MEETING"

const ACTIONS: { key: Composer; label: string; icon: typeof StickyNote }[] = [
  { key: "NOTE", label: "Note", icon: StickyNote },
  { key: "EMAIL", label: "Email", icon: Mail },
  { key: "CALL", label: "Call", icon: Phone },
  { key: "SMS", label: "SMS", icon: MessageSquare },
  { key: "TASK", label: "Task", icon: CheckSquare },
  { key: "MEETING", label: "Meeting", icon: CalendarClock },
]

const KIND_META: Record<ActivityKind, { icon: typeof StickyNote }> = {
  NOTE: { icon: StickyNote },
  TASK: { icon: CheckSquare },
  EMAIL: { icon: Mail },
  SMS: { icon: MessageSquare },
  CALL: { icon: Phone },
  ACTIVITY: { icon: CalendarClock },
  MEETING: { icon: CalendarClock },
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

const CALL_OUTCOMES = ["Connected", "Left voicemail", "No answer", "Busy", "Wrong number"]

function fmt(d: string | Date) {
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })
}

const INPUT = "text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400"

export default function RecordActivityFeed({ recordType, recordId, items, users = [], canEdit }: {
  recordType: string; recordId: string; items: ActivityItem[]; users?: { id: string; label: string }[]; canEdit: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [sub, setSub] = useState<"ALL" | ActivityKind>("ALL")
  const [open, setOpen] = useState<Composer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [contact, setContact] = useState<{ emails: string[]; phones: string[] }>({ emails: [], phones: [] })

  // Note / Task
  const [note, setNote] = useState("")
  const [taskTitle, setTaskTitle] = useState("")
  const [taskDue, setTaskDue] = useState("")
  const [taskAssignee, setTaskAssignee] = useState("")
  // Email
  const [emTo, setEmTo] = useState("")
  const [emSubject, setEmSubject] = useState("")
  const [emBody, setEmBody] = useState("")
  // SMS
  const [smTo, setSmTo] = useState("")
  const [smBody, setSmBody] = useState("")
  // Call
  const [callOutcome, setCallOutcome] = useState(CALL_OUTCOMES[0])
  const [callBody, setCallBody] = useState("")
  // Meeting
  const [mtTitle, setMtTitle] = useState("")
  const [mtStart, setMtStart] = useState("")
  const [mtMins, setMtMins] = useState("30")
  const [mtLocation, setMtLocation] = useState("")
  const [mtBody, setMtBody] = useState("")
  const [mtAttendees, setMtAttendees] = useState("")
  const [mtInvite, setMtInvite] = useState(true)

  useEffect(() => {
    getRecordContact(recordType, recordId).then((c) => {
      setContact(c)
      if (c.emails[0]) { setEmTo(c.emails[0]); setMtAttendees(c.emails[0]) }
      if (c.phones[0]) setSmTo(c.phones[0])
    })
  }, [recordType, recordId])

  const filtered = sub === "ALL" ? items : items.filter((i) => i.kind === sub)

  function run(fn: () => Promise<any>, onDone: () => void) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res?.error) { setError(res.error); return }
      onDone(); setOpen(null); router.refresh()
    })
  }

  const submit = {
    NOTE: () => run(() => addRecordNote(recordType, recordId, note), () => setNote("")),
    TASK: () => run(() => createTaskForRecord(recordType, recordId, { title: taskTitle, dueDate: taskDue || undefined, assignedToId: taskAssignee || undefined }),
      () => { setTaskTitle(""); setTaskDue(""); setTaskAssignee("") }),
    EMAIL: () => run(() => sendEmailFromRecord(recordType, recordId, { to: emTo, subject: emSubject, body: emBody }),
      () => { setEmSubject(""); setEmBody("") }),
    SMS: () => run(() => sendSmsFromRecord(recordType, recordId, { to: smTo, body: smBody }), () => setSmBody("")),
    CALL: () => run(() => logCall(recordType, recordId, { body: callBody, outcome: callOutcome }), () => setCallBody("")),
    MEETING: () => run(() => logMeeting(recordType, recordId, {
      title: mtTitle, start: mtStart, durationMins: Number(mtMins) || 30,
      location: mtLocation || undefined, body: mtBody || undefined,
      attendees: mtAttendees.split(/[,;\s]+/).filter(Boolean), sendInvite: mtInvite,
    }), () => { setMtTitle(""); setMtStart(""); setMtLocation(""); setMtBody("") }),
  } satisfies Record<Composer, () => void>

  const busy = (label: string) => (
    <>{isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} {label}</>
  )
  const SubmitBtn = ({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) => (
    <button onClick={onClick} disabled={isPending || disabled}
      className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50">
      {busy(label)}
    </button>
  )

  function removeNote(id: string) {
    startTransition(async () => { await deleteRecordNote(id); router.refresh() })
  }

  return (
    <div className="space-y-4">
      {/* HubSpot-style action bar */}
      {canEdit && (
        <div className="flex flex-wrap items-start gap-5">
          {ACTIONS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => { setError(null); setOpen(open === key ? null : key) }}
              className="flex flex-col items-center gap-1.5 group">
              <span className={cn(
                "h-11 w-11 rounded-full border flex items-center justify-center transition-colors",
                open === key ? "bg-zinc-900 border-zinc-900 text-white" : "bg-white border-slate-200 text-slate-600 group-hover:border-zinc-400 group-hover:text-zinc-900",
              )}>
                <Icon className="h-4 w-4" />
              </span>
              <span className={cn("text-xs font-medium", open === key ? "text-zinc-900" : "text-slate-500 group-hover:text-zinc-900")}>{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Composer */}
      {canEdit && open && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">
              {open === "NOTE" ? "Add a note" : open === "EMAIL" ? "Send an email" : open === "CALL" ? "Log a call"
                : open === "SMS" ? "Send an SMS" : open === "TASK" ? "Create a task" : "Schedule a meeting"}
            </p>
            <button onClick={() => setOpen(null)} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

          {open === "NOTE" && (
            <>
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" className={INPUT + " w-full resize-none"} />
              <div className="flex"><SubmitBtn label="Add note" disabled={!note.trim()} onClick={submit.NOTE} /></div>
            </>
          )}

          {open === "EMAIL" && (
            <>
              <input value={emTo} onChange={(e) => setEmTo(e.target.value)} placeholder="To" className={INPUT + " w-full"} />
              <input value={emSubject} onChange={(e) => setEmSubject(e.target.value)} placeholder="Subject" className={INPUT + " w-full"} />
              <textarea rows={5} value={emBody} onChange={(e) => setEmBody(e.target.value)} placeholder="Write your message…" className={INPUT + " w-full resize-none"} />
              <div className="flex items-center">
                <p className="text-xs text-slate-400">Sends from your own email address.</p>
                <SubmitBtn label="Send email" disabled={!emTo.trim() || !emSubject.trim() || !emBody.trim()} onClick={submit.EMAIL} />
              </div>
            </>
          )}

          {open === "SMS" && (
            <>
              <input value={smTo} onChange={(e) => setSmTo(e.target.value)} placeholder="Phone number" className={INPUT + " w-full"} />
              <textarea rows={3} value={smBody} onChange={(e) => setSmBody(e.target.value)} placeholder="Write your message…" className={INPUT + " w-full resize-none"} />
              <div className="flex items-center">
                <p className="text-xs text-slate-400">{smBody.length} characters</p>
                <SubmitBtn label="Send SMS" disabled={!smTo.trim() || !smBody.trim()} onClick={submit.SMS} />
              </div>
            </>
          )}

          {open === "CALL" && (
            <>
              <StyledSelect value={callOutcome} onChange={(e) => setCallOutcome(e.target.value)} className={INPUT + " w-full"}>
                {CALL_OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
              </StyledSelect>
              <textarea rows={3} value={callBody} onChange={(e) => setCallBody(e.target.value)} placeholder="What was discussed?" className={INPUT + " w-full resize-none"} />
              <div className="flex"><SubmitBtn label="Log call" disabled={!callBody.trim()} onClick={submit.CALL} /></div>
            </>
          )}

          {open === "TASK" && (
            <>
              <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Task title…" className={INPUT + " w-full"} />
              <div className="flex flex-wrap items-center gap-2">
                <input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} className={INPUT} />
                <StyledSelect value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)} className={INPUT + " min-w-[160px]"}>
                  <option value="">Unassigned</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                </StyledSelect>
                <SubmitBtn label="Add task" disabled={!taskTitle.trim()} onClick={submit.TASK} />
              </div>
            </>
          )}

          {open === "MEETING" && (
            <>
              <input value={mtTitle} onChange={(e) => setMtTitle(e.target.value)} placeholder="Meeting title…" className={INPUT + " w-full"} />
              <div className="flex flex-wrap items-center gap-2">
                <input type="datetime-local" value={mtStart} onChange={(e) => setMtStart(e.target.value)} className={INPUT} />
                <StyledSelect value={mtMins} onChange={(e) => setMtMins(e.target.value)} className={INPUT}>
                  {["15", "30", "45", "60", "90"].map((m) => <option key={m} value={m}>{m} min</option>)}
                </StyledSelect>
                <input value={mtLocation} onChange={(e) => setMtLocation(e.target.value)} placeholder="Location / link" className={INPUT + " flex-1 min-w-[160px]"} />
              </div>
              <input value={mtAttendees} onChange={(e) => setMtAttendees(e.target.value)} placeholder="Attendee emails (comma separated)" className={INPUT + " w-full"} />
              <textarea rows={2} value={mtBody} onChange={(e) => setMtBody(e.target.value)} placeholder="Agenda / notes…" className={INPUT + " w-full resize-none"} />
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" checked={mtInvite} onChange={(e) => setMtInvite(e.target.checked)} className="rounded border-slate-300" />
                  Send a calendar invite
                </label>
                <SubmitBtn label="Save meeting" disabled={!mtTitle.trim() || !mtStart} onClick={submit.MEETING} />
              </div>
            </>
          )}
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex flex-wrap items-center gap-1 text-sm border-b border-slate-200 pb-2">
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
            const Icon = KIND_META[item.kind]?.icon ?? StickyNote
            const deletable = canEdit && ["NOTE", "CALL", "MEETING"].includes(item.kind) && !item.id.startsWith("pn_")
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
                  {deletable && (
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
