"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { StickyNote, CheckSquare, Mail, MessageSquare, CalendarClock, Phone, Loader2, Send, X, FileText, Braces } from "lucide-react"
import {
  addRecordNote, createTaskForRecord,
  getRecordContact, getComposeTemplates, getRecordTokenGroups, sendEmailFromRecord, sendSmsFromRecord, logCall, logMeeting,
} from "@/app/actions/record-activity"
import StyledSelect from "@/components/ui/styled-select"
import { RichTextEditor } from "@/components/rich-text-editor"
import type { MessageTokenGroup } from "@/lib/message-tokens"
import { cn } from "@/lib/utils"

type Tpl = { id: string; name: string; subject: string; body: string }

// Insert text at the caret of a controlled textarea, then restore the caret.
function insertAtCaret(el: HTMLTextAreaElement | null, value: string, token: string, setValue: (v: string) => void) {
  if (!el) { setValue(value + token); return }
  const start = el.selectionStart ?? value.length
  const end = el.selectionEnd ?? value.length
  const next = value.slice(0, start) + token + value.slice(end)
  setValue(next)
  requestAnimationFrame(() => { el.focus(); const pos = start + token.length; el.setSelectionRange(pos, pos) })
}

type Composer = "NOTE" | "EMAIL" | "CALL" | "SMS" | "TASK" | "MEETING"

const ACTIONS: { key: Composer; label: string; icon: typeof StickyNote }[] = [
  { key: "NOTE", label: "Note", icon: StickyNote },
  { key: "EMAIL", label: "Email", icon: Mail },
  { key: "CALL", label: "Call", icon: Phone },
  { key: "SMS", label: "SMS", icon: MessageSquare },
  { key: "TASK", label: "Task", icon: CheckSquare },
  { key: "MEETING", label: "Meeting", icon: CalendarClock },
]

const CALL_OUTCOMES = ["Connected", "Left voicemail", "No answer", "Busy", "Wrong number"]
const INPUT = "text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600/10 focus:border-zinc-400"

export default function RecordEngagementBar({ recordType, recordId, users = [], canEdit, compact = false, onLogged }: {
  recordType: string
  recordId: string
  users?: { id: string; label: string }[]
  canEdit: boolean
  /** Tighter spacing for narrow columns (e.g. the left column of a record page). */
  compact?: boolean
  /** Fired after an engagement is saved — e.g. to switch the middle column to Activities. */
  onLogged?: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState<Composer | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [note, setNote] = useState("")
  const [taskTitle, setTaskTitle] = useState("")
  const [taskDue, setTaskDue] = useState("")
  const [taskAssignee, setTaskAssignee] = useState("")
  const [emTo, setEmTo] = useState("")
  const [emCc, setEmCc] = useState("")
  const [emBcc, setEmBcc] = useState("")
  const [showCcBcc, setShowCcBcc] = useState(false)
  const [emSubject, setEmSubject] = useState("")
  const [emBody, setEmBody] = useState("")
  const [smTo, setSmTo] = useState("")
  const [smBody, setSmBody] = useState("")
  const [emailTpls, setEmailTpls] = useState<Tpl[]>([])
  const [smsTpls, setSmsTpls] = useState<Tpl[]>([])
  const [tokenGroups, setTokenGroups] = useState<MessageTokenGroup[]>([])
  const smBodyRef = useRef<HTMLTextAreaElement>(null)
  const [callOutcome, setCallOutcome] = useState(CALL_OUTCOMES[0])
  const [callBody, setCallBody] = useState("")
  const [mtTitle, setMtTitle] = useState("")
  const [mtStart, setMtStart] = useState("")
  const [mtMins, setMtMins] = useState("30")
  const [mtLocation, setMtLocation] = useState("")
  const [mtBody, setMtBody] = useState("")
  const [mtAttendees, setMtAttendees] = useState("")
  const [mtInvite, setMtInvite] = useState(true)

  useEffect(() => {
    if (!canEdit) return
    getRecordContact(recordType, recordId).then((c) => {
      if (c.emails[0]) { setEmTo(c.emails[0]); setMtAttendees(c.emails[0]) }
      if (c.phones[0]) setSmTo(c.phones[0])
    })
    getComposeTemplates(recordType, recordId, "EMAIL" as any).then(setEmailTpls).catch(() => {})
    getComposeTemplates(recordType, recordId, "SMS" as any).then(setSmsTpls).catch(() => {})
    getRecordTokenGroups(recordType, recordId).then(setTokenGroups).catch(() => {})
  }, [recordType, recordId, canEdit])

  // Flat, group-prefixed field list for the SMS picker (no rich editor there).
  const flatTokens = tokenGroups.flatMap((g) => g.tokens.map((t) => ({ value: t.value, label: `${g.group}: ${t.label}` })))

  function applyTemplate(t: Tpl, channel: "EMAIL" | "SMS") {
    if (channel === "EMAIL") { if (t.subject) setEmSubject(t.subject); setEmBody(/<[a-z!/][^>]*>/i.test(t.body) ? t.body : t.body.replace(/\n/g, "<br>")) }
    else setSmBody(t.body)
  }

  // Rich-editor HTML can be tags-only ("<br>") but visually empty.
  const emBodyEmpty = emBody.replace(/<[^>]*>/g, "").replace(/&nbsp;| /g, "").trim() === ""

  if (!canEdit) return null

  function run(fn: () => Promise<any>, onDone: () => void) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res?.error) { setError(res.error); return }
      onDone(); setOpen(null); onLogged?.(); router.refresh()
    })
  }

  const submit: Record<Composer, () => void> = {
    NOTE: () => run(() => addRecordNote(recordType, recordId, note), () => setNote("")),
    TASK: () => run(() => createTaskForRecord(recordType, recordId, { title: taskTitle, dueDate: taskDue || undefined, assignedToId: taskAssignee || undefined }),
      () => { setTaskTitle(""); setTaskDue(""); setTaskAssignee("") }),
    EMAIL: () => run(() => sendEmailFromRecord(recordType, recordId, {
      to: emTo, subject: emSubject, body: emBody,
      cc: emCc.split(/[,;\s]+/).filter(Boolean), bcc: emBcc.split(/[,;\s]+/).filter(Boolean),
    }), () => { setEmSubject(""); setEmBody(""); setEmCc(""); setEmBcc(""); setShowCcBcc(false) }),
    SMS: () => run(() => sendSmsFromRecord(recordType, recordId, { to: smTo, body: smBody }), () => setSmBody("")),
    CALL: () => run(() => logCall(recordType, recordId, { body: callBody, outcome: callOutcome }), () => setCallBody("")),
    MEETING: () => run(() => logMeeting(recordType, recordId, {
      title: mtTitle, start: mtStart, durationMins: Number(mtMins) || 30,
      location: mtLocation || undefined, body: mtBody || undefined,
      attendees: mtAttendees.split(/[,;\s]+/).filter(Boolean), sendInvite: mtInvite,
    }), () => { setMtTitle(""); setMtStart(""); setMtLocation(""); setMtBody("") }),
  }

  const SubmitBtn = ({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) => (
    <button onClick={onClick} disabled={isPending || disabled}
      className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} {label}
    </button>
  )

  // A small dropdown row: pick a template + (optionally) insert a personalization
  // field. The rich email editor has its own Fields menu, so email omits onField.
  const ComposerTools = ({ templates, onTemplate, onField, fields }: { templates: Tpl[]; onTemplate: (t: Tpl) => void; onField?: (token: string) => void; fields?: { value: string; label: string }[] }) => {
    const showFields = !!onField && !!fields && fields.length > 0
    if (templates.length === 0 && !showFields) return null
    return (
      <div className="flex flex-wrap items-center gap-2">
        {templates.length > 0 && (
          <div className="flex items-center gap-1.5 min-w-0">
            <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <StyledSelect value="" onChange={(e) => { const t = templates.find((x) => x.id === e.target.value); if (t) onTemplate(t) }}
              className={INPUT + " min-w-[150px]"}>
              <option value="">Use a template…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </StyledSelect>
          </div>
        )}
        {showFields && (
          <div className="flex items-center gap-1.5 min-w-0">
            <Braces className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <StyledSelect value="" onChange={(e) => { if (e.target.value) onField!(e.target.value) }} className={INPUT + " min-w-[140px]"}>
              <option value="">Insert field…</option>
              {fields!.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </StyledSelect>
          </div>
        )}
      </div>
    )
  }

  const isModal = open === "EMAIL" || open === "SMS"

  return (
    <div className="space-y-3">
      <div className={cn("flex flex-wrap items-start", compact ? "gap-2" : "gap-3")}>
        {ACTIONS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => { setError(null); setOpen(open === key ? null : key) }}
            className="flex flex-col items-center gap-1 group">
            <span className={cn(
              "rounded-full border flex items-center justify-center transition-colors",
              compact ? "h-7 w-7" : "h-8 w-8",
              open === key ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600 group-hover:border-zinc-400 group-hover:text-zinc-900",
            )}>
              <Icon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
            </span>
            <span className={cn("text-[11px] font-medium leading-none", open === key ? "text-zinc-900" : "text-slate-500 group-hover:text-zinc-900")}>{label}</span>
          </button>
        ))}
      </div>

      {open && !isModal && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">
              {open === "NOTE" ? "Add a note" : open === "CALL" ? "Log a call"
                : open === "TASK" ? "Create a task" : "Schedule a meeting"}
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
                <StyledSelect value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)} className={INPUT + " min-w-[150px]"}>
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
                <input value={mtLocation} onChange={(e) => setMtLocation(e.target.value)} placeholder="Location / link" className={INPUT + " flex-1 min-w-[140px]"} />
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

      {isModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/30 backdrop-blur-sm p-4 sm:p-8 animate-overlay-in"
          onMouseDown={() => setOpen(null)}>
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 my-4 sm:my-12 animate-modal-in"
            onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <p className="text-sm font-semibold text-slate-900">{open === "EMAIL" ? "Send an email" : "Send an SMS"}</p>
              <button onClick={() => setOpen(null)} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>

            <div className="p-5 space-y-2.5 max-h-[75vh] overflow-y-auto">
              {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

              {open === "EMAIL" && (
                <>
                  <div className="flex items-center gap-2">
                    <input value={emTo} onChange={(e) => setEmTo(e.target.value)} placeholder="To" className={INPUT + " flex-1 min-w-0"} />
                    {!showCcBcc && (
                      <button type="button" onClick={() => setShowCcBcc(true)} className="text-xs font-medium text-slate-500 hover:text-zinc-900 shrink-0">Cc / Bcc</button>
                    )}
                  </div>
                  {showCcBcc && (
                    <>
                      <input value={emCc} onChange={(e) => setEmCc(e.target.value)} placeholder="Cc (comma separated)" className={INPUT + " w-full"} />
                      <input value={emBcc} onChange={(e) => setEmBcc(e.target.value)} placeholder="Bcc (comma separated)" className={INPUT + " w-full"} />
                    </>
                  )}
                  <ComposerTools templates={emailTpls} onTemplate={(t) => applyTemplate(t, "EMAIL")} />
                  <input value={emSubject} onChange={(e) => setEmSubject(e.target.value)} placeholder="Subject" className={INPUT + " w-full"} />
                  <RichTextEditor value={emBody} onChange={setEmBody} placeholder="Write your message…" minHeight={180} tokenGroups={tokenGroups} className="w-full" />
                  <div className="flex items-center pt-1">
                    <p className="text-xs text-slate-400">Sends from your own email address.</p>
                    <SubmitBtn label="Send email" disabled={!emTo.trim() || !emSubject.trim() || emBodyEmpty} onClick={submit.EMAIL} />
                  </div>
                </>
              )}

              {open === "SMS" && (
                <>
                  <input value={smTo} onChange={(e) => setSmTo(e.target.value)} placeholder="Phone number" className={INPUT + " w-full"} />
                  <ComposerTools templates={smsTpls} onTemplate={(t) => applyTemplate(t, "SMS")} fields={flatTokens} onField={(tok) => insertAtCaret(smBodyRef.current, smBody, tok, setSmBody)} />
                  <textarea ref={smBodyRef} rows={5} value={smBody} onChange={(e) => setSmBody(e.target.value)} placeholder="Write your message…" className={INPUT + " w-full resize-none"} />
                  <div className="flex items-center pt-1">
                    <p className="text-xs text-slate-400">{smBody.length} characters</p>
                    <SubmitBtn label="Send SMS" disabled={!smTo.trim() || !smBody.trim()} onClick={submit.SMS} />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
