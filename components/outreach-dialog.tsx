"use client"

import { useState } from "react"
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
import { sendManualOutreach } from "@/app/actions/outreach"

type Channel = "SMS" | "EMAIL" | "BOTH"

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
  const [message, setMessage] = useState("")
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  const canSMS = !!referral.patientPhone
  const canEmail = !!referral.patientEmail

  async function handleSend() {
    if (!message.trim()) return
    setStatus("sending")
    setErrorMsg("")

    const result = await sendManualOutreach(referral.id, channel, message.trim())

    if (result.error) {
      setStatus("error")
      setErrorMsg(result.error)
    } else {
      setStatus("success")
      setTimeout(() => {
        setOpen(false)
        setStatus("idle")
        setMessage("")
      }, 1500)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Mail className="h-4 w-4 mr-1.5" />
          Send Message
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
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
                <Button
                  type="button"
                  size="sm"
                  variant={channel === "SMS" ? "default" : "outline"}
                  onClick={() => setChannel("SMS")}
                >
                  SMS
                </Button>
              )}
              {canEmail && (
                <Button
                  type="button"
                  size="sm"
                  variant={channel === "EMAIL" ? "default" : "outline"}
                  onClick={() => setChannel("EMAIL")}
                >
                  Email
                </Button>
              )}
              {canSMS && canEmail && (
                <Button
                  type="button"
                  size="sm"
                  variant={channel === "BOTH" ? "default" : "outline"}
                  onClick={() => setChannel("BOTH")}
                >
                  Both
                </Button>
              )}
            </div>
          </div>

          {/* Message */}
          <div>
            <Label htmlFor="message" className="mb-2 block">
              Message
              {channel === "SMS" || channel === "BOTH" ? (
                <span className="text-slate-400 font-normal ml-1">
                  (SMS: avoid PHI — no diagnoses or insurance info)
                </span>
              ) : null}
            </Label>
            <Textarea
              id="message"
              rows={4}
              placeholder="Type your message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={status === "sending" || status === "success"}
            />
          </div>

          {/* Status feedback */}
          {status === "error" && (
            <p className="text-sm text-red-600">{errorMsg}</p>
          )}
          {status === "success" && (
            <p className="text-sm text-green-600">Message sent successfully.</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={status === "sending"}
            >
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
