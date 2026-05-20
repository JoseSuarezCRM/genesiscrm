"use client"

import { useState, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import { Phone, Trash2, Upload, FileText, X, Loader2, Check } from "lucide-react"
import { updateSurgeryCase, addSurgeryCallAttempt, deleteSurgeryCallAttempt, deleteSurgeryDocument } from "@/app/actions/surgery"
import { SURGERY_STATUS_LABELS } from "@/lib/surgery-constants"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

const MAX_CALLS = 4

const STATUS_OPTIONS = ["NEW", "SCHEDULED", "PENDING_CONFIRMATION", "PENDING_CLEARANCE", "CANCELED", "COMPLETED"]
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
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 px-3 rounded-lg border border-zinc-200 text-sm text-slate-800 bg-white focus:outline-none focus:border-zinc-400 transition-colors"
      >
        <option value="">— Not set —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
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

export default function SurgeryDetailClient({ surgeryCase }: { surgeryCase: any }) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  // Status
  const [statusPending, startStatus] = useTransition()

  // Manual fields form
  const [saving, startSave] = useTransition()
  const [saved, setSaved] = useState(false)
  const [clearanceRequired, setClearanceRequired] = useState(surgeryCase.clearanceRequired ?? "")
  const [ctRequired, setCtRequired] = useState(surgeryCase.ctRequired ?? "")
  const [glp1, setGlp1] = useState(surgeryCase.glp1 ?? "")
  const [facility, setFacility] = useState(surgeryCase.facility ?? "")
  const [procedure, setProcedure] = useState(surgeryCase.procedure ?? "")
  const [surgeryDate, setSurgeryDate] = useState(
    surgeryCase.surgeryDate ? new Date(surgeryCase.surgeryDate).toISOString().slice(0, 10) : ""
  )
  const [email, setEmail] = useState(surgeryCase.email ?? "")
  const [notes, setNotes] = useState(surgeryCase.notes ?? "")

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
        clearanceRequired: clearanceRequired || null,
        ctRequired: ctRequired || null,
        glp1: glp1 || null,
        facility: facility || null,
        procedure: procedure || null,
        surgeryDate: surgeryDate || null,
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
              label="Clearance Required"
              value={clearanceRequired}
              onChange={setClearanceRequired}
              options={[
                { value: "Not Required", label: "Not Required" },
                { value: "Medical Clearance", label: "Medical Clearance" },
                { value: "Secondary Clearance", label: "Secondary Clearance" },
                { value: "Dental Clearance", label: "Dental Clearance" },
              ]}
            />
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
              label="Facility"
              value={facility}
              onChange={setFacility}
              options={[
                { value: "Glen Oaks Hospital",                        label: "Glen Oaks Hospital" },
                { value: "Humboldt Park Hospital",                    label: "Humboldt Park Hospital" },
                { value: "Mercy Aurora Hospital",                     label: "Mercy Aurora Hospital" },
                { value: "Good Samaritan Hospital",                   label: "Good Samaritan Hospital" },
                { value: "Oak Brook Surgical Center",                 label: "Oak Brook Surgical Center" },
                { value: "Aiden Center For Day Surgery",              label: "Aiden Center For Day Surgery" },
                { value: "Fullerton-Kimball Medical & Surgical Center", label: "Fullerton-Kimball Medical & Surgical Center" },
                { value: "Illinois Masonic Hospital",                 label: "Illinois Masonic Hospital" },
              ]}
            />
            <InputField label="Procedure" value={procedure} onChange={setProcedure} />
            <InputField label="Surgery Date" value={surgeryDate} type="date" onChange={setSurgeryDate} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
