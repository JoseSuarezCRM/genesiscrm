"use client"

import { useState } from "react"
import Link from "next/link"
import { Settings } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { STATUS_LABELS } from "@/lib/utils"
import { ReferralStatus } from "@prisma/client"
import CardCustomizationModal from "@/components/card-customization-modal"
import { formatDate, formatPhone } from "@/lib/utils"

interface CardLayout {
  entityType: string
  cardName: string
  title: string
  fields: string[]
  visible?: boolean
}

interface Props {
  referral: any
  referralCardLayout: CardLayout
  practiceCardLayout: CardLayout
  providerCardLayout: CardLayout
}

function getFieldValue(obj: any, path: string): any {
  return path.split(".").reduce((curr, prop) => curr?.[prop], obj)
}

export default function ReferralDetailRightColumn({
  referral,
  referralCardLayout,
  practiceCardLayout,
  providerCardLayout,
}: Props) {
  const [customizationOpen, setCustomizationOpen] = useState(false)
  const [editingCardName, setEditingCardName] = useState<string | null>(null)
  const [layouts, setLayouts] = useState([
    referralCardLayout,
    practiceCardLayout,
    providerCardLayout,
  ])

  const handleOpenCustomization = (cardName: string) => {
    setEditingCardName(cardName)
    setCustomizationOpen(true)
  }

  const handleUpdateLayout = (updatedLayout: CardLayout) => {
    setLayouts((prev) =>
      prev.map((l) => (l.cardName === updatedLayout.cardName ? updatedLayout : l))
    )
  }

  // Get the current layout for each card
  const currentReferralLayout = layouts.find((l) => l.cardName === "Referral") || referralCardLayout
  const currentPracticeLayout = layouts.find((l) => l.cardName === "Practice") || practiceCardLayout
  const currentProviderLayout = layouts.find((l) => l.cardName === "Provider") || providerCardLayout
  const currentEditingLayout = layouts.find((l) => l.cardName === editingCardName) || currentReferralLayout

  function PropertyRow({
    label,
    value,
    href,
  }: {
    label: string
    value: string | null | undefined
    href?: string
  }) {
    return (
      <div className="flex justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
          {label}
        </span>
        {href ? (
          <Link
            href={href}
            className="text-sm text-blue-600 hover:text-blue-700 hover:underline text-right"
          >
            {value ?? "—"}
          </Link>
        ) : (
          <span className="text-sm text-slate-900 text-right">{value ?? "—"}</span>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="lg:col-span-1 space-y-4">
        {/* Referral Info Card */}
        {currentReferralLayout.visible !== false && (
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">{currentReferralLayout.title}</CardTitle>
              <button
                onClick={() => handleOpenCustomization("Referral")}
                className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                title="Customize card"
              >
                <Settings className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-0 text-sm">
              {currentReferralLayout.fields.length > 0 ? (
                currentReferralLayout.fields.map((fieldId: string) => {
                  const fieldMap: Record<
                    string,
                    { label: string; path: string; formatter?: (val: any) => string }
                  > = {
                    status: {
                      label: "Status",
                      path: "status",
                      formatter: (val: any) =>
                        typeof val === "string"
                          ? STATUS_LABELS[val as ReferralStatus] || val
                          : val,
                    },
                    pipeline: { label: "Pipeline", path: "pipeline.name" },
                    location: { label: "Location", path: "referringLocation.name" },
                    insurance: { label: "Insurance", path: "insuranceProvider" },
                    appointmentDate: {
                      label: "Appointment Date",
                      path: "appointmentDate",
                      formatter: formatDate,
                    },
                    referralDate: {
                      label: "Referral Date",
                      path: "referralDate",
                      formatter: formatDate,
                    },
                  }
                  const field = fieldMap[fieldId]
                  if (!field) return null
                  let value = getFieldValue(referral, field.path)
                  if (field.formatter) value = field.formatter(value)
                  return (
                    <PropertyRow key={fieldId} label={field.label} value={value} />
                  )
                })
              ) : (
                <p className="text-xs text-slate-400 py-2">
                  No fields configured. Click the settings icon to customize.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Practice Info Card */}
        {currentPracticeLayout.visible !== false && referral.referringPractice && (
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">{currentPracticeLayout.title}</CardTitle>
              <button
                onClick={() => handleOpenCustomization("Practice")}
                className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                title="Customize card"
              >
                <Settings className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-0 text-sm">
              {currentPracticeLayout.fields.length > 0 &&
              referral.referringPractice ? (
                currentPracticeLayout.fields.map((fieldId: string) => {
                  const fieldMap: Record<string, { label: string; path: string }> = {
                    name: { label: "Name", path: "referringPractice.name" },
                    phone: { label: "Phone", path: "referringPractice.phone" },
                    fax: { label: "Fax", path: "referringPractice.fax" },
                    address: { label: "Address", path: "referringPractice.address" },
                    city: { label: "City", path: "referringPractice.city" },
                    state: { label: "State", path: "referringPractice.state" },
                  }
                  const field = fieldMap[fieldId]
                  if (!field) return null
                  const value = getFieldValue(referral, field.path)
                  const formatted =
                    fieldId === "phone" ? formatPhone(value) : value
                  const practice = referral.referringPractice
                  return (
                    <PropertyRow
                      key={fieldId}
                      label={field.label}
                      value={formatted}
                      href={
                        fieldId === "name" && practice
                          ? `/practices/${practice.id}`
                          : undefined
                      }
                    />
                  )
                })
              ) : (
                <p className="text-xs text-slate-400 py-2">
                  No fields configured. Click the settings icon to customize.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Provider Info Card */}
        {currentProviderLayout.visible !== false && referral.referringDoctor && (
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">{currentProviderLayout.title}</CardTitle>
              <button
                onClick={() => handleOpenCustomization("Provider")}
                className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                title="Customize card"
              >
                <Settings className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-0 text-sm">
              {currentProviderLayout.fields.length > 0 &&
              referral.referringDoctor ? (
                currentProviderLayout.fields.map((fieldId: string) => {
                  const fieldMap: Record<string, { label: string; path: string }> = {
                    name: { label: "Name", path: "referringDoctor.name" },
                    specialty: { label: "Specialty", path: "referringDoctor.specialty" },
                    npi: { label: "NPI", path: "referringDoctor.npi" },
                    phone: { label: "Phone", path: "referringDoctor.phone" },
                    email: { label: "Email", path: "referringDoctor.email" },
                    title: { label: "Title", path: "referringDoctor.title" },
                  }
                  const field = fieldMap[fieldId]
                  if (!field) return null
                  const value = getFieldValue(referral, field.path)
                  const formatted =
                    fieldId === "phone" ? formatPhone(value) : value
                  const doctor = referral.referringDoctor
                  return (
                    <PropertyRow
                      key={fieldId}
                      label={field.label}
                      value={formatted}
                      href={
                        fieldId === "name" && doctor
                          ? `/providers/${doctor.id}`
                          : undefined
                      }
                    />
                  )
                })
              ) : (
                <p className="text-xs text-slate-400 py-2">
                  No fields configured. Click the settings icon to customize.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Customization Modal */}
      {editingCardName && (
        <CardCustomizationModal
          open={customizationOpen}
          onOpenChange={(open) => {
            setCustomizationOpen(open)
            if (!open) setEditingCardName(null)
          }}
          entityType="REFERRAL"
          cardName={editingCardName}
          currentLayout={currentEditingLayout}
          onUpdate={handleUpdateLayout}
        />
      )}
    </>
  )
}
