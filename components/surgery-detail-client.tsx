"use client"

import StyledSelect from "@/components/ui/styled-select"
import { useState, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import { Phone, Trash2, Upload, FileText, X, Loader2, Check } from "lucide-react"
import { updateSurgeryCase, addSurgeryCallAttempt, deleteSurgeryCallAttempt, deleteSurgeryDocument } from "@/app/actions/surgery"
import { SURGERY_STATUS_LABELS } from "@/lib/surgery-constants"
import { PROCEDURE_DATA, findProcedureLocation, DME_OPTIONS, REFERRAL_PRESETS, toOptions } from "@/lib/surgery-procedures"
import { LANGUAGE_OPTIONS } from "@/lib/automation-properties"
import { clinicDatetimeLocalValue, clinicDatetimeLocalToISO } from "@/lib/tz"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

const MAX_CALLS = 4

const STATUS_OPTIONS = ["NEW", "PENDING_CLEARANCE", "PENDING_CONFIRMATION", "SCHEDULED", "CANCELED", "COMPLETED"]
const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-zinc-100 text-zinc-700 border-zinc-200",
  SCHEDULED: "bg-blue-100 text-blue-700 border-blue-200",
  PENDING_CONFIRMATION: "bg-amber-100 text-amber-700 border-amber-200",
  PENDING_CLEARANCE: "bg-orange-100 text-orange-700 border-orange-200",
  CANCELED: "bg-red-100 text-red-700 border-red-200",
  COMPLETED: "bg-green-100 text-green-700 border-green-200",
}

const OUTCOME_LABELS: Record<string, { label: string; color: string }> = {
  NO_ANSWER: { label: "No Answer", color: "text-slate-500" },
  VOICEMAIL: { label: "Voicemail", color: "text-amber-600" },
  ANSWERED: { label: "Answered", color: "text-green-600" },
}

function ProcedureField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const init = findProcedureLocation(value)
  const [provider, setProvider] = useState(init.provider)
  const [bodyPart, setBodyPart] = useState(init.bodyPart)

  const fieldClass = "h-9 px-3 rounded-lg border border-zinc-200 text-sm text-slate-800 bg-white focus:outline-none focus:border-zinc-400 transition-colors w-full"

  function handleProviderChange(p: string) {
    setProvider(p)
    setBodyPart("")
    onChange("")
  }

  function handleBodyPartChange(bp: string) {
    setBodyPart(bp)
    onChange("")
  }

  const bodyParts = provider ? Object.keys(PROCEDURE_DATA[provider] ?? {}) : []
  const procedures = provider && bodyPart ? (PROCEDURE_DATA[provider]?.[bodyPart] ?? []) : []

  return (
    <div className="flex flex-col gap-1 sm:col-span-3">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Procedure</label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StyledSelect value={provider} onChange={(e) => handleProviderChange(e.target.value)} className={fieldClass}>
          <option value="">— Select provider —</option>
          {Object.keys(PROCEDURE_DATA).map((p) => <option key={p} value={p}>{p}</option>)}
        </StyledSelect>
        <StyledSelect value={bodyPart} onChange={(e) => handleBodyPartChange(e.target.value)} disabled={!provider} className={fieldClass}>
          <option value="">— Select body part —</option>
          {bodyParts.map((bp) => <option key={bp} value={bp}>{bp}</option>)}
        </StyledSelect>
        <StyledSelect value={value} onChange={(e) => onChange(e.target.value)} disabled={!bodyPart} className={fieldClass}>
          <option value="">— Select procedure —</option>
          {procedures.map((p) => <option key={p} value={p}>{p}</option>)}
        </StyledSelect>
      </div>
    </div>
  )
}

function SelectField({
  label, value, options, onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      <StyledSelect
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 px-3 rounded-lg border border-zinc-200 text-sm text-slate-800 bg-white focus:outline-none focus:border-zinc-400 transition-colors"
      >
        <option value="">— Not set —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </StyledSelect>
    </div>
  )
}

function InputField({
  label, value, type = "text", onChange,
}: {
  label: string
  value: string
  type?: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 px-3 rounded-lg border border-zinc-200 text-sm text-slate-800 bg-white focus:outline-none focus:border-zinc-400 transition-colors"
      />
    </div>
  )
}


function ReferralField({
  presets, selectVal, otherVal, onSelectChange, onOtherChange,
}: {
  presets: string[]
  selectVal: string
  otherVal: string
  onSelectChange: (v: string) => void
  onOtherChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Referral Source</label>
      <StyledSelect
        value={selectVal}
        onChange={(e) => onSelectChange(e.target.value)}
        className="h-9 px-3 rounded-lg border border-zinc-200 text-sm text-slate-800 bg-white focus:outline-none focus:border-zinc-400 transition-colors"
      >
        <option value="">— Not set —</option>
        {presets.map((p) => <option key={p} value={p}>{p}</option>)}
        <option value="Other">Other</option>
      </StyledSelect>
      {selectVal === "Other" && (
        <input
          type="text"
          value={otherVal}
          onChange={(e) => onOtherChange(e.target.value)}
          placeholder="Specify source..."
          className="h-9 px-3 rounded-lg border border-zinc-200 text-sm text-slate-800 bg-white focus:outline-none focus:border-zinc-400 transition-colors"
        />
      )}
    </div>
  )
}

export default function SurgeryDetailClient({ surgeryCase }: { surgeryCase: any }) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  // Status
  const [statusPending, startStatus] = useTransition()

  // Manual fields form
  const [saving, startSave] = useTransition()
  const [saved, setSaved] = useState(false)
  const [medicalClearance, setMedicalClearance] = useState((surgeryCase as any).medicalClearance ?? "")
  const [secondaryClearance, setSecondaryClearance] = useState((surgeryCase as any).secondaryClearance ?? "")
  const [dentalClearance, setDentalClearance] = useState((surgeryCase as any).dentalClearance ?? "")
  const [ctRequired, setCtRequired] = useState(surgeryCase.ctRequired ?? "")
  const [glp1, setGlp1] = useState(surgeryCase.glp1 ?? "")
  const [dme, setDme] = useState(surgeryCase.dme ?? "")
  const referralPresets = REFERRAL_PRESETS
  const storedReferral = surgeryCase.referral ?? ""
  const initIsOther = storedReferral !== "" && !referralPresets.includes(storedReferral)
  const [referralSelect, setReferralSelect] = useState(initIsOther ? "Other" : storedReferral)
  const [referralOther, setReferralOther] = useState(initIsOther ? storedReferral : "")
  const facility_ = surgeryCase.facility ?? ""
  const [facility, setFacility] = useState(facility_)
  const [procedure, setProcedure] = useState(surgeryCase.procedure ?? "")
  const [surgeryDate, setSurgeryDate] = useState(
    surgeryCase.surgeryDate ? clinicDatetimeLocalValue(new Date(surgeryCase.surgeryDate)) : ""
  )
  const [language, setLanguage] = useState(surgeryCase.language ?? "EN")
  const [email, setEmail] = useState(surgeryCase.email ?? "")
  const [notes, setNotes] = useState(surgeryCase.notes ?? "")

  const referralValue = referralSelect === "Other" ? referralOther : referralSelect

  // Call tracker
  const [callOutcome, setCallOutcome] = useState("NO_ANSWER")
  const [callNotes, setCallNotes] = useState("")
  const [callPending, startCall] = useTransition()
  const [deletingCallId, setDeletingCallId] = useState<string | null>(null)

  // Documents
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null)

  function handleStatusChange(status: string) {
    startStatus(async () => {
      await updateSurgeryCase(surgeryCase.id, { status })
      router.refresh()
    })
  }

  function handleSave() {
    startSave(async () => {
      await updateSurgeryCase(surgeryCase.id, {
        medicalClearance: medicalClearance || null,
        secondaryClearance: secondaryClearance || null,
        dentalClearance: dentalClearance || null,
        ctRequired: ctRequired || null,
        glp1: glp1 || null,
        dme: dme || null,
        referral: referralValue || null,
        facility: facility || null,
        procedure: procedure || null,
        surgeryDate: clinicDatetimeLocalToISO(surgeryDate),
        language: language || "EN",
        email: email || null,
        notes: notes || null,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      router.refresh()
    })
  }

  function handleLogCall() {
    startCall(async () => {
      await addSurgeryCallAttempt(surgeryCase.id, callOutcome, callNotes)
      setCallNotes("")
      router.refresh()
    })
  }

  function handleDeleteCall(id: string) {
    setDeletingCallId(id)
    startTransition(async () => {
      await deleteSurgeryCallAttempt(id, surgeryCase.id)
      setDeletingCallId(null)
      router.refresh()
    })
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError("")
    setUploading(true)
    const fd = new FormData()
    fd.append("file", file)
    try {
      const res = await fetch(`/api/surgery/${surgeryCase.id}/documents`, { method: "POST", body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Upload failed")
      router.refresh()
    } catch (err: any) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  function handleDeleteDoc(id: string) {
    setDeletingDocId(id)
    startTransition(async () => {
      await deleteSurgeryDocument(id, surgeryCase.id)
      setDeletingDocId(null)
      router.refresh()
    })
  }

  const calls: any[] = surgeryCase.callAttempts ?? []
  const docs: any[] = surgeryCase.documents ?? []
  const canAddCall = calls.length < MAX_CALLS

  return (
    <div className="space-y-6">
      {/* Status */}
      <Card>
        <CardContent className="pt-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Update Status</p>
          <div className="grid grid-cols-3 gap-2">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                disabled={statusPending}
                className={`h-9 rounded-lg text-xs font-medium border transition-all ${
                  surgeryCase.status === s
                    ? STATUS_COLORS[s]
                    : "bg-white text-slate-600 border-zinc-200 hover:border-zinc-400 hover:text-zinc-900"
                }`}
              >
                {SURGERY_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Clinical & Scheduling */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Clinical & Scheduling</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SelectField
              label="Medical Clearance"
              value={medicalClearance}
              onChange={setMedicalClearance}
              options={[
                { value: "Not required", label: "Not required" },
                { value: "Arrangements to be made", label: "Arrangements to be made" },
                { value: "Scheduled", label: "Scheduled" },
                { value: "Awaiting clearance documents", label: "Awaiting clearance documents" },
                { value: "Completed, on file", label: "Completed, on file" },
              ]}
            />
            <SelectField
              label="Secondary Clearance"
              value={secondaryClearance}
              onChange={setSecondaryClearance}
              options={[
                { value: "Not required", label: "Not required" },
                { value: "Arrangements to be made", label: "Arrangements to be made" },
                { value: "Scheduled", label: "Scheduled" },
                { value: "Awaiting clearance documents", label: "Awaiting clearance documents" },
                { value: "Completed, on file", label: "Completed, on file" },
              ]}
            />
            <SelectField
              label="Dental Clearance"
              value={dentalClearance}
              onChange={setDentalClearance}
              options={[
                { value: "Not required", label: "Not required" },
                { value: "Arrangements to be made", label: "Arrangements to be made" },
                { value: "Scheduled", label: "Scheduled" },
                { value: "Awaiting clearance documents", label: "Awaiting clearance documents" },
                { value: "Treatment required", label: "Treatment required" },
                { value: "Completed, on file", label: "Completed, on file" },
              ]}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField
              label="CT Required"
              value={ctRequired}
              onChange={setCtRequired}
              options={[
                { value: "Yes", label: "Yes" },
                { value: "No", label: "No" },
                { value: "Received", label: "Received" },
              ]}
            />
            <SelectField
              label="GLP-1"
              value={glp1}
              onChange={setGlp1}
              options={[
                { value: "Yes", label: "Yes" },
                { value: "No", label: "No" },
              ]}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SelectField
              label="DME"
              value={dme}
              onChange={setDme}
              options={toOptions(DME_OPTIONS)}
            />
            <ReferralField
              presets={referralPresets}
              selectVal={referralSelect}
              otherVal={referralOther}
              onSelectChange={setReferralSelect}
              onOtherChange={setReferralOther}
            />
            <SelectField
              label="Facility"
              value={facility}
              onChange={setFacility}
              options={[
                { value: "Glen Oaks Hospital",                          label: "Glen Oaks Hospital" },
                { value: "Humboldt Park Hospital",                      label: "Humboldt Park Hospital" },
                { value: "Mercy Aurora Hospital",                       label: "Mercy Aurora Hospital" },
                { value: "Good Samaritan Hospital",                     label: "Good Samaritan Hospital" },
                { value: "Oak Brook Surgical Center",                   label: "Oak Brook Surgical Center" },
                { value: "Aiden Center For Day Surgery",                label: "Aiden Center For Day Surgery" },
                { value: "Fullerton-Kimball Medical & Surgical Center", label: "Fullerton-Kimball Medical & Surgical Center" },
                { value: "Illinois Masonic Hospital",                   label: "Illinois Masonic Hospital" },
              ]}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <ProcedureField value={procedure} onChange={setProcedure} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <InputField label="Surgery Date & Time" value={surgeryDate} type="datetime-local" onChange={setSurgeryDate} />
            <SelectField label="Language" value={language} options={LANGUAGE_OPTIONS} onChange={setLanguage} />
            <InputField label="Patient Email" value={email} type="email" onChange={setEmail} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="px-3 py-2 rounded-lg border border-zinc-200 text-sm text-slate-800 bg-white focus:outline-none focus:border-zinc-400 transition-colors resize-none"
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} size="sm" className="min-w-[80px]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <><Check className="h-4 w-4 mr-1" />Saved</> : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Call Attempts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Call Attempts ({calls.length}/{MAX_CALLS})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Call slots */}
          <div className="flex gap-2">
            {Array.from({ length: MAX_CALLS }).map((_, i) => {
              const call = calls[i]
              return (
                <div
                  key={i}
                  className={`flex-1 h-10 rounded-lg border flex items-center justify-center text-xs font-medium ${
                    call ? "bg-zinc-900 text-white border-zinc-900" : "bg-white border-zinc-200 text-slate-300"
                  }`}
                >
                  {call ? (
                    <span className={OUTCOME_LABELS[call.outcome]?.color ?? "text-white"}>
                      {OUTCOME_LABELS[call.outcome]?.label ?? call.outcome}
                    </span>
                  ) : (
                    `Call ${i + 1}`
                  )}
                </div>
              )
            })}
          </div>

          {/* Log a call */}
          {canAddCall && (
            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Log Call {calls.length + 1}</p>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(OUTCOME_LABELS).map(([key, { label }]) => (
                  <button
                    key={key}
                    onClick={() => setCallOutcome(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      callOutcome === key
                        ? "bg-zinc-900 text-white border-zinc-900"
                        : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <textarea
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                placeholder="Notes (optional)..."
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:border-zinc-400 resize-none bg-white"
              />
              <Button onClick={handleLogCall} disabled={callPending} size="sm">
                {callPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Phone className="h-4 w-4 mr-1.5" />}
                Log Call
              </Button>
            </div>
          )}

          {/* Call log */}
          {calls.length > 0 && (
            <div className="divide-y divide-slate-100">
              {calls.map((call: any, i: number) => (
                <div key={call.id} className="flex items-start justify-between py-3 gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="shrink-0 w-6 h-6 rounded-full bg-zinc-900 text-white text-xs flex items-center justify-center font-medium mt-0.5">
                      {i + 1}
                    </div>
                    <div>
                      <span className={`text-sm font-medium ${OUTCOME_LABELS[call.outcome]?.color ?? "text-slate-700"}`}>
                        {OUTCOME_LABELS[call.outcome]?.label ?? call.outcome}
                      </span>
                      {call.notes && <p className="text-xs text-slate-500 mt-0.5">{call.notes}</p>}
                      <p className="text-xs text-slate-400 mt-0.5">
                        {new Date(call.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        {call.calledBy && ` · ${call.calledBy.name ?? call.calledBy.email}`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteCall(call.id)}
                    disabled={deletingCallId === call.id}
                    className="shrink-0 p-1.5 rounded-lg text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documents */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Documents</CardTitle>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
              className="hidden"
              onChange={handleFileUpload}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Upload className="h-4 w-4 mr-1.5" />}
              Upload
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {uploadError && (
            <p className="text-sm text-red-600 mb-3">{uploadError}</p>
          )}
          {docs.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No documents uploaded.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {docs.map((doc: any) => (
                <li key={doc.id} className="flex items-center justify-between py-3 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <a
                        href={doc.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-slate-800 hover:text-blue-600 truncate block transition-colors"
                      >
                        {doc.fileName}
                      </a>
                      <p className="text-xs text-slate-400">
                        {new Date(doc.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        {doc.fileSize && ` · ${(doc.fileSize / 1024).toFixed(0)} KB`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteDoc(doc.id)}
                    disabled={deletingDocId === doc.id}
                    className="shrink-0 p-1.5 rounded-lg text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-all"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
