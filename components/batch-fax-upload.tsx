"use client"

import { useRef, useState } from "react"
import {
  FileText, CheckCircle2, AlertCircle, Loader2,
  X, SkipForward, Plus, Layers, ChevronDown, ChevronUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { createReferral } from "@/app/actions/referrals"
import type { ExtractedReferralData } from "@/app/api/fax/extract/route"

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"]
const MAX_SIZE_MB = 10
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024

type ItemStatus = "pending" | "processing" | "done" | "error" | "created" | "skipped"

interface Location {
  id: string
  name: string
  phone: string | null
  fax: string | null
  address: string | null
}

interface Doctor {
  id: string
  name: string
  specialty: string | null
  locations: { locationId: string }[]
}

interface Practice {
  id: string
  name: string
  locations: Location[]
  doctors: Doctor[]
}

interface QueueItem {
  id: string
  fileName: string
  status: ItemStatus
  data: ExtractedReferralData | null
  error: string | null
  practiceId: string | null
  locationId: string | null
  doctorId: string | null
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function EditableField({
  label,
  value,
  onChange,
  multiline,
  placeholder,
}: {
  label: string
  value: string | null | undefined
  onChange: (v: string) => void
  multiline?: boolean
  placeholder?: string
}) {
  const base =
    "flex-1 text-xs text-slate-800 bg-white border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 placeholder:text-slate-300"
  return (
    <div className="flex gap-2 items-start">
      <span className="text-slate-400 text-xs w-28 flex-shrink-0 mt-1.5 leading-none">{label}</span>
      {multiline ? (
        <textarea
          className={`${base} resize-none min-h-[60px]`}
          value={value ?? ""}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
        />
      ) : (
        <input
          className={base}
          value={value ?? ""}
          placeholder={placeholder ?? "—"}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { id: string; label: string }[]
  placeholder: string
  disabled?: boolean
}) {
  return (
    <div className="flex gap-2 items-center">
      <span className="text-slate-400 text-xs w-28 flex-shrink-0 leading-none">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="flex-1 text-xs text-slate-800 bg-white border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <option value="">{placeholder}</option>
        {options.map(o => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide pt-2 pb-1">
      {children}
    </p>
  )
}

// ── QueueCard ──────────────────────────────────────────────────────────────────

function QueueCard({
  item,
  practices,
  onCreate,
  onEdit,
  onSetIds,
  onSkip,
  onRemove,
}: {
  item: QueueItem
  practices: Practice[]
  onCreate: (item: QueueItem) => void
  onEdit: (patch: Partial<ExtractedReferralData>) => void
  onSetIds: (ids: { practiceId?: string | null; locationId?: string | null; doctorId?: string | null }) => void
  onSkip: () => void
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const d = item.data
  const canCreate = item.status === "done" && !!d?.patientFirstName && !!d?.patientLastName
  const isExpandable = (item.status === "done" || item.status === "created") && !!d

  const selectedPractice = practices.find(p => p.id === item.practiceId) ?? null
  const availableLocations = selectedPractice?.locations ?? []
  const availableDoctors = selectedPractice
    ? selectedPractice.doctors.filter(doc => {
        if (!item.locationId) return true
        return doc.locations.length === 0 || doc.locations.some(dl => dl.locationId === item.locationId)
      })
    : []

  function handlePracticeChange(pid: string) {
    onSetIds({ practiceId: pid || null, locationId: null, doctorId: null })
  }

  function handleLocationChange(lid: string) {
    onSetIds({ locationId: lid || null, doctorId: null })
  }

  function handleDoctorChange(did: string) {
    onSetIds({ doctorId: did || null })
  }

  const field = (key: keyof ExtractedReferralData) => (v: string) =>
    onEdit({ [key]: v.trim() === "" ? null : v })

  // Determine display name for the linked practice/doctor in the summary
  const linkedPracticeName = selectedPractice?.name
  const linkedDoctorName = selectedPractice?.doctors.find(d => d.id === item.doctorId)?.name

  return (
    <div
      className={`rounded-lg border transition-colors ${
        item.status === "created"
          ? "border-green-200 bg-green-50"
          : item.status === "skipped"
          ? "border-slate-200 bg-slate-50 opacity-50"
          : item.status === "error"
          ? "border-red-200 bg-red-50"
          : "border-slate-200 bg-white"
      }`}
    >
      {/* Main row */}
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 flex-shrink-0">
          {(item.status === "pending" || (item.status === "processing" && !item.data)) && (
            <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
          )}
          {item.status === "done" && <FileText className="h-4 w-4 text-slate-500" />}
          {item.status === "created" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
          {item.status === "error" && <AlertCircle className="h-4 w-4 text-red-500" />}
          {item.status === "skipped" && <SkipForward className="h-4 w-4 text-slate-400" />}
          {item.status === "processing" && item.data && (
            <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 truncate mb-0.5">{item.fileName}</p>
          {item.status === "pending" && <p className="text-sm text-slate-500">Queued…</p>}
          {item.status === "processing" && !item.data && (
            <p className="text-sm text-slate-500">Extracting referral data…</p>
          )}
          {item.status === "processing" && item.data && (
            <p className="text-sm text-slate-500">Creating referral…</p>
          )}
          {(item.status === "done" || item.status === "created") && d && (
            <div className="space-y-0.5">
              {d.patientFirstName && d.patientLastName ? (
                <p className="text-sm font-medium text-slate-800">
                  {d.patientFirstName} {d.patientLastName}
                </p>
              ) : (
                <p className="text-xs text-amber-600 font-medium">Patient name not found — expand to fill in</p>
              )}
              {d.patientDob && <p className="text-xs text-slate-500">DOB: {d.patientDob}</p>}
              {/* Show linked name if resolved, otherwise extracted text */}
              {(linkedPracticeName ?? d.referringOrg) && (
                <p className="text-xs text-slate-500">
                  From: {linkedPracticeName ?? d.referringOrg}
                  {linkedPracticeName && <span className="ml-1 text-green-600 font-medium">✓ linked</span>}
                </p>
              )}
              {(linkedDoctorName ?? d.referringDoctorName) && (
                <p className="text-xs text-slate-500">
                  Provider: {linkedDoctorName ?? d.referringDoctorName}
                  {linkedDoctorName && <span className="ml-1 text-green-600 font-medium">✓ linked</span>}
                </p>
              )}
              {item.status === "created" && (
                <p className="text-xs font-medium text-green-700 mt-0.5">Referral created</p>
              )}
            </div>
          )}
          {item.status === "error" && (
            <p className="text-sm text-red-600">{item.error}</p>
          )}
          {item.status === "skipped" && (
            <p className="text-sm text-slate-400">Skipped</p>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {isExpandable && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="h-7 w-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              title={expanded ? "Collapse" : "Edit / link details"}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
          {item.status === "done" && (
            <>
              {canCreate && (
                <Button size="sm" onClick={() => onCreate(item)} className="h-7 text-xs px-2">
                  Create
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={onSkip}
                className="h-7 text-xs px-2 text-slate-400 hover:text-slate-600"
              >
                Skip
              </Button>
            </>
          )}
          {(item.status === "error" || item.status === "skipped") && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onRemove}
              className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Expanded editable panel */}
      {isExpandable && expanded && d && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-2">

          {/* ── Patient ── */}
          <SectionLabel>Patient</SectionLabel>
          <EditableField label="First name" value={d.patientFirstName} onChange={field("patientFirstName")} placeholder="First name" />
          <EditableField label="Last name" value={d.patientLastName} onChange={field("patientLastName")} placeholder="Last name" />
          <EditableField label="Date of birth" value={d.patientDob} onChange={field("patientDob")} placeholder="YYYY-MM-DD" />
          <EditableField label="Phone" value={d.patientPhone} onChange={field("patientPhone")} placeholder="(555) 555-5555" />
          <EditableField label="Email" value={d.patientEmail} onChange={field("patientEmail")} placeholder="patient@email.com" />
          <EditableField label="MRN" value={d.patientMrn} onChange={field("patientMrn")} placeholder="Chart number" />

          {/* ── Referring Provider — free text (from extraction) ── */}
          <SectionLabel>Extracted Text</SectionLabel>
          <EditableField label="Organization" value={d.referringOrg} onChange={field("referringOrg")} placeholder="Practice name" />
          <EditableField label="Doctor" value={d.referringDoctorName} onChange={field("referringDoctorName")} placeholder="Provider name" />
          <EditableField label="Title / Credentials" value={d.referringDoctorTitle} onChange={field("referringDoctorTitle")} placeholder="MD, DO, PA-C…" />
          <EditableField label="NPI" value={d.referringNpi} onChange={field("referringNpi")} placeholder="10-digit NPI" />
          <EditableField label="Phone" value={d.referringPhone} onChange={field("referringPhone")} placeholder="(555) 555-5555" />
          <EditableField label="Fax" value={d.referringFax} onChange={field("referringFax")} placeholder="(555) 555-5555" />
          <EditableField label="Address" value={d.referringAddress} onChange={field("referringAddress")} placeholder="Street, City, State ZIP" />

          {/* ── Link to existing record (overrides free text on create) ── */}
          <SectionLabel>Link to Existing Record</SectionLabel>
          <p className="text-xs text-slate-400 -mt-1 mb-1">
            Select below to link to an existing org/location/provider. These take priority over the extracted text above.
          </p>
          <SelectField
            label="Organization"
            value={item.practiceId ?? ""}
            onChange={handlePracticeChange}
            placeholder="— match or create from text —"
            options={practices.map(p => ({ id: p.id, label: p.name }))}
          />
          <SelectField
            label="Location"
            value={item.locationId ?? ""}
            onChange={handleLocationChange}
            placeholder={item.practiceId ? "— any location —" : "— select org first —"}
            disabled={!item.practiceId}
            options={availableLocations.map(l => ({ id: l.id, label: l.name }))}
          />
          <SelectField
            label="Provider"
            value={item.doctorId ?? ""}
            onChange={handleDoctorChange}
            placeholder={item.practiceId ? "— any provider —" : "— select org first —"}
            disabled={!item.practiceId}
            options={availableDoctors.map(d => ({ id: d.id, label: d.name }))}
          />

          {/* ── Insurance ── */}
          <SectionLabel>Insurance</SectionLabel>
          <EditableField label="Provider" value={d.insuranceProvider} onChange={field("insuranceProvider")} placeholder="Insurance name" />
          <EditableField label="Member ID" value={d.insuranceMemberId} onChange={field("insuranceMemberId")} placeholder="Member ID" />

          {/* ── Notes ── */}
          <SectionLabel>Notes</SectionLabel>
          <EditableField label="Notes" value={d.notes} onChange={field("notes")} multiline placeholder="Reason for referral, chief complaint…" />

          {item.status === "done" && (
            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                onClick={() => onCreate(item)}
                disabled={!d.patientFirstName || !d.patientLastName}
                className="text-xs"
              >
                Create Referral
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── BatchFaxUpload ─────────────────────────────────────────────────────────────

interface BatchFaxUploadProps {
  practices: Practice[]
}

export default function BatchFaxUpload({ practices }: BatchFaxUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const filesRef = useRef<Map<string, File>>(new Map())
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [creatingAll, setCreatingAll] = useState(false)

  function updateItem(id: string, patch: Partial<QueueItem>) {
    setQueue(prev => prev.map(item => (item.id === id ? { ...item, ...patch } : item)))
  }

  function handleEdit(id: string, patch: Partial<ExtractedReferralData>) {
    setQueue(prev =>
      prev.map(item =>
        item.id === id && item.data ? { ...item, data: { ...item.data, ...patch } } : item,
      ),
    )
  }

  function handleSetIds(
    id: string,
    ids: { practiceId?: string | null; locationId?: string | null; doctorId?: string | null },
  ) {
    setQueue(prev =>
      prev.map(item =>
        item.id === id
          ? {
              ...item,
              practiceId: "practiceId" in ids ? (ids.practiceId ?? null) : item.practiceId,
              locationId: "locationId" in ids ? (ids.locationId ?? null) : item.locationId,
              doctorId: "doctorId" in ids ? (ids.doctorId ?? null) : item.doctorId,
            }
          : item,
      ),
    )
  }

  async function processFile(id: string) {
    const file = filesRef.current.get(id)
    if (!file) return
    updateItem(id, { status: "processing" })
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/fax/extract", { method: "POST", body: fd })
      const json = await res.json()
      if (!res.ok) {
        updateItem(id, { status: "error", error: json.error ?? "Extraction failed" })
        return
      }
      updateItem(id, { status: "done", data: json as ExtractedReferralData })
    } catch {
      updateItem(id, { status: "error", error: "Network error. Please try again." })
    }
  }

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files)
    const valid: Array<{ id: string; file: File }> = []

    for (const f of arr) {
      if (!ALLOWED_TYPES.includes(f.type) || f.size > MAX_SIZE_BYTES) continue
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      filesRef.current.set(id, f)
      valid.push({ id, file: f })
    }

    if (!valid.length) return

    setQueue(prev => [
      ...prev,
      ...valid.map(({ id, file }) => ({
        id,
        fileName: file.name,
        status: "pending" as ItemStatus,
        data: null,
        error: null,
        practiceId: null,
        locationId: null,
        doctorId: null,
      })),
    ])

    valid.forEach(({ id }) => processFile(id))
  }

  async function handleCreateItem(item: QueueItem) {
    const d = item.data
    if (!d?.patientFirstName || !d?.patientLastName) {
      updateItem(item.id, { status: "error", error: "Patient name required. Expand the card to fill it in." })
      return
    }

    updateItem(item.id, { status: "processing" })

    try {
      const result = await createReferral(
        {
          patientFirstName: d.patientFirstName,
          patientLastName: d.patientLastName,
          patientMrn: d.patientMrn ?? undefined,
          patientPhone: d.patientPhone ?? undefined,
          patientEmail: d.patientEmail ?? undefined,
          patientDob: d.patientDob ?? undefined,
          // Linked IDs take priority; fall back to free-text for org resolution
          referringPracticeId: item.practiceId ?? undefined,
          referringLocationId: item.locationId ?? undefined,
          referringDoctorId: item.doctorId ?? undefined,
          // Pass free-text only when no linked practice (triggers resolveOrCreatePractice)
          referringDoctorName: !item.practiceId ? (d.referringDoctorName ?? undefined) : undefined,
          referringNpi: d.referringNpi ?? undefined,
          referringPhone: d.referringPhone ?? undefined,
          referringAddress: d.referringAddress ?? undefined,
          insuranceProvider: d.insuranceProvider ?? undefined,
          insuranceMemberId: d.insuranceMemberId ?? undefined,
          notes: d.notes ?? undefined,
          status: "NEW",
          referralDate: new Date().toISOString().split("T")[0],
        },
        d.pendingFile,
      )

      if (result && "error" in result) {
        updateItem(item.id, { status: "error", error: "Validation failed. Create manually." })
        return
      }
      updateItem(item.id, { status: "created" })
    } catch {
      updateItem(item.id, { status: "error", error: "Failed to create referral." })
    }
  }

  async function handleCreateAll() {
    setCreatingAll(true)
    const ready = queue.filter(
      item => item.status === "done" && !!item.data?.patientFirstName && !!item.data?.patientLastName,
    )
    await Promise.allSettled(ready.map(item => handleCreateItem(item)))
    setCreatingAll(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    addFiles(e.dataTransfer.files)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(e.target.files)
    e.target.value = ""
  }

  const readyCount = queue.filter(
    i => i.status === "done" && !!i.data?.patientFirstName && !!i.data?.patientLastName,
  ).length
  const createdCount = queue.filter(i => i.status === "created").length
  const processingCount = queue.filter(
    i => i.status === "pending" || i.status === "processing",
  ).length

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          isDragging ? "border-blue-400 bg-blue-50" : "border-slate-300 hover:border-slate-400 bg-white"
        }`}
      >
        <div className="flex flex-col items-center gap-2">
          <Layers className="h-9 w-9 text-slate-400" />
          <p className="text-sm font-medium text-slate-600">Drop multiple faxes here or click to browse</p>
          <p className="text-xs text-slate-400">
            PDF, JPG, PNG, WEBP · max {MAX_SIZE_MB} MB each · multiple files at once
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        multiple
        className="hidden"
        onChange={handleChange}
      />

      {processingCount > 0 && (
        <div className="flex items-center gap-2 text-sm text-blue-600">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Extracting data from {processingCount} file{processingCount !== 1 ? "s" : ""}…
        </div>
      )}

      {queue.length > 0 && (
        <div className="space-y-2">
          {queue.map(item => (
            <QueueCard
              key={item.id}
              item={item}
              practices={practices}
              onCreate={handleCreateItem}
              onEdit={patch => handleEdit(item.id, patch)}
              onSetIds={ids => handleSetIds(item.id, ids)}
              onSkip={() => updateItem(item.id, { status: "skipped" })}
              onRemove={() => {
                filesRef.current.delete(item.id)
                setQueue(prev => prev.filter(i => i.id !== item.id))
              }}
            />
          ))}
        </div>
      )}

      {(readyCount > 0 || createdCount > 0) && (
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm text-slate-600">
            {createdCount > 0 && (
              <span className="text-green-700 font-medium">{createdCount} created</span>
            )}
            {createdCount > 0 && readyCount > 0 && " · "}
            {readyCount > 0 && `${readyCount} ready`}
          </p>
          {readyCount > 0 && (
            <Button onClick={handleCreateAll} disabled={creatingAll} size="sm">
              {creatingAll ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Creating…</>
              ) : (
                <><Plus className="h-3.5 w-3.5 mr-1.5" />Create All {readyCount} Referrals</>
              )}
            </Button>
          )}
        </div>
      )}

      {queue.length > 0 && readyCount === 0 && processingCount === 0 && createdCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
          <p className="text-sm text-green-700">
            All done — {createdCount} referral{createdCount !== 1 ? "s" : ""} created. You can drop more files above.
          </p>
        </div>
      )}
    </div>
  )
}
