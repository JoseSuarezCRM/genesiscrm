"use client"

import { useState, useTransition } from "react"
import { Eye, EyeOff, Edit2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { updateCardLayout } from "@/app/actions/card-layouts"
import { cn } from "@/lib/utils"
import {
  getCardNamesForEntity,
  getAvailableFieldsForCard,
  type CardFieldDefinition,
} from "@/lib/card-field-definitions"

interface CardLayout {
  entityType: string
  cardName: string
  title: string
  fields: string[]
}

interface Props {
  cardLayouts: CardLayout[]
  entityType: "REFERRAL" | "PROVIDER" | "PRACTICE"
}

export default function CardLayoutManager({ cardLayouts, entityType }: Props) {
  const [isPending, startTransition] = useTransition()
  const [editingCard, setEditingCard] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [selectedFields, setSelectedFields] = useState<string[]>([])

  const cardNames = getCardNamesForEntity(entityType)
  const layoutsByCard = new Map(cardLayouts.map((l) => [l.cardName, l]))

  const handleEditCard = (cardName: string) => {
    const layout = layoutsByCard.get(cardName)
    setEditingCard(cardName)
    setEditTitle(layout?.title || cardName)
    setSelectedFields(layout?.fields || [])
  }

  const handleToggleField = (fieldId: string) => {
    setSelectedFields((prev) =>
      prev.includes(fieldId) ? prev.filter((f) => f !== fieldId) : [...prev, fieldId]
    )
  }

  const handleSave = () => {
    if (!editingCard) return

    startTransition(async () => {
      await updateCardLayout(entityType, editingCard, editTitle, selectedFields)
      setEditingCard(null)
    })
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cardNames.map((cardName) => {
          const layout = layoutsByCard.get(cardName)
          const availableFields = getAvailableFieldsForCard(entityType, cardName)
          const displayedCount = selectedFields.length || availableFields.length

          return (
            <div
              key={cardName}
              className="border border-slate-200 rounded-lg p-4 hover:border-slate-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-slate-900">{layout?.title || cardName}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {displayedCount} of {availableFields.length} fields shown
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEditCard(cardName)}
                  disabled={isPending}
                  className="shrink-0"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {editingCard === cardName ? (
                <div className="mt-4 space-y-3 border-t pt-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600">Card Title</label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full mt-1 px-2 py-1.5 border border-slate-300 rounded text-sm"
                      placeholder="Card title"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-2">
                      Select Fields to Display
                    </label>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {availableFields.map((field) => (
                        <div key={field.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`${cardName}-${field.id}`}
                            checked={selectedFields.includes(field.id)}
                            onChange={() => handleToggleField(field.id)}
                            className="rounded"
                          />
                          <label
                            htmlFor={`${cardName}-${field.id}`}
                            className="text-sm text-slate-700 cursor-pointer"
                          >
                            {field.label}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 border-t pt-3">
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={isPending}
                      className="flex-1"
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingCard(null)}
                      disabled={isPending}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                availableFields.length > 0 && (
                  <div className="space-y-1">
                    {availableFields.slice(0, 3).map((field) => (
                      <div
                        key={field.id}
                        className="text-xs text-slate-600 flex items-center gap-2"
                      >
                        {selectedFields.includes(field.id) ? (
                          <Eye className="h-3 w-3 text-green-600" />
                        ) : (
                          <EyeOff className="h-3 w-3 text-slate-400" />
                        )}
                        {field.label}
                      </div>
                    ))}
                    {availableFields.length > 3 && (
                      <p className="text-xs text-slate-400 mt-1">
                        +{availableFields.length - 3} more fields
                      </p>
                    )}
                  </div>
                )
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
