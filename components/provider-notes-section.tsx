"use client"

import { useState, useTransition } from "react"
import {
  createProviderNote,
  updateProviderNote,
  deleteProviderNote,
} from "@/app/actions/referring-doctors"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Pencil, Trash2, Plus, Check, X } from "lucide-react"

interface Note {
  id: string
  content: string
  createdAt: Date
  updatedAt: Date
  createdBy: { name: string | null; email: string }
}

interface Props {
  providerId: string
  initialNotes: Note[]
}

function formatDateTime(date: Date) {
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export default function ProviderNotesSection({ providerId, initialNotes }: Props) {
  const [notes, setNotes] = useState<Note[]>(initialNotes)
  const [newText, setNewText] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleAdd() {
    if (!newText.trim()) return
    startTransition(async () => {
      const result = await createProviderNote(providerId, newText)
      if (!result?.error) {
        // Optimistically add with placeholder — page will revalidate in background
        setNotes((prev) => [
          {
            id: `temp-${Date.now()}`,
            content: newText.trim(),
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: { name: null, email: "" },
          },
          ...prev,
        ])
        setNewText("")
      }
    })
  }

  function startEdit(note: Note) {
    setEditingId(note.id)
    setEditText(note.content)
  }

  function handleUpdate(noteId: string) {
    if (!editText.trim()) return
    startTransition(async () => {
      const result = await updateProviderNote(noteId, editText, providerId)
      if (!result?.error) {
        setNotes((prev) =>
          prev.map((n) =>
            n.id === noteId ? { ...n, content: editText.trim(), updatedAt: new Date() } : n
          )
        )
        setEditingId(null)
      }
    })
  }

  function handleDelete(noteId: string) {
    startTransition(async () => {
      await deleteProviderNote(noteId, providerId)
      setNotes((prev) => prev.filter((n) => n.id !== noteId))
    })
  }

  return (
    <div className="space-y-4">
      {/* Add new note */}
      <div className="space-y-2">
        <Textarea
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="Add a note about this provider..."
          rows={3}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAdd()
          }}
        />
        <Button
          onClick={handleAdd}
          disabled={isPending || !newText.trim()}
          size="sm"
        >
          {isPending && !editingId
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Adding...</>
            : <><Plus className="h-4 w-4 mr-2" />Add Note</>
          }
        </Button>
      </div>

      {/* Notes list */}
      {notes.length === 0 ? (
        <p className="text-sm text-slate-400 italic">No notes yet.</p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="border rounded-lg p-4 bg-slate-50 space-y-2">
              {editingId === note.id ? (
                <>
                  <Textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={3}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleUpdate(note.id)}
                      disabled={isPending || !editText.trim()}
                    >
                      {isPending
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <><Check className="h-4 w-4 mr-1" />Save</>
                      }
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingId(null)}
                    >
                      <X className="h-4 w-4 mr-1" />Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-800 whitespace-pre-wrap">{note.content}</p>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-slate-400">
                      {note.createdBy.name || note.createdBy.email
                        ? `${note.createdBy.name || note.createdBy.email} · `
                        : ""}
                      {formatDateTime(note.createdAt)}
                      {note.updatedAt > note.createdAt && " (edited)"}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => startEdit(note)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-red-500 hover:bg-red-50"
                        onClick={() => handleDelete(note.id)}
                        disabled={isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
