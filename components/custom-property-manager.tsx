"use client"

import StyledSelect from "@/components/ui/styled-select"
import { useState, useTransition } from "react"
import { createCustomProperty, updateCustomProperty, deleteCustomProperty } from "@/app/actions/custom-properties"
import { Plus, Trash2, Edit2, X } from "lucide-react"

interface CustomProperty {
  id: string
  name: string
  type: string
  entityType: string
  required: boolean
  description: string | null
  options: string[]
  createdAt: Date
}

interface Props {
  referralProps: CustomProperty[]
  providerProps: CustomProperty[]
  practiceProps: CustomProperty[]
}

const PROPERTY_TYPES = [
  { value: "TEXT", label: "Text" },
  { value: "LONG_TEXT", label: "Long Text" },
  { value: "NUMBER", label: "Number" },
  { value: "EMAIL", label: "Email" },
  { value: "PHONE", label: "Phone" },
  { value: "DATE", label: "Date" },
  { value: "CHECKBOX", label: "Checkbox" },
  { value: "DROPDOWN", label: "Dropdown" },
  { value: "MULTI_SELECT", label: "Multi-select" },
  { value: "URL", label: "URL" },
]

function PropertyForm({
  entityType,
  onClose,
}: {
  entityType: string
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [type, setType] = useState("TEXT")
  const [required, setRequired] = useState(false)
  const [description, setDescription] = useState("")
  const [options, setOptions] = useState("")
  const [error, setError] = useState("")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError("Property name is required")
      return
    }

    const optionsArray = type === "DROPDOWN" || type === "MULTI_SELECT"
      ? options.split("\n").filter((o) => o.trim())
      : []

    if ((type === "DROPDOWN" || type === "MULTI_SELECT") && optionsArray.length === 0) {
      setError("At least one option is required for this type")
      return
    }

    startTransition(async () => {
      const res = await createCustomProperty({
        name: name.trim(),
        type: type as any,
        entityType: entityType as any,
        required,
        description: description.trim() || undefined,
        options: optionsArray,
      }) as any

      if (res.error) {
        setError(res.error)
      } else {
        onClose()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-slate-50 rounded-lg">
      <div>
        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">
          Property Name *
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Surgery Type, Insurance Plan"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-zinc-400"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">
            Type *
          </label>
          <StyledSelect
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-zinc-400"
          >
            {PROPERTY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </StyledSelect>
        </div>

        <div>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Required
          </label>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">
          Description
        </label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-zinc-400"
        />
      </div>

      {(type === "DROPDOWN" || type === "MULTI_SELECT") && (
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">
            Options (one per line) *
          </label>
          <textarea
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            placeholder="Option 1&#10;Option 2&#10;Option 3"
            rows={4}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-zinc-400 font-mono"
          />
        </div>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 h-8 px-3 text-sm font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Creating..." : "Create Property"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3 h-8 text-sm text-slate-600 hover:text-slate-800"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function PropertyList({
  entityType,
  properties,
}: {
  entityType: string
  properties: CustomProperty[]
}) {
  const [isPending, startTransition] = useTransition()

  function handleDelete(id: string) {
    if (!confirm("Delete this property? This will not affect existing data.")) return
    startTransition(async () => {
      await deleteCustomProperty(id)
    })
  }

  return (
    <div className="space-y-2">
      {properties.length === 0 ? (
        <p className="text-sm text-slate-400 italic py-4">No custom properties yet</p>
      ) : (
        properties.map((prop) => (
          <div key={prop.id} className="flex items-start justify-between gap-3 p-3 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-slate-800">{prop.name}</p>
                <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-600">
                  {PROPERTY_TYPES.find((t) => t.value === prop.type)?.label}
                </span>
                {prop.required && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700">
                    Required
                  </span>
                )}
              </div>
              {prop.description && (
                <p className="text-xs text-slate-500 mt-1">{prop.description}</p>
              )}
              {prop.options.length > 0 && (
                <p className="text-xs text-slate-500 mt-1">
                  Options: {prop.options.join(", ")}
                </p>
              )}
            </div>
            <button
              onClick={() => handleDelete(prop.id)}
              disabled={isPending}
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
              title="Delete property"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))
      )}
    </div>
  )
}

export default function CustomPropertyManager({
  referralProps,
  providerProps,
  practiceProps,
}: Props) {
  const [activeForm, setActiveForm] = useState<string | null>(null)

  const sections = [
    { type: "REFERRAL", label: "Referrals", icon: "📋", props: referralProps },
    { type: "PROVIDER", label: "Providers", icon: "👨‍⚕️", props: providerProps },
    { type: "PRACTICE", label: "Practices", icon: "🏥", props: practiceProps },
  ]

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <div key={section.type} className="border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">{section.icon}</span>
              <h2 className="text-lg font-semibold text-slate-800">{section.label}</h2>
              <span className="text-sm text-slate-400">({section.props.length})</span>
            </div>
            <button
              onClick={() => setActiveForm(activeForm === section.type ? null : section.type)}
              className="h-8 px-3 flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              {activeForm === section.type ? (
                <>
                  <X className="h-4 w-4" /> Close
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" /> Add Property
                </>
              )}
            </button>
          </div>

          {activeForm === section.type && (
            <PropertyForm
              entityType={section.type}
              onClose={() => setActiveForm(null)}
            />
          )}

          <PropertyList entityType={section.type} properties={section.props} />
        </div>
      ))}
    </div>
  )
}
