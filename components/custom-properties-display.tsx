"use client"

import type { CPEntity } from "@/lib/custom-property-entities"

import StyledSelect from "@/components/ui/styled-select"
import { useState, useTransition } from "react"
import { Edit2, Check, X } from "lucide-react"
import { saveCustomPropertyValue } from "@/app/actions/custom-properties"
import { OptionValue } from "@/components/option-value"
import { formatNumber } from "@/lib/number-format"
import { cn } from "@/lib/utils"

interface CustomProperty {
  id: string
  name: string
  type: string
  required: boolean
  options: string[]
  optionLabels?: Record<string, string> | null
  optionColors?: Record<string, string> | null
  optionStyle?: string | null
  numberFormat?: string | null
}

interface PropertyDisplay {
  visible: boolean
  order: number
}

interface Props {
  entityType: CPEntity
  entityId: string
  properties: Array<CustomProperty & { display: PropertyDisplay; value?: any }>
}

export default function CustomPropertiesDisplay({
  entityType,
  entityId,
  properties,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<any>(null)
  const [isPending, startTransition] = useTransition()

  // Filter to visible properties and sort by order
  const visibleProps = properties
    .filter((p) => p.display.visible)
    .sort((a, b) => a.display.order - b.display.order)

  if (visibleProps.length === 0) {
    return null
  }

  const handleEdit = (prop: typeof properties[0]) => {
    setEditingId(prop.id)
    setEditValue(prop.value ?? "")
  }

  const handleSave = (propId: string) => {
    startTransition(async () => {
      await saveCustomPropertyValue(entityType, entityId, propId, editValue)
      setEditingId(null)
      setEditValue(null)
    })
  }

  const handleCancel = () => {
    setEditingId(null)
    setEditValue(null)
  }

  const renderValue = (prop: typeof properties[0]) => {
    if (!prop.value && !prop.required) {
      return <span className="text-slate-400 italic">Not set</span>
    }

    switch (prop.type) {
      case "CHECKBOX":
        return prop.value ? "✓ Yes" : "○ No"
      case "DATE":
        return prop.value ? new Date(prop.value).toLocaleDateString() : "—"
      case "DATE_TIME":
        return prop.value ? new Date(prop.value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—"
      case "MULTI_SELECT":
      case "DROPDOWN":
        return (prop.value == null || prop.value === "" || (Array.isArray(prop.value) && prop.value.length === 0))
          ? "—"
          : <OptionValue value={prop.value} optionLabels={prop.optionLabels} optionColors={prop.optionColors} optionStyle={prop.optionStyle} />
      case "NUMBER":
        return prop.value === "" || prop.value == null ? "—" : formatNumber(prop.value, prop.numberFormat as any)
      default:
        return prop.value || "—"
    }
  }

  const renderInput = (prop: typeof properties[0]) => {
    const value = editValue ?? prop.value ?? ""

    switch (prop.type) {
      case "CHECKBOX":
        return (
          <input
            type="checkbox"
            checked={editValue ?? prop.value ?? false}
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
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
          />
        )
      case "DATE_TIME":
        return (
          <input
            type="datetime-local"
            value={value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""}
            onChange={(e) => setEditValue(e.target.value ? new Date(e.target.value).toISOString() : null)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
          />
        )
      case "DROPDOWN":
        return (
          <StyledSelect
            value={value}
            onChange={(e) => setEditValue(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
          >
            <option value="">Select...</option>
            {prop.options.map((opt) => (
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
            rows={3}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono"
          />
        )
      case "NUMBER":
        return (
          <input
            type="number"
            value={value}
            onChange={(e) => setEditValue(e.target.value ? Number(e.target.value) : null)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
          />
        )
      case "PHONE":
        return (
          <input
            type="tel"
            value={value}
            onChange={(e) => setEditValue(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
          />
        )
      case "EMAIL":
        return (
          <input
            type="email"
            value={value}
            onChange={(e) => setEditValue(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
          />
        )
      case "URL":
        return (
          <input
            type="url"
            value={value}
            onChange={(e) => setEditValue(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
          />
        )
      default: // TEXT
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => setEditValue(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
          />
        )
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-700">Custom Properties</h3>
      <div className="grid gap-4">
        {visibleProps.map((prop) => (
          <div key={prop.id} className="p-4 border border-slate-200 rounded-lg">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <label className="block text-sm font-medium text-slate-900 mb-2">
                  {prop.name}
                  {prop.required && <span className="text-red-500">*</span>}
                </label>

                {editingId === prop.id ? (
                  <div className="space-y-2">
                    {renderInput(prop)}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSave(prop.id)}
                        disabled={isPending}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                      >
                        <Check className="h-4 w-4" /> Save
                      </button>
                      <button
                        onClick={handleCancel}
                        disabled={isPending}
                        className="px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 rounded"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-slate-700">{renderValue(prop)}</div>
                    <button
                      onClick={() => handleEdit(prop)}
                      className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
