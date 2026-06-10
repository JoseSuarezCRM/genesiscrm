"use client"

import { useState, useTransition } from "react"
import { Eye, EyeOff, GripVertical } from "lucide-react"
import { updatePropertyDisplay, togglePropertyVisibility } from "@/app/actions/property-display"
import { cn } from "@/lib/utils"

interface Property {
  id: string
  name: string
  type: string
  visible: boolean
  order: number
}

interface Props {
  referralProps: Property[]
  providerProps: Property[]
  practiceProps: Property[]
}

type EntityType = "REFERRAL" | "PROVIDER" | "PRACTICE"

const entityTypes: { value: EntityType; label: string; icon: string }[] = [
  { value: "REFERRAL", label: "Referrals", icon: "📋" },
  { value: "PROVIDER", label: "Providers", icon: "👨‍⚕️" },
  { value: "PRACTICE", label: "Practices", icon: "🏥" },
]

export default function PropertyCustomizationManager({
  referralProps,
  providerProps,
  practiceProps,
}: Props) {
  const [selected, setSelected] = useState<EntityType>("REFERRAL")
  const [isPending, startTransition] = useTransition()
  const [draggedId, setDraggedId] = useState<string | null>(null)

  const propertyMap: Record<EntityType, Property[]> = {
    REFERRAL: referralProps,
    PROVIDER: providerProps,
    PRACTICE: practiceProps,
  }

  const properties = propertyMap[selected].sort((a, b) => a.order - b.order)

  const handleToggle = (id: string) => {
    const prop = properties.find((p) => p.id === id)
    if (!prop) return

    startTransition(async () => {
      await togglePropertyVisibility(id, selected, !prop.visible)
    })
  }

  const handleReorder = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= properties.length) return

    const reordered = [...properties]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved)

    startTransition(async () => {
      const updates = reordered.map((p, idx) => ({
        customPropertyId: p.id,
        order: idx,
      }))
      // Since we don't have updatePropertyOrder in the client, we'll update individually
      for (let i = 0; i < reordered.length; i++) {
        await updatePropertyDisplay(reordered[i].id, selected, reordered[i].visible, i)
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Entity Type Tabs */}
      <div className="flex gap-2">
        {entityTypes.map((entity) => (
          <button
            key={entity.value}
            onClick={() => setSelected(entity.value)}
            className={cn(
              "px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2",
              selected === entity.value
                ? "bg-blue-100 text-blue-900"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            <span>{entity.icon}</span>
            {entity.label}
          </button>
        ))}
      </div>

      {/* Properties List */}
      <div className="space-y-2">
        {properties.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">
            No custom properties for this entity type yet
          </p>
        ) : (
          properties.map((prop, idx) => (
            <div
              key={prop.id}
              draggable
              onDragStart={() => setDraggedId(prop.id)}
              onDragEnd={() => setDraggedId(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                const fromIdx = properties.findIndex((p) => p.id === draggedId)
                if (fromIdx !== idx) {
                  handleReorder(fromIdx, idx)
                }
              }}
              className={cn(
                "flex items-center gap-3 p-4 border rounded-lg transition-colors",
                draggedId === prop.id
                  ? "bg-blue-50 border-blue-300 opacity-50"
                  : "bg-white border-slate-200 hover:border-slate-300"
              )}
            >
              <GripVertical className="h-5 w-5 text-slate-400 cursor-grab" />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900">{prop.name}</p>
                <p className="text-xs text-slate-500">{prop.type}</p>
              </div>

              <button
                onClick={() => handleToggle(prop.id)}
                disabled={isPending}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  prop.visible
                    ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
                    : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                )}
                title={prop.visible ? "Hide property" : "Show property"}
              >
                {prop.visible ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
              </button>
            </div>
          ))
        )}
      </div>

      {properties.length > 0 && (
        <p className="text-xs text-slate-500 italic">
          💡 Drag properties to reorder them. Click the eye icon to toggle visibility.
        </p>
      )}
    </div>
  )
}
