"use client"

import { useState, useTransition } from "react"
import { updateProviderNotes } from "@/app/actions/referring-doctors"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Save } from "lucide-react"

export default function ProviderNotesEditor({
  providerId,
  initialNotes,
}: {
  providerId: string
  initialNotes: string | null
}) {
  const [notes, setNotes] = useState(initialNotes ?? "")
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      await updateProviderNotes(providerId, notes)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div className="space-y-3">
      <Textarea
        value={notes}
        onChange={(e) => { setNotes(e.target.value); setSaved(false) }}
        placeholder="Add notes about this provider — relationship history, preferences, contact tips..."
        rows={5}
      />
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isPending} size="sm">
          {isPending
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
            : <><Save className="h-4 w-4 mr-2" />Save Notes</>
          }
        </Button>
        {saved && <span className="text-sm text-green-600">Saved!</span>}
      </div>
    </div>
  )
}
