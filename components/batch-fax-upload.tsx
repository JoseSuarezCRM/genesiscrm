"use client"

import { useRef, useState } from "react"
import {
  FileText, CheckCircle2, AlertCircle, Loader2,
  X, SkipForward, Plus, Layers, ChevronDown, ChevronUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { createReferral } from "@/app/actions/referrals"
import ReferralForm from "@/components/referral-form"
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
}

// ── QueueCard ──────────────────────────────────────────────────────────────────

function QueueCard({
  item,
  practices,
  onQuickCreate,
  onCreated,
  onSkip,
  onRemove,
}: {
  item: QueueItem
  practices: Practice[]
  onQuickCreate: (item: QueueItem) => void
  onCreated: (id: string) => void
  onSkip: () => void
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const d = item.data
  const isDone = item.status === "done"
  const isCreated = item.status === "created"
  const canExpand = isDone && !!d

  return (
    <div
      className={`rounded-lg border transition-colors ${
        isCreated
          ? "border-green-200 bg-green-50"
          : item.status === "skipped"
          ? "border-slate-200 bg-slate-50 opacity-50"
          : item.status === "error"
          ? "border-red-200 bg-red-50"
          : expanded
          ? "border-blue-200 bg-white"
          : "border-slate-200 bg-white"
      }`}
    >
      {/* Header row */}
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 flex-shrink-0">
          {(item.status === "pending" || (item.status === "processing" && !d)) && (
            <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
          )}
          {item.status === "processing" && d && <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />}
          {isDone && !expanded && <FileText className="h-4 w-4 text-slate-500" />}
          {isDone && expanded && <FileText className="h-4 w-4 text-blue-500" />}
          {isCreated && <CheckCircle2 className="h-4 w-4 text-green-500" />}
          {item.status === "error" && <AlertCircle className="h-4 w-4 text-red-500" />}
          {item.status === "skipped" && <SkipForward className="h-4 w-4 text-slate-400" />}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 truncate mb-0.5">{item.fileName}</p>
          {item.status === "pending" && <p className="text-sm text-slate-500">Queued…</p>}
          {item.status === "processing" && !d && <p className="text-sm text-slate-500">Extracting referral data…</p>}
          {item.status === "processing" && d && <p className="text-sm text-slate-500">Creating referral…</p>}
          {(isDone || isCreated) && d && (
            <div className="space-y-0.5">
              {d.patientFirstName && d.patientLastName ? (
                <p className="text-sm font-medium text-slate-800">
                  {d.patientFirstName} {d.patientLastName}
                </p>
              ) : (
                <p className="text-xs text-amber-600 font-medium">Patient name not found — expand to fill in</p>
              )}
              {d.patientDob && <p className="text-xs text-slate-500">DOB: {d.patientDob}</p>}
              {d.referringOrg && <p className="text-xs text-slate-500">From: {d.referringOrg}</p>}
              {d.referringDoctorName && <p className="text-xs text-slate-500">Provider: {d.referringDoctorName}</p>}
              {isCreated && <p className="text-xs font-medium text-green-700 mt-0.5">Referral created</p>}
            </div>
          )}
          {item.status === "error" && <p className="text-sm text-red-600">{item.error}</p>}
          {item.status === "skipped" && <p className="text-sm text-slate-400">Skipped</p>}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {canExpand && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="h-7 w-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              title={expanded ? "Collapse form" : "Open form to review & edit"}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
          {isDone && !expanded && (
            <>
              {d?.patientFirstName && d?.patientLastName && (
                <Button size="sm" onClick={() => onQuickCreate(item)} className="h-7 text-xs px-2">
                  Quick Create
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
            <Button size="sm" variant="ghost" onClick={onRemove} className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Full ReferralForm panel — only mounted while expanded */}
      {canExpand && expanded && d && (
        <div className="border-t border-slate-200 px-6 py-6">
          <ReferralForm
            practices={practices}
            prefillData={d}
            pendingFile={d.pendingFile}
            onSuccess={() => {
              onCreated(item.id)
              setExpanded(false)
            }}
            onCancel={() => setExpanded(false)}
          />
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
      })),
    ])
    valid.forEach(({ id }) => processFile(id))
  }

  // Quick-create: uses raw extracted data, no form
  async function handleQuickCreate(item: QueueItem) {
    const d = item.data
    if (!d?.patientFirstName || !d?.patientLastName) return
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
          referringDoctorName: d.referringDoctorName ?? undefined,
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
        updateItem(item.id, { status: "error", error: "Validation failed. Open the form to fix." })
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
      i => i.status === "done" && !!i.data?.patientFirstName && !!i.data?.patientLastName,
    )
    await Promise.allSettled(ready.map(item => handleQuickCreate(item)))
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
  const processingCount = queue.filter(i => i.status === "pending" || i.status === "processing").length

  return (
    <div className="space-y-4">
      {/* Drop zone */}
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
          <p className="text-xs text-slate-400">PDF, JPG, PNG, WEBP · max {MAX_SIZE_MB} MB each · multiple files at once</p>
        </div>
      </div>

      <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple className="hidden" onChange={handleChange} />

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
              onQuickCreate={handleQuickCreate}
              onCreated={id => updateItem(id, { status: "created" })}
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
            {createdCount > 0 && <span className="text-green-700 font-medium">{createdCount} created</span>}
            {createdCount > 0 && readyCount > 0 && " · "}
            {readyCount > 0 && `${readyCount} ready`}
          </p>
          {readyCount > 0 && (
            <Button onClick={handleCreateAll} disabled={creatingAll} size="sm">
              {creatingAll
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Creating…</>
                : <><Plus className="h-3.5 w-3.5 mr-1.5" />Quick Create All {readyCount}</>
              }
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
