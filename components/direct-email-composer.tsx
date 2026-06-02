"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import { sendDirectEmail } from "@/app/actions/direct-email"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Send, X, Loader2, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Clock } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────

interface Contact {
  name: string
  email: string
  type: "patient" | "provider"
}

interface SentEmail {
  id: string
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  body: string
  sentAt: string
  success: boolean
  error: string | null
  sentBy: { name: string | null; email: string }
}

interface Props {
  contacts: Contact[]
  sentEmails: SentEmail[]
}

// ── Recipient chip input ───────────────────────────────────────────────────────

function RecipientInput({
  label, value, onChange, contacts, excludeEmails,
}: {
  label: string
  value: string[]
  onChange: (v: string[]) => void
  contacts: Contact[]
  excludeEmails: string[]
}) {
  const [input, setInput] = useState("")
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = contacts.filter(
    c => !value.includes(c.email) && !excludeEmails.includes(c.email) &&
    (c.name.toLowerCase().includes(input.toLowerCase()) ||
     c.email.toLowerCase().includes(input.toLowerCase()))
  ).slice(0, 8)

  const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

  function add(email: string) {
    const e = email.trim().toLowerCase()
    if (e && !value.includes(e)) onChange([...value, e])
    setInput("")
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Enter" || e.key === "," || e.key === " " || e.key === "Tab") && input.trim()) {
      if (isValidEmail(input.trim())) { e.preventDefault(); add(input.trim()) }
    }
    if (e.key === "Backspace" && !input && value.length) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="flex items-start gap-2">
      <span className="text-xs font-semibold text-slate-500 w-8 pt-2.5 shrink-0">{label}</span>
      <div
        className={cn(
          "flex-1 flex flex-wrap gap-1 px-2 py-1.5 border border-slate-200 rounded-lg bg-white min-h-[38px] cursor-text focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent relative"
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map(email => (
          <span key={email} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full text-xs font-medium">
            {contacts.find(c => c.email === email)?.name ?? email}
            <button type="button" onClick={e => { e.stopPropagation(); onChange(value.filter(v => v !== email)) }}>
              <X className="h-2.5 w-2.5 hover:text-red-500" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={value.length === 0 ? "Type email or search contacts…" : ""}
          className="flex-1 min-w-32 text-sm outline-none bg-transparent placeholder:text-slate-400"
        />

        {/* Dropdown */}
        {focused && (input || filtered.length > 0) && (
          <div className="absolute z-50 top-full left-0 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
            {filtered.map(c => (
              <button
                key={c.email}
                type="button"
                onMouseDown={() => add(c.email)}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-sm"
              >
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700 shrink-0">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-slate-800 truncate">{c.name}</p>
                  <p className="text-xs text-slate-400 truncate">{c.email}</p>
                </div>
                <span className={cn("ml-auto text-xs px-1.5 py-0.5 rounded shrink-0",
                  c.type === "patient" ? "bg-green-100 text-green-700" : "bg-purple-100 text-purple-700"
                )}>
                  {c.type === "patient" ? "Patient" : "Provider"}
                </span>
              </button>
            ))}
            {input && isValidEmail(input) && !value.includes(input.toLowerCase()) && (
              <button
                type="button"
                onMouseDown={() => add(input)}
                className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm text-blue-600 flex items-center gap-2 border-t border-slate-100"
              >
                <Send className="h-3.5 w-3.5 shrink-0" />
                Add "{input.trim()}"
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sent email row ─────────────────────────────────────────────────────────────

function SentEmailRow({ email }: { email: SentEmail }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        <div className={cn("w-2 h-2 rounded-full shrink-0", email.success ? "bg-green-500" : "bg-red-500")} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">{email.subject}</p>
          <p className="text-xs text-slate-500 truncate">
            To: {email.to.join(", ")}
            {email.cc.length > 0 && ` · CC: ${email.cc.join(", ")}`}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {format(new Date(email.sentAt), "MMM d, h:mm a")}
          </span>
          <span>{email.sentBy.name ?? email.sentBy.email}</span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/50 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
            <div><span className="font-medium">To:</span> {email.to.join(", ")}</div>
            {email.cc.length > 0 && <div><span className="font-medium">CC:</span> {email.cc.join(", ")}</div>}
            {email.bcc.length > 0 && <div><span className="font-medium">BCC:</span> {email.bcc.join(", ")}</div>}
          </div>
          {email.error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{email.error}</p>
          )}
          <div className="text-sm text-slate-700 whitespace-pre-wrap border border-slate-200 rounded-lg bg-white px-3 py-2">
            {email.body}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DirectEmailComposer({ contacts, sentEmails }: Props) {
  const [to, setTo] = useState<string[]>([])
  const [cc, setCc] = useState<string[]>([])
  const [bcc, setBcc] = useState<string[]>([])
  const [showCcBcc, setShowCcBcc] = useState(false)
  const [fromSender, setFromSender] = useState("referrals")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  const allSelected = [...to, ...cc, ...bcc]

  function handleSend() {
    setError(null)
    setSuccess(false)
    startTransition(async () => {
      const result = await sendDirectEmail({ to, cc, bcc, subject, body, sender: fromSender as any })
      if (result.success) {
        setSuccess(true)
        setTo([]); setCc([]); setBcc([]); setSubject(""); setBody("")
        setTimeout(() => setSuccess(false), 4000)
      } else {
        setError(result.error ?? "Failed to send.")
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Composer */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">New Email</h2>
          <button
            onClick={() => setShowCcBcc(v => !v)}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            {showCcBcc ? "Hide CC/BCC" : "Add CC/BCC"}
          </button>
        </div>

        <div className="divide-y divide-slate-100">
          <div className="px-4 py-2">
            <RecipientInput label="To" value={to} onChange={setTo} contacts={contacts} excludeEmails={[...cc, ...bcc]} />
          </div>

          {showCcBcc && (
            <>
              <div className="px-4 py-2">
                <RecipientInput label="CC" value={cc} onChange={setCc} contacts={contacts} excludeEmails={[...to, ...bcc]} />
              </div>
              <div className="px-4 py-2">
                <RecipientInput label="BCC" value={bcc} onChange={setBcc} contacts={contacts} excludeEmails={[...to, ...cc]} />
              </div>
            </>
          )}

          <div className="px-4 py-2 flex items-center gap-2 bg-slate-50">
            <span className="text-xs font-medium text-slate-500 w-10 shrink-0">From</span>
            <select value={fromSender} onChange={e => setFromSender(e.target.value)}
              className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:border-slate-400">
              <option value="referrals">Referrals@genesisortho.com</option>
              <option value="surgery">surgery@genesisortho.com</option>
              <option value="tpl">tpl@genesisortho.com</option>
            </select>
          </div>

          <div className="px-4 py-2">
            <Input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Subject"
              className="border-0 shadow-none px-0 text-sm focus-visible:ring-0 placeholder:text-slate-400"
            />
          </div>

          <div className="px-4 py-2">
            <Textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Write your message…"
              rows={8}
              className="border-0 shadow-none px-0 text-sm focus-visible:ring-0 resize-none placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {error && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />{error}
              </p>
            )}
            {success && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />Email sent!
              </p>
            )}
          </div>
          <Button onClick={handleSend} disabled={isPending || to.length === 0} size="sm">
            {isPending ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-2" />}
            Send
          </Button>
        </div>
      </div>

      {/* Sent history */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-700">Sent Emails</h3>
        {sentEmails.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl">
            No emails sent yet.
          </div>
        ) : (
          sentEmails.map(e => <SentEmailRow key={e.id} email={e} />)
        )}
      </div>
    </div>
  )
}
