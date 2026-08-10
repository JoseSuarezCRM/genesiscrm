"use client"

import { useEffect, useRef, useState } from "react"
import { Upload, Loader2, FileText, Download, Trash2, Paperclip } from "lucide-react"
import { listRecordAttachments, deleteRecordAttachment, type RecordAttachmentDTO } from "@/app/actions/record-attachments"

function fmtSize(n: number): string {
  if (!n) return ""
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

// Attachments card body — upload / list / download / delete files on any record.
export default function AttachmentsCard({ recordType, recordId, canEdit }: {
  recordType: string
  recordId: string
  canEdit: boolean
}) {
  const [items, setItems] = useState<RecordAttachmentDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    listRecordAttachments(recordType, recordId).then(setItems).catch(() => {}).finally(() => setLoading(false))
  }, [recordType, recordId])

  const upload = async (files: FileList) => {
    setUploading(true); setError(null)
    for (const file of Array.from(files)) {
      try {
        const fd = new FormData()
        fd.append("file", file)
        fd.append("recordType", recordType)
        fd.append("recordId", recordId)
        const res = await fetch("/api/record-attachments/upload", { method: "POST", body: fd })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Upload failed.")
        setItems((a) => [{ id: data.id, name: data.name, url: data.url, contentType: data.contentType, size: data.size, createdAt: new Date().toISOString() }, ...a])
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed.")
      }
    }
    setUploading(false)
  }

  const remove = async (id: string) => {
    setItems((a) => a.filter((x) => x.id !== id))
    await deleteRecordAttachment(id)
  }

  return (
    <div className="p-5 space-y-3">
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-4 text-slate-300"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-400 flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5" /> No files attached yet.</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((a) => (
            <div key={a.id} className="group flex items-center gap-2.5 rounded-lg border border-slate-200 px-2.5 py-2">
              <FileText className="h-4 w-4 text-slate-400 shrink-0" />
              <a href={a.url} className="flex-1 min-w-0 text-sm text-slate-700 hover:text-blue-600 truncate" title={a.name}>{a.name}</a>
              {a.size > 0 && <span className="text-[11px] text-slate-400 shrink-0">{fmtSize(a.size)}</span>}
              <a href={a.url} className="text-slate-300 hover:text-slate-600 shrink-0" title="Download"><Download className="h-3.5 w-3.5" /></a>
              {canEdit && (
                <button onClick={() => remove(a.id)} className="text-slate-300 hover:text-red-500 shrink-0 opacity-0 group-hover:opacity-100" title="Remove">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = "" }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Upload files
          </button>
        </>
      )}
    </div>
  )
}
