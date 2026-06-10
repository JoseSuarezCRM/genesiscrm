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
  currentLayouts: CardLayout[]
  onUpdate?: (layouts: CardLayout[]) => void
}

export default function CardCustomizationModal({
  open,
  onOpenChange,
  entityType,
  currentLayouts,
  onUpdate,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [layouts, setLayouts] = useState<CardLayout[]>(currentLayouts)

  const cardNames = getCardNamesForEntity(entityType)

  const handleToggleCardVisibility = (cardName: string) => {
    setLayouts((prev) =>
      prev.map((layout) =>
        layout.cardName === cardName
          ? { ...layout, visible: !layout.visible }
          : layout
      )
    )
  }

  const handleToggleField = (cardName: string, fieldId: string): void => {
    setLayouts((prev: CardLayout[]) =>
      prev.map((layout: CardLayout): CardLayout =>
        layout.cardName === cardName
          ? {
              ...layout,
              fields: layout.fields.includes(fieldId)
                ? layout.fields.filter((f: string) => f !== fieldId)
                : [...layout.fields, fieldId],
            }
          : layout
      )
    )
  }

  const handleSave = () => {
    startTransition(async () => {
      // Save all layouts
      for (const layout of layouts) {
        await updateCardLayout(
          entityType,
          layout.cardName,
          layout.title,
          layout.fields
        )
      }
      onUpdate?.(layouts)
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Customize Detail Page Cards</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {cardNames.map((cardName) => {
            const layout: CardLayout = layouts.find((l) => l.cardName === cardName) || {
              cardName,
              title: cardName,
              fields: [] as string[],
              visible: true,
              entityType,
            }
            const availableFields = getAvailableFieldsForCard(
              entityType,
              cardName
            )

            return (
              <div
                key={cardName}
                className={cn(
                  "border rounded-lg p-4 transition-colors",
                  layout.visible
                    ? "border-slate-200 bg-white"
                    : "border-slate-100 bg-slate-50"
                )}
              >
                {/* Card header with visibility toggle */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleToggleCardVisibility(cardName)}
                      className={cn(
                        "p-2 rounded-lg transition-colors",
                        layout.visible
                          ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
                          : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                      )}
                      title={layout.visible ? "Hide card" : "Show card"}
                    >
                      {layout.visible ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                    </button>
                    <div>
                      <h3 className="font-medium text-slate-900">
                        {layout.title}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {layout.fields.length} of {availableFields.length}{" "}
                        fields shown
                      </p>
                    </div>
                  </div>
                </div>

                {/* Field checkboxes */}
                {layout.visible && (
                  <div className="space-y-2 ml-11">
                    {availableFields.length === 0 ? (
                      <p className="text-sm text-slate-400">
                        No fields available for this card
                      </p>
                    ) : (
                      availableFields.map((field) => {
                        const fieldId = field.id
                        const checked = layout.fields.includes(fieldId)
                        return (
                          <div
                            key={fieldId}
                            className="flex items-center gap-2"
                          >
                            <Checkbox
                              id={`${cardName}-${fieldId}`}
                              checked={checked}
                              onCheckedChange={() =>
                                handleToggleField(cardName, fieldId)
                              }
                            />
                            <label
                              htmlFor={`${cardName}-${fieldId}`}
                              className="text-sm text-slate-700 cursor-pointer"
                            >
                              {field.label}
                            </label>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )
          })}
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
