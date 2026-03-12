"use client"

import { useRef, useState } from "react"
import { FileText, Upload, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ExtractedReferralData } from "@/app/api/fax/extract/route"

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"]
const MAX_SIZE_BYTES = 10 * 1024 * 1024

interface FaxUploadProps {
  onExtracted: (data: ExtractedReferralData) => void
}

export default function FaxUpload({ onExtracted }: FaxUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  async function processFile(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setStatus("error")
      setErrorMessage("Only PDF, JPG, PNG, or WEBP files are accepted.")
      return
    }
    if (file.size > MAX_SIZE_BYTES) {
      setStatus("error")
      setErrorMessage("File exceeds 10 MB limit.")
      return
    }

    setStatus("loading")
    setFileName(file.name)
    setErrorMessage(null)

    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/fax/extract", { method: "POST", body: fd })
      const data = await res.json()

      if (!res.ok) {
        setStatus("error")
        setErrorMessage(data.error ?? "Extraction failed. Please fill the form manually.")
        return
      }

      setStatus("success")
      onExtracted(data as ExtractedReferralData)
    } catch {
      setStatus("error")
      setErrorMessage("Network error. Please try again or fill the form manually.")
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    // Reset input so the same file can be re-uploaded
    e.target.value = ""
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-700">Upload Fax to Auto-Fill</h2>
      </div>
      <p className="text-xs text-slate-500">
        Upload a fax (PDF or image) and we&apos;ll extract the patient and referral details automatically.
        You can review and edit everything before submitting.
      </p>

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => status !== "loading" && inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          isDragging
            ? "border-blue-400 bg-blue-50"
            : status === "success"
            ? "border-green-300 bg-green-50"
            : status === "error"
            ? "border-red-300 bg-red-50"
            : "border-slate-300 hover:border-slate-400 bg-white"
        } ${status === "loading" ? "cursor-default" : ""}`}
      >
        {status === "idle" && (
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-8 w-8 text-slate-400" />
            <p className="text-sm text-slate-600 font-medium">Drop fax here or click to browse</p>
            <p className="text-xs text-slate-400">PDF, JPG, PNG, WEBP — max 10 MB</p>
          </div>
        )}
        {status === "loading" && (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
            <p className="text-sm text-slate-600 font-medium">Extracting referral data...</p>
            {fileName && <p className="text-xs text-slate-400">{fileName}</p>}
          </div>
        )}
        {status === "success" && (
          <div className="flex flex-col items-center gap-2">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
            <p className="text-sm text-green-700 font-medium">Data extracted — review the form below</p>
            {fileName && <p className="text-xs text-slate-400">{fileName}</p>}
            <Button
              variant="outline"
              size="sm"
              className="mt-1 text-xs"
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}
            >
              Upload a different fax
            </Button>
          </div>
        )}
        {status === "error" && (
          <div className="flex flex-col items-center gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <p className="text-sm text-red-700 font-medium">{errorMessage}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-1 text-xs"
              onClick={(e) => { e.stopPropagation(); setStatus("idle") }}
            >
              Try again
            </Button>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  )
}
