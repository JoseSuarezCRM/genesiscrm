"use client"

import { useState, useTransition } from "react"
import {
  createCardLayout,
  updateCardLayout,
  deleteCardLayout,
} from "@/app/actions/card-layouts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Trash2 } from "lucide-react"
import { referralLeftFieldPool } from "@/lib/card-field-definitions"

interface CardLayout {
  cardName: string
  title: string
  fields: string[]
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityType: "REFERRAL" | "PROVIDER" | "PRACTICE"
  // null = creating a new card
  existing: CardLayout | null
  // custom properties defined in Settings, selectable like built-in fields
  customProperties?: { id: string; name: string }[]
}

export default function LeftCardEditorModal({
  open,
  onOpenChange,
  entityType,
  existing,
  customProperties = [],
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [title, setTitle] = useState(existing?.title ?? "")
  const [fields, setFields] = useState<string[]>(existing?.fields ?? [])

  const fieldPool = [
    ...referralLeftFieldPool,
    ...customProperties.map((p) => ({ id: `custom:${p.id}`, label: p.name })),
  ]

  const toggleField = (fieldId: string) => {
    setFields((prev) =>
      prev.includes(fieldId)
        ? prev.filter((f) => f !== fieldId)
        : [...prev, fieldId]
    )
  }

  const handleSave = () => {
    const trimmed = title.trim()
    if (!trimmed) return
    startTransition(async () => {
      if (existing) {
        await updateCardLayout(entityType, existing.cardName, trimmed, fields)
      } else {
        await createCardLayout(entityType, trimmed, fields)
      }
      onOpenChange(false)
    })
  }

  const handleDelete = () => {
    if (!existing) return
    startTransition(async () => {
      await deleteCardLayout(entityType, existing.cardName)
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Card" : "Create Card"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Card name</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Key Information"
            />
          </div>

          <div className="border rounded-lg p-4 border-slate-200 bg-white">
            <p className="text-xs text-slate-500 mb-3">
              {fields.length} of {fieldPool.length} properties shown
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {fieldPool.map((field) => (
                <div key={field.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`left-card-${field.id}`}
                    checked={fields.includes(field.id)}
                    onCheckedChange={() => toggleField(field.id)}
                  />
                  <label
                    htmlFor={`left-card-${field.id}`}
                    className="text-sm text-slate-700 cursor-pointer flex-1"
                  >
                    {field.label}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t pt-4">
          {existing && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
              className="mr-auto"
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Delete Card
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending || !title.trim()}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
