"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PhoneInput } from "@/components/ui/phone-input"
import { CheckCircle2, Loader2 } from "lucide-react"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        <span className="text-red-500 ml-0.5">*</span>
      </Label>
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide border-b border-slate-200 pb-2 mb-4">
      {children}
    </h2>
  )
}

export default function PublicReferralForm() {
  const [providerName, setProviderName] = useState("")
  const [providerOrg, setProviderOrg] = useState("")
  const [providerNpi, setProviderNpi] = useState("")
  const [providerEmail, setProviderEmail] = useState("")
  const [patientFirstName, setPatientFirstName] = useState("")
  const [patientLastName, setPatientLastName] = useState("")
  const [patientDob, setPatientDob] = useState("")
  const [patientPhone, setPatientPhone] = useState("")
  const [reason, setReason] = useState("")

  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!providerName || !providerOrg || !providerNpi || !providerEmail ||
        !patientFirstName || !patientLastName || !patientDob || !patientPhone || !reason) return

    setStatus("submitting")
    setErrorMsg("")

    try {
      const res = await fetch("/api/public/referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerName,
          providerOrg,
          providerNpi,
          providerEmail,
          patientFirstName,
          patientLastName,
          patientDob,
          patientPhone,
          reason,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Submission failed")
      }

      setStatus("success")
    } catch (err) {
      setStatus("error")
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    }
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
        <CheckCircle2 className="h-14 w-14 text-green-500" />
        <h2 className="text-xl font-semibold text-slate-900">Referral Submitted</h2>
        <p className="text-slate-500 max-w-sm">
          Thank you. Our team has received the referral and will reach out to the patient shortly.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        {/* Provider Info */}
        <section className="space-y-4">
          <SectionTitle>Referring Provider Information</SectionTitle>
          <Field label="Full Name">
            <Input
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
              placeholder="Dr. Jane Smith"
              required
            />
          </Field>
          <Field label="Organization / Practice Name">
            <Input
              value={providerOrg}
              onChange={(e) => setProviderOrg(e.target.value)}
              placeholder="Downtown Family Medicine"
              required
            />
          </Field>
          <Field label="NPI (National Provider Identifier)">
            <Input
              value={providerNpi}
              onChange={(e) => setProviderNpi(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="1234567890"
              maxLength={10}
              required
            />
          </Field>
          <Field label="Email Address">
            <Input
              type="email"
              value={providerEmail}
              onChange={(e) => setProviderEmail(e.target.value)}
              placeholder="dr.smith@clinic.com"
              required
            />
          </Field>
        </section>

        {/* Patient Info */}
        <section className="space-y-4">
          <SectionTitle>Patient Information</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First Name">
              <Input
                value={patientFirstName}
                onChange={(e) => setPatientFirstName(e.target.value)}
                placeholder="Jane"
                required
              />
            </Field>
            <Field label="Last Name">
              <Input
                value={patientLastName}
                onChange={(e) => setPatientLastName(e.target.value)}
                placeholder="Doe"
                required
              />
            </Field>
          </div>
          <Field label="Date of Birth">
            <Input
              type="date"
              value={patientDob}
              onChange={(e) => setPatientDob(e.target.value)}
              required
            />
          </Field>
          <Field label="Phone Number">
            <PhoneInput value={patientPhone} onChange={setPatientPhone} />
          </Field>
          <Field label="Reason for Referral">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe the reason for this referral..."
              rows={5}
              required
            />
          </Field>
        </section>
      </div>

      {status === "error" && (
        <p className="text-sm text-red-600">{errorMsg}</p>
      )}

      <Button type="submit" className="w-full" disabled={status === "submitting"}>
        {status === "submitting" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Submit Referral
      </Button>
    </form>
  )
}
