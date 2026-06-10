"use client"

import { useState, useTransition } from "react"
import { updateCardLayout } from "@/app/actions/card-layouts"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getCardNamesForEntity,
  getAvailableFieldsForCard,
} from "@/lib/card-field-definitions"

interface CardLayout {
  entityType: string
  cardName: string
  title: string
  fields: string[]
  visible?: boolean
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityType: "REFERRAL" | "PROVIDER" | "PRACTICE"
  cardName: string
  currentLayout: CardLayout
  onUpdate?: (layout: CardLayout) => void
}

export default function CardCustomizationModal({
  open,
  onOpenChange,
  entityType,
  cardName,
  currentLayout,
  onUpdate,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [layout, setLayout] = useState<CardLayout>(currentLayout)

  const handleToggleField = (fieldId: string): void => {
    setLayout((prev: CardLayout): CardLayout => ({
      ...prev,
      fields: prev.fields.includes(fieldId)
        ? prev.fields.filter((f: string) => f !== fieldId)
        : [...prev.fields, fieldId],
    }))
  }

  const handleSave = () => {
    startTransition(async () => {
      await updateCardLayout(
        entityType,
        layout.cardName,
        layout.title,
        layout.fields
      )
      onUpdate?.(layout)
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Customize {layout.title} Card</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="border rounded-lg p-4 border-slate-200 bg-white">
            <div className="mb-4">
              <h3 className="font-medium text-slate-900">{layout.title}</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {layout.fields.length} of{" "}
                {getAvailableFieldsForCard(entityType, cardName).length} fields
                shown
              </p>
            </div>

            {/* Field checkboxes */}
            <div className="space-y-2">
              {getAvailableFieldsForCard(entityType, cardName).length === 0 ? (
                <p className="text-sm text-slate-400">
                  No fields available for this card
                </p>
              ) : (
                getAvailableFieldsForCard(entityType, cardName).map((field) => {
                  const fieldId = field.id
                  const checked = layout.fields.includes(fieldId)
                  return (
                    <div key={fieldId} className="flex items-center gap-2">
                      <Checkbox
                        id={`${cardName}-${fieldId}`}
                        checked={checked}
                        onCheckedChange={() => handleToggleField(fieldId)}
                      />
                      <label
                        htmlFor={`${cardName}-${fieldId}`}
                        className="text-sm text-slate-700 cursor-pointer flex-1"
                      >
                        {field.label}
                      </label>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
