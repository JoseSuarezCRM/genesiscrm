"use client"

import { useState, useTransition } from "react"
import { updateReferralNotes } from "@/app/actions/referrals"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Pencil, Save, X } from "lucide-react"

export default function ReferralNotesEditor({
  referralId,
  initialNotes,
}: {
  referralId: string
  initialNotes: string | null
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(initialNotes ?? "")
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      await updateReferralNotes(referralId, text)
      setSaved(true)
      setEditing(false)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  function handleCancel() {
    setText(initialNotes ?? "")
    setEditing(false)
  }

  if (!editing) {
    return (
      <div className="space-y-2">
        {text ? (
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{text}</p>
        ) : (
          <p className="text-sm text-slate-400 italic">No notes yet.</p>
        )}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4 mr-2" />
            {text ? "Edit Notes" : "Add Notes"}
          </Button>
          {saved && <span className="text-sm text-green-600">Saved!</span>}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add notes about this referral..."
        rows={4}
        autoFocus
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          {isPending
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
            : <><Save className="h-4 w-4 mr-2" />Save</>
          }
        </Button>
        <Button size="sm" variant="outline" onClick={handleCancel}>
          <X className="h-4 w-4 mr-2" />Cancel
        </Button>
      </div>
    </div>
  )
}
