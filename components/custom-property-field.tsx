"use client"

import StyledSelect from "@/components/ui/styled-select"
import { useState, useTransition, useEffect } from "react"
import { Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { saveCustomPropertyValue } from "@/app/actions/custom-properties"

interface CustomProperty {
  id: string
  name: string
  type: string
  required: boolean
  options: string[]
  value?: any
}

interface Props {
  entityType: "REFERRAL" | "PROVIDER" | "PRACTICE"
  entityId: string
  property: CustomProperty
}

// Compact inline-editable custom property row, styled to match PropertyRow in detail cards
export default function CustomPropertyField({ entityType, entityId, property }: Props) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState<any>(null)
  const [isPending, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useState<boolean | null>(null)
  // Clear the optimistic toggle once the server-updated value arrives.
  useEffect(() => { setOptimistic(null) }, [property.value])

  const handleSave = () => {
    startTransition(async () => {
      await saveCustomPropertyValue(entityType, entityId, property.id, editValue)
      setEditing(false)
      setEditValue(null)
    })
  }

  const displayValue = () => {
    if (property.value === null || property.value === undefined || property.value === "") {
      return <span className="text-slate-400">—</span>
    }
    switch (property.type) {
      case "CHECKBOX":
        return property.value ? "✓ Yes" : "○ No"
      case "DATE":
        return new Date(property.value).toLocaleDateString()
      case "MULTI_SELECT":
        return Array.isArray(property.value) ? property.value.join(", ") : "—"
      default:
        return String(property.value)
    }
  }

  const inputClasses =
    "w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"

  const renderInput = () => {
    const value = editValue ?? property.value ?? ""
    switch (property.type) {
      case "CHECKBOX":
        return (
          <input
            type="checkbox"
            checked={editValue ?? property.value ?? false}
            onChange={(e) => setEditValue(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
        )
      case "DATE":
        return (
          <input
            type="date"
            value={value ? new Date(value).toISOString().split("T")[0] : ""}
            onChange={(e) => setEditValue(e.target.value ? new Date(e.target.value).toISOString() : null)}
            className={inputClasses}
          />
        )
      case "DROPDOWN":
        return (
          <StyledSelect value={value} onChange={(e) => setEditValue(e.target.value)} className={inputClasses}>
            <option value="">Select...</option>
            {property.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </StyledSelect>
        )
      case "LONG_TEXT":
        return (
          <textarea
            value={value}
            onChange={(e) => setEditValue(e.target.value)}
            rows={2}
            className={inputClasses}
          />
        )
      case "NUMBER":
        return (
          <input
            type="number"
            value={value}
            onChange={(e) => setEditValue(e.target.value ? Number(e.target.value) : null)}
            className={inputClasses}
          />
        )
      default: // TEXT, PHONE, EMAIL, URL
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => setEditValue(e.target.value)}
            className={inputClasses}
          />
        )
    }
  }

  // Checkbox/boolean: a direct toggle that saves on click (no edit/save dance).
  if (property.type === "CHECKBOX") {
    const checked = optimistic ?? !!property.value
    const toggle = () => {
      const next = !checked
      setOptimistic(next)
      startTransition(async () => {
        await saveCustomPropertyValue(entityType, entityId, property.id, next)
      })
    }
    return (
      <div className="py-2.5 border-b border-slate-100 last:border-0">
        <span className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
          {property.name}
        </span>
        <div className="flex items-center gap-2.5">
          <button
            type="button" role="switch" aria-checked={checked} disabled={isPending} onClick={toggle}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
              checked ? "bg-emerald-500" : "bg-slate-200",
            )}
            title={`Toggle ${property.name}`}
          >
            <span className={cn(
              "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
              checked ? "translate-x-4" : "translate-x-0.5",
            )} />
          </button>
          <span className={cn("text-sm font-medium", checked ? "text-emerald-700" : "text-slate-400")}>
            {checked ? "Yes" : "No"}
          </span>
        </div>
      </div>
    )
  }

  if (editing) {
    return (
      <div className="py-2.5 border-b border-slate-100 last:border-0 space-y-2">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
          {property.name}
        </span>
        {renderInput()}
        <div className="flex gap-1.5 justify-end">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
            title="Save"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            onClick={() => { setEditing(false); setEditValue(null) }}
            disabled={isPending}
            className="p-1 text-slate-400 hover:bg-slate-100 rounded"
            title="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="py-2.5 border-b border-slate-100 last:border-0">
      <span className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-0.5">
        {property.name}
      </span>
      <button
        onClick={() => setEditing(true)}
        className="block w-full text-left text-sm text-slate-900 cursor-text rounded px-1 -mx-1 py-0.5 hover:bg-blue-50/70 hover:ring-1 hover:ring-blue-200 transition-colors"
        title={`Click to edit ${property.name}`}
      >
        {displayValue()}
      </button>
    </div>
  )
}
