"use client"

import StyledSelect from "@/components/ui/styled-select"
import { useState, useTransition } from "react"
import { Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { RichTextEditor } from "@/components/rich-text-editor"
import { EmailAttachments, type AttachmentRef } from "@/components/email-attachments"

// Patient-context fields available when emailing a referral's patient.
const OUTREACH_TOKENS = [
  { label: "First name", value: "{{firstName}}" },
  { label: "Last name", value: "{{lastName}}" },
  { label: "Full name", value: "{{fullName}}" },
  { label: "Appointment date", value: "{{appointmentDate}}" },
  { label: "Insurance", value: "{{insurance}}" },
  { label: "Referring practice", value: "{{practiceName}}" },
  { label: "Referring provider", value: "{{providerName}}" },
]
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { sendManualOutreach } from "@/app/actions/outreach"
import { getEmailTemplates } from "@/app/actions/outreach-templates"
import { getMessageTemplates } from "@/app/actions/message-templates"

import { OutreachTrigger } from "@prisma/client"

type Channel = "SMS" | "EMAIL" | "BOTH"

type EmailTemplate = {
  id: string
  trigger: OutreachTrigger
  subject: string | null
  body: string
}

const TRIGGER_LABELS: Record<OutreachTrigger, string> = {
  MANUAL: "Manual Message",
  STATUS_SCHEDULED: "Appointment Scheduled",
  STATUS_COMPLETED: "Visit Completed",
  REMINDER_24HR: "24hr Reminder",
}

interface Props {
  referral: {
    id: string
    patientFirstName: string
    patientLastName: string
    patientPhone: string | null
    patientEmail: string | null
  }
}

export default function OutreachDialog({ referral }: Props) {
  const [open, setOpen] = useState(false)
  const [channel, setChannel] = useState<Channel>(
    referral.patientPhone ? "SMS" : "EMAIL"
  )
  const [fromSender, setFromSender] = useState("referrals")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [attachments, setAttachments] = useState<AttachmentRef[]>([])
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([])
  const [smsTemplates, setSmsTemplates] = useState<{ id: string; name: string; body: string }[]>([])
  const [templatesLoaded, setTemplatesLoaded] = useState(false)
  const [, startLoadTransition] = useTransition()

  const canSMS = !!referral.patientPhone
  const canEmail = !!referral.patientEmail
  const showEmailFields = channel === "EMAIL" || channel === "BOTH"

  function handleOpen(isOpen: boolean) {
    setOpen(isOpen)
    if (isOpen && !templatesLoaded) {
      startLoadTransition(async () => {
        try {
          const [emailTpls, smsTpls] = await Promise.all([
            getEmailTemplates(),
            getMessageTemplates("SMS"),
          ])
          setEmailTemplates(emailTpls)
          setSmsTemplates(smsTpls.map((t: any) => ({ id: t.id, name: t.name, body: t.body })))
          setTemplatesLoaded(true)
        } catch {
          // Non-fatal — dialog still works without templates
        }
      })
    }
    if (!isOpen) {
      setStatus("idle")
      setMessage("")
      setSubject("")
      setAttachments([])
      setErrorMsg("")
    }
  }

  function applyTemplate(templateId: string) {
    const t = emailTemplates.find((e) => e.id === templateId)
    if (!t) return
    setSubject(t.subject ?? "")
    setMessage(t.body)
  }

  function applySmsTemplate(templateId: string) {
    const t = smsTemplates.find((e) => e.id === templateId)
    if (!t) return
    // Keep the template's tokens as authored ({patient_first_name}, …); the server
    // resolves them on send.
    setMessage(t.body)
  }

  async function handleSend() {
    if (!message.trim()) return
    setStatus("sending")
    setErrorMsg("")

    const result = await sendManualOutreach(
      referral.id,
      channel,
      message.trim(),
      showEmailFields ? subject.trim() : undefined,
      showEmailFields ? fromSender : undefined,
      showEmailFields ? attachments : undefined
    )

    if (result.error) {
      setStatus("error")
      setErrorMsg(result.error)
    } else {
      setStatus("success")
      setTimeout(() => {
        setOpen(false)
        setStatus("idle")
        setMessage("")
        setSubject("")
      }, 1500)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Mail className="h-4 w-4 mr-1.5" />
          Send Message
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Send Message to {referral.patientFirstName} {referral.patientLastName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Contact info */}
          <div className="text-sm text-slate-500 space-y-0.5">
            {referral.patientPhone && <p>Phone: {referral.patientPhone}</p>}
            {referral.patientEmail && <p>Email: {referral.patientEmail}</p>}
          </div>

          {/* Channel selector */}
          <div>
            <Label className="mb-2 block">Send via</Label>
            <div className="flex gap-2">
              {canSMS && (
                <Button type="button" size="sm"
                  variant={channel === "SMS" ? "default" : "outline"}
                  onClick={() => setChannel("SMS")}>
                  SMS
                </Button>
              )}
              {canEmail && (
                <Button type="button" size="sm"
                  variant={channel === "EMAIL" ? "default" : "outline"}
                  onClick={() => setChannel("EMAIL")}>
                  Email
                </Button>
              )}
              {canSMS && canEmail && (
                <Button type="button" size="sm"
                  variant={channel === "BOTH" ? "default" : "outline"}
                  onClick={() => setChannel("BOTH")}>
                  Both
                </Button>
              )}
            </div>
          </div>

          {/* Template selector — email only */}
          {showEmailFields && emailTemplates.length > 0 && (
            <div>
              <Label className="mb-2 block">Load template</Label>
              <Select onValueChange={applyTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a template to pre-fill..." />
                </SelectTrigger>
                <SelectContent>
                  {emailTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {TRIGGER_LABELS[t.trigger]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* SMS template selector — from the Communications SMS templates */}
          {(channel === "SMS" || channel === "BOTH") && smsTemplates.length > 0 && (
            <div>
              <Label className="mb-2 block">Load SMS template</Label>
              <Select onValueChange={applySmsTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a template to pre-fill..." />
                </SelectTrigger>
                <SelectContent>
                  {smsTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* From — email only */}
          {showEmailFields && (
            <div>
              <Label className="mb-2 block">From</Label>
              <StyledSelect value={fromSender} onChange={(e) => setFromSender(e.target.value)} disabled={status === "sending" || status === "success"}
                className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <option value="referrals">Referrals@genesisortho.com</option>
                <option value="surgery">surgery@genesisortho.com</option>
                <option value="tpl">tpl@genesisortho.com</option>
              </StyledSelect>
            </div>
          )}

          {/* Subject — email only */}
          {showEmailFields && (
            <div>
              <Label htmlFor="subject" className="mb-2 block">Subject</Label>
              <Input
                id="subject"
                placeholder="Message from Genesis Ortho"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={status === "sending" || status === "success"}
              />
            </div>
          )}

          {/* Message body */}
          <div>
            <Label htmlFor="message" className="mb-2 block">
              Message
              {(channel === "SMS" || channel === "BOTH") && (
                <span className="text-slate-400 font-normal ml-1">
                  (SMS: avoid PHI — no diagnoses or insurance info)
                </span>
              )}
            </Label>
            {channel === "EMAIL" ? (
              <RichTextEditor value={message} onChange={setMessage} minHeight={140} placeholder="Type your message or load a template above..." tokens={OUTREACH_TOKENS} />
            ) : (
              <Textarea
                id="message"
                rows={6}
                placeholder="Type your message or load a template above..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={status === "sending" || status === "success"}
              />
            )}
          </div>

          {/* Attachments (email only) */}
          {showEmailFields && (
            <div>
              <Label className="mb-2 block">Attachments</Label>
              <EmailAttachments value={attachments} onChange={setAttachments} />
            </div>
          )}

          {/* Status feedback */}
          {status === "error" && (
            <p className="text-sm text-red-600">{errorMsg}</p>
          )}
          {status === "success" && (
            <p className="text-sm text-green-600">Message sent successfully.</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={status === "sending"}>
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={!message.trim() || status === "sending" || status === "success"}
            >
              {status === "sending" ? "Sending..." : "Send"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
