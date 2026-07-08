"use client"

import { useState, useTransition } from "react"
import { updateDoctorField } from "@/app/actions/referring-doctors"
import { Input } from "@/components/ui/input"
import { PhoneInput } from "@/components/ui/phone-input"
import { Save, X, ChevronDown } from "lucide-react"
import { cn, formatPhone } from "@/lib/utils"

interface Doctor {
  id: string
  name: string
  title: string | null
  npi: string | null
  specialty: string | null
  phone: string | null
  officePhone: string | null
  email: string | null
  practiceId: string
  practiceName: string
}

interface Props {
  selectedDoctors: Doctor[]
  onUpdateDoctor?: (id: string, updates: Partial<Doctor>) => void
}

export default function SelectedProvidersCard({ selectedDoctors, onUpdateDoctor }: Props) {
  const [isPending, startTransition] = useTransition()
  const [expandedDoctorId, setExpandedDoctorId] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<{ doctorId: string; field: string } | null>(null)
  const [editValue, setEditValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  // Optimistic overrides so saved values display immediately
  const [overrides, setOverrides] = useState<Record<string, Partial<Doctor>>>({})

  if (selectedDoctors.length === 0) return null

  const handleStartEdit = (doctorId: string, field: string, currentValue: string) => {
    if (isPending) return
    setEditingField({ doctorId, field })
    setEditValue(currentValue || "")
    setError(null)
  }

  const handleSaveField = (doctor: Doctor, field: string) => {
    startTransition(async () => {
      const result = await updateDoctorField(doctor.id, field, editValue || null)

      if (result?.error) {
        setError(typeof result.error === "string" ? result.error : "Failed to save")
        return
      }

      const updates = { [field]: editValue.trim() || null } as Partial<Doctor>
      setOverrides((prev) => ({
        ...prev,
        [doctor.id]: { ...prev[doctor.id], ...updates },
      }))
      onUpdateDoctor?.(doctor.id, updates)
      setEditingField(null)
      setEditValue("")
      setError(null)
    })
  }

  const handleCancel = () => {
    setEditingField(null)
    setEditValue("")
    setError(null)
  }

  const fieldLabels: Record<string, string> = {
    name: "Name",
    title: "Title",
    npi: "NPI",
    phone: "Cell Phone",
    officePhone: "Office Phone",
    email: "Email",
  }

  const displayFields = ["name", "title", "npi", "phone", "officePhone", "email"] as const

  return (
    <div className="space-y-3 border border-slate-200 rounded-lg bg-slate-50 p-4">
      <h4 className="font-medium text-sm text-slate-900">Provider Details</h4>

      <div className="space-y-3">
        {selectedDoctors.map((rawDoctor) => {
          const doctor = { ...rawDoctor, ...overrides[rawDoctor.id] }
          return (
            <div key={doctor.id} className="border border-slate-200 rounded-lg bg-white overflow-hidden">
              {/* Header */}
              <button
                onClick={() => setExpandedDoctorId(expandedDoctorId === doctor.id ? null : doctor.id)}
                className="w-full flex items-center justify-between p-3 hover:bg-slate-50 transition-colors"
              >
                <div className="text-left">
                  <p className="font-medium text-sm text-slate-900">{doctor.name}</p>
                  {(() => {
                    const subtitleParts = [
                      doctor.title,
                      doctor.npi ? `NPI ${doctor.npi}` : null,
                      doctor.phone ? formatPhone(doctor.phone) : null,
                      doctor.email,
                    ].filter(Boolean)
                    return subtitleParts.length > 0 ? (
                      <p className="text-xs text-slate-500">{subtitleParts.join(" · ")}</p>
                    ) : null
                  })()}
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-slate-400 transition-transform",
                    expandedDoctorId === doctor.id ? "rotate-180" : ""
                  )}
                />
              </button>

              {/* Expanded content */}
              {expandedDoctorId === doctor.id && (
                <div className="border-t border-slate-200 p-3 space-y-2.5 bg-slate-50">
                  {displayFields.map((field) => {
                    const isEditing =
                      editingField?.doctorId === doctor.id && editingField?.field === field
                    const value = doctor[field as keyof Doctor] || ""

                    return (
                      <div
                        key={field}
                        className="flex items-center justify-between gap-2 py-1.5 group hover:bg-white rounded px-1.5 transition-colors"
                      >
                        <label className="text-xs font-medium text-slate-600 w-16 shrink-0">
                          {fieldLabels[field]}
                        </label>

                        {isEditing ? (
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-1.5">
                              {field === "phone" || field === "officePhone" ? (
                                <div
                                  className="flex-1"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault()
                                      handleSaveField(doctor, field)
                                    } else if (e.key === "Escape") {
                                      handleCancel()
                                    }
                                  }}
                                >
                                  <PhoneInput
                                    value={editValue}
                                    onChange={setEditValue}
                                    disabled={isPending}
                                    className="h-8 text-sm"
                                  />
                                </div>
                              ) : (
                              <Input
                                autoFocus
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault()
                                    handleSaveField(doctor, field)
                                  } else if (e.key === "Escape") {
                                    handleCancel()
                                  }
                                }}
                                className="h-8 text-sm"
                                placeholder={fieldLabels[field]}
                                disabled={isPending}
                              />
                              )}
                              <button
                                onClick={() => handleSaveField(doctor, field)}
                                disabled={isPending}
                                className="p-1.5 hover:bg-blue-100 text-blue-600 rounded transition-colors disabled:opacity-50"
                                title="Save (Enter)"
                              >
                                <Save className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={handleCancel}
                                disabled={isPending}
                                className="p-1.5 hover:bg-slate-200 text-slate-600 rounded transition-colors"
                                title="Cancel (Esc)"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            {error && <p className="text-xs text-red-600">{error}</p>}
                          </div>
                        ) : (
                          <button
                            onClick={() => handleStartEdit(doctor.id, field, String(value))}
                            className="flex-1 text-left text-sm text-slate-700 cursor-text rounded px-1 py-0.5 -mx-1 hover:bg-blue-50/70 hover:ring-1 hover:ring-blue-200 transition-colors"
                            title={`Click to edit ${fieldLabels[field]}`}
                          >
                            {value ? (field === "phone" || field === "officePhone" ? formatPhone(String(value)) : value) : <span className="text-slate-400">—</span>}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-xs text-slate-500 italic">
        💡 Click a field to edit it — press Enter to save, Esc to cancel
      </p>
    </div>
  )
}
