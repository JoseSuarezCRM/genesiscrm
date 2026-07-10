"use client"

import StyledSelect from "@/components/ui/styled-select"
import { useState, useTransition, useEffect } from "react"
import { getMySenders } from "@/app/actions/account"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { RichTextEditor } from "@/components/rich-text-editor"
import { EmailAttachments, type AttachmentRef } from "@/components/email-attachments"
import { PERSONALIZATION_GROUPS } from "@/lib/personalization"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CheckCircle2, Loader2, Users, UserCheck, Eye } from "lucide-react"
import { createBroadcast, previewBroadcastRecipients } from "@/app/actions/broadcasts"
import { OutreachTrigger, ReferralStatus } from "@prisma/client"

const STATUS_LABELS: Record<ReferralStatus, string> = {
  NEW: "New",
  READY_FOR_CALL: "Ready for Call",
  CONTACTED: "Contacted",
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  NO_SHOW: "No Show",
  LOST: "Lost",
}

const TRIGGER_LABELS: Record<OutreachTrigger, string> = {
  MANUAL: "Manual Message",
  STATUS_SCHEDULED: "Appointment Scheduled",
  STATUS_COMPLETED: "Visit Completed",
  REMINDER_24HR: "24hr Reminder",
}

interface Practice {
  id: string
  name: string
  doctors: { id: string; name: string; title: string | null }[]
}

interface EmailTemplate {
  id: string
  trigger: OutreachTrigger
  subject: string | null
  body: string
}

interface Props {
  practices: Practice[]
  insuranceOptions: string[]
  emailTemplates: EmailTemplate[]
}

type RecipientPreview = { email: string; name: string; type: "PATIENT" | "PROVIDER" }

export default function BroadcastComposer({ practices, insuranceOptions, emailTemplates }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Recipient type toggles
  const [includePatients, setIncludePatients] = useState(true)
  const [includeProviders, setIncludeProviders] = useState(false)

  // Patient filters
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [selectedPracticeId, setSelectedPracticeId] = useState("")
  const [selectedProviderId, setSelectedProviderId] = useState("")
  const [selectedInsurance, setSelectedInsurance] = useState("")
  const [apptDateFrom, setApptDateFrom] = useState("")
  const [apptDateTo, setApptDateTo] = useState("")

  // Provider filters
  const [selectedProviderPracticeId, setSelectedProviderPracticeId] = useState("")

  // Compose
  const [fromSender, setFromSender] = useState("")
  const [senders, setSenders] = useState<{ value: string; email: string; label: string }[]>([])
  useEffect(() => {
    getMySenders().then((s) => { setSenders(s); setFromSender((cur) => cur || s[0]?.value || "") }).catch(() => {})
  }, [])
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [attachments, setAttachments] = useState<AttachmentRef[]>([])
  const [scheduledAt, setScheduledAt] = useState("")

  // Preview
  const [preview, setPreview] = useState<RecipientPreview[] | null>(null)
  const [isPreviewing, startPreviewTransition] = useTransition()

  // Result
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const selectedPractice = practices.find((p) => p.id === selectedPracticeId)
  const availableProviders = selectedPractice?.doctors ?? []

  function buildFilters() {
    return {
      recipientTypes: [
        ...(includePatients ? ["PATIENT" as const] : []),
        ...(includeProviders ? ["PROVIDER" as const] : []),
      ],
      patientStatuses: selectedStatuses.length ? selectedStatuses : undefined,
      practiceIds: selectedPracticeId ? [selectedPracticeId] : undefined,
      providerIds: selectedProviderId ? [selectedProviderId] : undefined,
      insuranceProviders: selectedInsurance ? [selectedInsurance] : undefined,
      appointmentDateFrom: apptDateFrom || undefined,
      appointmentDateTo: apptDateTo || undefined,
      providerPracticeIds: selectedProviderPracticeId ? [selectedProviderPracticeId] : undefined,
    }
  }

  function handlePreview() {
    setError(null)
    startPreviewTransition(async () => {
      const filters = buildFilters()
      if (!filters.recipientTypes.length) { setError("Select at least one recipient type"); return }
      const result = await previewBroadcastRecipients(filters)
      setPreview(result)
    })
  }

  function applyTemplate(templateId: string) {
    const t = emailTemplates.find((e) => e.id === templateId)
    if (!t) return
    setSubject(t.subject ?? "")
    setBody(t.body)
  }

  function handleSend() {
    if (!subject.trim() || !body.trim()) { setError("Subject and body are required"); return }
    if (!includePatients && !includeProviders) { setError("Select at least one recipient type"); return }
    setError(null)

    startTransition(async () => {
      const result = await createBroadcast({
        subject,
        body,
        fromSender,
        attachments,
        filters: buildFilters(),
        scheduledAt: scheduledAt || null,
      })
      if (result.error) {
        setError(result.error)
      } else {
        // Trigger actual sending via API route so it runs outside the server action lifecycle
        if (result.sendNow && result.id) {
          await fetch("/api/broadcasts/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ broadcastId: result.id }),
          })
        }
        setSuccess(true)
        setTimeout(() => router.push("/broadcasts"), 1500)
      }
    })
  }

  const patientCount = preview?.filter((r) => r.type === "PATIENT").length ?? 0
  const providerCount = preview?.filter((r) => r.type === "PROVIDER").length ?? 0

  return (
    <div className="space-y-8">

      {/* ── Step 1: Recipients ─────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white p-6 space-y-5">
        <h2 className="font-semibold text-slate-800 text-base">1. Recipients</h2>

        <div className="flex gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={includePatients} onCheckedChange={(v) => setIncludePatients(!!v)} />
            <Users className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-medium">Patients</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={includeProviders} onCheckedChange={(v) => setIncludeProviders(!!v)} />
            <UserCheck className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-medium">Referring Providers</span>
          </label>
        </div>

        {/* Patient filters */}
        {includePatients && (
          <div className="border rounded-lg p-4 space-y-4 bg-slate-50">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Patient Filters</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              <div>
                <Label className="mb-1.5 block text-xs">Appointment Status</Label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(STATUS_LABELS).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setSelectedStatuses((prev) =>
                        prev.includes(val) ? prev.filter((s) => s !== val) : [...prev, val]
                      )}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                        selectedStatuses.includes(val)
                          ? "bg-slate-800 text-white border-slate-800"
                          : "bg-white text-slate-600 border-slate-300 hover:border-slate-400"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="mb-1.5 block text-xs">Referring Practice</Label>
                <Select value={selectedPracticeId || "__all__"} onValueChange={(v) => { setSelectedPracticeId(v === "__all__" ? "" : v); setSelectedProviderId("") }}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All practices" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All practices</SelectItem>
                    {practices.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {selectedPractice && availableProviders.length > 0 && (
                <div>
                  <Label className="mb-1.5 block text-xs">Referring Provider</Label>
                  <Select value={selectedProviderId || "__all__"} onValueChange={(v) => setSelectedProviderId(v === "__all__" ? "" : v)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All providers" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All providers</SelectItem>
                      {availableProviders.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.title ? `${d.title} ${d.name}` : d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label className="mb-1.5 block text-xs">Insurance Provider</Label>
                <Select value={selectedInsurance || "__all__"} onValueChange={(v) => setSelectedInsurance(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All insurance" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All insurance</SelectItem>
                    {insuranceOptions.map((ins) => <SelectItem key={ins} value={ins}>{ins}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="mb-1.5 block text-xs">Appointment Date From</Label>
                <Input type="date" className="h-8 text-sm" value={apptDateFrom} onChange={(e) => setApptDateFrom(e.target.value)} />
              </div>

              <div>
                <Label className="mb-1.5 block text-xs">Appointment Date To</Label>
                <Input type="date" className="h-8 text-sm" value={apptDateTo} onChange={(e) => setApptDateTo(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* Provider filters */}
        {includeProviders && (
          <div className="border rounded-lg p-4 space-y-4 bg-slate-50">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Provider Filters</p>
            <div>
              <Label className="mb-1.5 block text-xs">Practice</Label>
              <Select value={selectedProviderPracticeId || "__all__"} onValueChange={(v) => setSelectedProviderPracticeId(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All practices" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All practices</SelectItem>
                  {practices.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Preview button */}
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={handlePreview} disabled={isPreviewing}>
            {isPreviewing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
            Preview Recipients
          </Button>
          {preview !== null && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span>
                <strong>{preview.length}</strong> recipient{preview.length !== 1 ? "s" : ""} found
                {patientCount > 0 && ` · ${patientCount} patient${patientCount !== 1 ? "s" : ""}`}
                {providerCount > 0 && ` · ${providerCount} provider${providerCount !== 1 ? "s" : ""}`}
              </span>
            </div>
          )}
        </div>

        {/* Recipient list preview */}
        {preview !== null && preview.length > 0 && (
          <div className="max-h-48 overflow-y-auto rounded border bg-white divide-y text-sm">
            {preview.map((r) => (
              <div key={r.email} className="flex items-center justify-between px-3 py-2">
                <span className="font-medium text-slate-700">{r.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-slate-500">{r.email}</span>
                  <Badge variant={r.type === "PATIENT" ? "secondary" : "outline"} className="text-xs">
                    {r.type === "PATIENT" ? "Patient" : "Provider"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
        {preview !== null && preview.length === 0 && (
          <p className="text-sm text-amber-600">No recipients found with the selected filters. Try broadening your criteria.</p>
        )}
      </section>

      {/* ── Step 2: Compose ────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white p-6 space-y-4">
        <h2 className="font-semibold text-slate-800 text-base">2. Compose</h2>

        {emailTemplates.length > 0 && (
          <div>
            <Label className="mb-1.5 block text-sm">Load template</Label>
            <Select onValueChange={applyTemplate}>
              <SelectTrigger className="max-w-sm">
                <SelectValue placeholder="Choose a template to pre-fill..." />
              </SelectTrigger>
              <SelectContent>
                {emailTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{TRIGGER_LABELS[t.trigger]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <Label className="mb-1.5 block text-sm">From *</Label>
          {senders.length === 0 ? (
            <p className="text-xs text-amber-600">No sending address. Enable it in <a href="/settings/account" className="underline">My Account</a>, or ask an admin.</p>
          ) : (
            <StyledSelect value={fromSender} onChange={(e) => setFromSender(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              {senders.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </StyledSelect>
          )}
        </div>
        <div>
          <Label htmlFor="subject" className="mb-1.5 block text-sm">Subject *</Label>
          <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Your upcoming appointment at Genesis Ortho" />
        </div>

        <div>
          <Label htmlFor="body" className="mb-1.5 block text-sm">
            Body *
            <span className="text-slate-400 font-normal ml-2 text-xs">Use {`{{firstName}}`}, {`{{appointmentDate}}`}, {`{{practiceName}}`} as placeholders</span>
          </Label>
          <RichTextEditor value={body} onChange={setBody} minHeight={180} tokenGroups={PERSONALIZATION_GROUPS} />
        </div>

        <div>
          <Label className="mb-1.5 block text-sm">Attachments</Label>
          <EmailAttachments value={attachments} onChange={setAttachments} />
        </div>
      </section>

      {/* ── Step 3: Schedule ───────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white p-6 space-y-4">
        <h2 className="font-semibold text-slate-800 text-base">3. Schedule</h2>
        <div className="flex items-start gap-6">
          <div className="flex-1">
            <Label htmlFor="schedule" className="mb-1.5 block text-sm">
              Send at (optional)
            </Label>
            <Input
              id="schedule"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="max-w-xs"
            />
            <p className="text-xs text-slate-400 mt-1">Leave empty to send immediately after clicking Send.</p>
          </div>
        </div>
      </section>

      {/* ── Error / Success / Send ─────────────────────────────────────── */}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && (
        <p className="text-sm text-green-600 flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4" />
          {scheduledAt ? "Broadcast scheduled successfully." : "Broadcast queued for sending."}
        </p>
      )}

      <div className="flex justify-end gap-3 pb-6">
        <Button type="button" variant="outline" onClick={() => router.push("/broadcasts")}>
          Cancel
        </Button>
        <Button onClick={handleSend} disabled={isPending || success}>
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {scheduledAt ? "Schedule Broadcast" : "Send Now"}
        </Button>
      </div>
    </div>
  )
}
