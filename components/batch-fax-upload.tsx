"use client"

import { useRef, useState } from "react"
import {
  FileText, Upload, CheckCircle2, AlertCircle, Loader2,
  X, SkipForward, Plus, Layers,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { createReferral } from "@/app/actions/referrals"
import type { ExtractedReferralData } from "@/app/api/fax/extract/route"

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"]
const MAX_SIZE_MB = 10
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024

type ItemStatus = "pending" | "processing" | "done" | "error" | "created" | "skipped"

interface QueueItem {
  id: string
  fileName: string
  status: ItemStatus
  data: ExtractedReferralData | null
  error: string | null
}

function QueueCard({
  item,
  onCreate,
  onSkip,
  onRemove,
}: {
  item: QueueItem
  onCreate: (item: QueueItem) => void
  onSkip: () => void
  onRemove: () => void
}) {
  const d = item.data
  const canCreate = item.status === "done" && !!d?.patientFirstName && !!d?.patientLastName

  return (
    <div
      className={`rounded-lg border p-4 flex items-start gap-3 transition-colors ${
        item.status === "created"
          ? "border-green-200 bg-green-50"
          : item.status === "skipped"
          ? "border-slate-200 bg-slate-50 opacity-50"
          : item.status === "error"
          ? "border-red-200 bg-red-50"
          : "border-slate-200 bg-white"
      }`}
    >
      {/* Status icon */}
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

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-400 truncate mb-0.5">{item.fileName}</p>
        {item.status === "pending" && (
          <p className="text-sm text-slate-500">Queued…</p>
        )}
        {item.status === "processing" && !item.data && (
          <p className="text-sm text-slate-500">Extracting referral data…</p>
        )}
        {item.status === "processing" && item.data && (
          <p className="text-sm text-slate-500">Creating referral…</p>
        )}
        {item.status === "done" && d && (
          <div className="space-y-0.5">
            {d.patientFirstName && d.patientLastName ? (
              <p className="text-sm font-medium text-slate-800">
                {d.patientFirstName} {d.patientLastName}
              </p>
            ) : (
              <p className="text-xs text-amber-600 font-medium">Patient name not found</p>
            )}
            {d.patientDob && (
              <p className="text-xs text-slate-500">DOB: {d.patientDob}</p>
            )}
            {d.referringOrg && (
              <p className="text-xs text-slate-500">From: {d.referringOrg}</p>
            )}
            {d.referringDoctorName && (
              <p className="text-xs text-slate-500">Provider: {d.referringDoctorName}</p>
            )}
            {d.insuranceProvider && (
              <p className="text-xs text-slate-500">Insurance: {d.insuranceProvider}</p>
            )}
          </div>
        )}
        {item.status === "error" && (
          <p className="text-sm text-red-600">{item.error}</p>
        )}
        {item.status === "created" && d && (
          <p className="text-sm font-medium text-green-700">
            {d.patientFirstName} {d.patientLastName} — Referral created
          </p>
        )}
        {item.status === "skipped" && (
          <p className="text-sm text-slate-400">Skipped</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 flex-shrink-0">
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
  )
}

export default function BatchFaxUpload() {
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

    // Start extraction for all in parallel
    valid.forEach(({ id }) => processFile(id))
  }

  async function handleCreateItem(item: QueueItem) {
    const d = item.data
    if (!d?.patientFirstName || !d?.patientLastName) {
      updateItem(item.id, { status: "error", error: "Patient name not found. Create manually." })
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
      item =>
        item.status === "done" && !!item.data?.patientFirstName && !!item.data?.patientLastName,
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
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          isDragging
            ? "border-blue-400 bg-blue-50"
            : "border-slate-300 hover:border-slate-400 bg-white"
        }`}
      >
        <div className="flex flex-col items-center gap-2">
          <Layers className="h-9 w-9 text-slate-400" />
          <p className="text-sm font-medium text-slate-600">
            Drop multiple faxes here or click to browse
          </p>
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

      {/* Processing summary badge */}
      {processingCount > 0 && (
        <div className="flex items-center gap-2 text-sm text-blue-600">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Extracting data from {processingCount} file{processingCount !== 1 ? "s" : ""}…
        </div>
      )}

      {/* Queue cards */}
      {queue.length > 0 && (
        <div className="space-y-2">
          {queue.map(item => (
            <QueueCard
              key={item.id}
              item={item}
              onCreate={handleCreateItem}
              onSkip={() => updateItem(item.id, { status: "skipped" })}
              onRemove={() => {
                filesRef.current.delete(item.id)
                setQueue(prev => prev.filter(i => i.id !== item.id))
              }}
            />
          ))}
        </div>
      )}

      {/* Footer bar */}
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
            <Button
              onClick={handleCreateAll}
              disabled={creatingAll}
              size="sm"
            >
              {creatingAll ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Create All {readyCount} Referrals
                </>
              )}
            </Button>
          )}
        </div>
      )}

      {/* All done state */}
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
