"use client"

import { useState, useTransition } from "react"
import { updateDoctor } from "@/app/actions/referring-doctors"
import { Input } from "@/components/ui/input"
import { Edit2, Save, X, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface Doctor {
  id: string
  name: string
  title: string | null
  npi: string | null
  specialty: string | null
  phone: string | null
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

  if (selectedDoctors.length === 0) return null

  const handleStartEdit = (doctorId: string, field: string, currentValue: string) => {
    setEditingField({ doctorId, field })
    setEditValue(currentValue || "")
  }

  const handleSaveField = (doctor: Doctor, field: string) => {
    const updates: any = { [field]: editValue || null }

    startTransition(async () => {
      const result = await updateDoctor(doctor.id, {
        ...doctor,
        ...updates,
      })

      if (!result?.error) {
        onUpdateDoctor?.(doctor.id, updates)
        setEditingField(null)
        setEditValue("")
      }
    })
  }

  const handleCancel = () => {
    setEditingField(null)
    setEditValue("")
  }

  const fieldLabels: Record<string, string> = {
    name: "Name",
    title: "Title",
    npi: "NPI",
    specialty: "Specialty",
    phone: "Phone",
    email: "Email",
  }

  const displayFields = ["name", "title", "npi", "specialty", "phone", "email"] as const

  return (
    <div className="space-y-3 border border-slate-200 rounded-lg bg-slate-50 p-4">
      <h4 className="font-medium text-sm text-slate-900">Provider Details</h4>

      <div className="space-y-3">
        {selectedDoctors.map((doctor) => (
          <div key={doctor.id} className="border border-slate-200 rounded-lg bg-white overflow-hidden">
            {/* Header */}
            <button
              onClick={() => setExpandedDoctorId(expandedDoctorId === doctor.id ? null : doctor.id)}
              className="w-full flex items-center justify-between p-3 hover:bg-slate-50 transition-colors"
            >
              <div className="text-left">
                <p className="font-medium text-sm text-slate-900">{doctor.name}</p>
                {doctor.title && <p className="text-xs text-slate-500">{doctor.title}</p>}
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
                      <label className="text-xs font-medium text-slate-600 w-16">
                        {fieldLabels[field]}
                      </label>

                      {isEditing ? (
                        <div className="flex items-center gap-1.5 flex-1">
                          <Input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="h-8 text-sm"
                            placeholder={fieldLabels[field]}
                          />
                          <button
                            onClick={() => handleSaveField(doctor, field)}
                            disabled={isPending}
                            className="p-1.5 hover:bg-blue-100 text-blue-600 rounded transition-colors"
                            title="Save"
                          >
                            <Save className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={handleCancel}
                            disabled={isPending}
                            className="p-1.5 hover:bg-slate-200 text-slate-600 rounded transition-colors"
                            title="Cancel"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2 flex-1">
                          <span className="text-sm text-slate-700">
                            {value || "—"}
                          </span>
                          <button
                            onClick={() =>
                              handleStartEdit(doctor.id, field, String(value))
                            }
                            disabled={isPending}
                            className="p-1 hover:bg-blue-100 text-blue-600 rounded transition-colors opacity-0 group-hover:opacity-100"
                            title={`Edit ${fieldLabels[field]}`}
                          >
                            <Edit2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-500 italic">
        💡 Click a provider to expand and edit their details inline
      </p>
    </div>
  )
}
