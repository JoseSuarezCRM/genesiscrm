"use client"

import { useRef, useState } from "react"
import { Paperclip, X, Loader2, FileText } from "lucide-react"
import { cn } from "@/lib/utils"

export interface AttachmentRef {
  name: string
  contentType: string
  url: string
  size?: number
}

function fmtSize(bytes?: number) {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function EmailAttachments({ value, onChange, compact }: {
  value: AttachmentRef[]
  onChange: (next: AttachmentRef[]) => void
  compact?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    setUploading(true)
    const added: AttachmentRef[] = []
    for (const file of Array.from(files)) {
      try {
        const fd = new FormData()
        fd.append("file", file)
        const res = await fetch("/api/email-attachments/upload", { method: "POST", body: fd })
        const text = await res.text()
        let data: any = {}
        try { data = text ? JSON.parse(text) : {} } catch { /* non-JSON (e.g. HTML error page) */ }
        if (!res.ok) {
          setError(data.error ?? `Upload failed (HTTP ${res.status})`)
          continue
        }
        added.push(data as AttachmentRef)
      } catch (e) {
        setError(`Upload failed: ${e instanceof Error ? e.message : "network error"}`)
      }
    }
    if (added.length) onChange([...value, ...added])
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ""
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800 transition-colors disabled:opacity-50",
            compact ? "h-7 px-2 text-xs" : "h-8 px-3 text-sm"
          )}
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
          Attach files
        </button>
        {value.map((att, i) => (
          <span key={att.url + i} className="inline-flex items-center gap-1.5 h-7 pl-2 pr-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-700 max-w-[220px]">
            <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="truncate">{att.name}</span>
            {att.size ? <span className="text-slate-400 shrink-0">{fmtSize(att.size)}</span> : null}
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="shrink-0 hover:text-red-500">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
          accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx,.txt,.csv"
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
