"use client"

import { useState, useTransition } from "react"
import { Document } from "@prisma/client"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { FileText, ExternalLink, Trash2, Loader2 } from "lucide-react"

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(contentType: string | null | undefined) {
  return <FileText className="h-4 w-4 text-red-500 shrink-0" />
}

export default function DocumentList({
  documents,
  referralId,
}: {
  documents: Document[]
  referralId: string
}) {
  const router = useRouter()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleDelete(docId: string) {
    setDeletingId(docId)
    await fetch(`/api/documents/${docId}`, { method: "DELETE" })
    setDeletingId(null)
    router.refresh()
  }

  if (documents.length === 0) {
    return (
      <p className="text-sm text-slate-400 py-2">
        No documents uploaded yet. Click Upload to attach PDFs or images.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {documents.map((doc) => (
        <li
          key={doc.id}
          className="flex items-center gap-3 p-3 rounded-lg border bg-slate-50 hover:bg-white transition-colors"
        >
          {getFileIcon(doc.contentType)}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">
              {doc.fileName}
            </p>
            <p className="text-xs text-slate-500">
              {formatBytes(doc.fileSize)} &middot;{" "}
              {new Date(doc.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button size="icon" variant="ghost" asChild className="h-8 w-8">
              <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
                <span className="sr-only">Open</span>
              </a>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
              disabled={deletingId === doc.id}
              onClick={() => handleDelete(doc.id)}
            >
              {deletingId === doc.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              <span className="sr-only">Delete</span>
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
