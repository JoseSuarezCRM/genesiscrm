"use client"

import { useState, useTransition } from "react"
import { Edit2, Check, X } from "lucide-react"
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
          <select value={value} onChange={(e) => setEditValue(e.target.value)} className={inputClasses}>
            <option value="">Select...</option>
            {property.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
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
    <div className="group flex justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
        {property.name}
      </span>
      <span className="text-sm text-slate-900 text-right flex items-center gap-1.5">
        {displayValue()}
        <button
          onClick={() => setEditing(true)}
          className="p-0.5 text-slate-300 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity"
          title={`Edit ${property.name}`}
        >
          <Edit2 className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  )
}
