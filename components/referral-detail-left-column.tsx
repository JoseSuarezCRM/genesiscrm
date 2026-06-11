"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Settings, Plus } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ReferralStatus } from "@prisma/client"
import { STATUS_LABELS, formatDate, formatPhone } from "@/lib/utils"
import { updateReferralStatus } from "@/app/actions/referrals"
import ReferralAssignee from "@/components/referral-assignee"
import TagSelector from "@/components/tag-selector"
import LeftCardEditorModal from "@/components/left-card-editor-modal"
import CustomPropertyField from "@/components/custom-property-field"

interface CardLayout {
  cardName: string
  title: string
  fields: string[]
}

interface Props {
  referral: any
  users: { id: string; name: string | null; email: string }[]
  allTags: any[]
  leftCards: CardLayout[]
  customProperties: any[]
  isAdmin: boolean
}

function PropertyRow({
  label,
  value,
  href,
  bold,
}: {
  label: string
  value: string | null | undefined
  href?: string
  bold?: boolean
}) {
  return (
    <div className="flex justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
        {label}
      </span>
      {href ? (
        <Link
          href={href}
          className={`text-sm text-blue-600 hover:text-blue-700 hover:underline text-right ${bold ? "font-semibold" : ""}`}
        >
          {value ?? "—"}
        </Link>
      ) : (
        <span className={`text-sm text-slate-900 text-right ${bold ? "font-semibold" : ""}`}>
          {value ?? "—"}
        </span>
      )}
    </div>
  )
}

function StatusButtons({ referral }: { referral: any }) {
  const [isPending, startTransition] = useTransition()
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {Object.values(ReferralStatus).map((s) => (
        <Button
          key={s}
          size="sm"
          variant={referral.status === s ? "default" : "outline"}
          className="w-full text-xs"
          disabled={isPending}
          onClick={() => startTransition(async () => { await updateReferralStatus(referral.id, s) })}
        >
          {STATUS_LABELS[s]}
        </Button>
      ))}
    </div>
  )
}

function WidgetBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2.5 border-b border-slate-100 last:border-0 space-y-2">
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
        {label}
      </span>
      {children}
    </div>
  )
}

export default function ReferralDetailLeftColumn({
  referral,
  users,
  allTags,
  leftCards,
  customProperties,
  isAdmin,
}: Props) {
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingCard, setEditingCard] = useState<CardLayout | null>(null)

  const openEditor = (card: CardLayout | null) => {
    setEditingCard(card)
    setEditorOpen(true)
  }

  const providerName = referral.referringDoctor
    ? [referral.referringDoctor.title, referral.referringDoctor.name].filter(Boolean).join(" ")
    : referral.referringDoctorName

  const renderField = (fieldId: string) => {
    if (fieldId.startsWith("custom:")) {
      const propertyId = fieldId.slice("custom:".length)
      const property = customProperties.find((p) => p.id === propertyId)
      if (!property) return null
      return (
        <CustomPropertyField
          key={fieldId}
          entityType="REFERRAL"
          entityId={referral.id}
          property={property}
        />
      )
    }
    switch (fieldId) {
      case "status":
        return (
          <WidgetBlock key={fieldId} label="Status">
            <StatusButtons referral={referral} />
          </WidgetBlock>
        )
      case "assignedTo":
        return (
          <WidgetBlock key={fieldId} label="Assigned To">
            <ReferralAssignee
              referralId={referral.id}
              assignedTo={referral.assignedTo}
              users={users}
            />
          </WidgetBlock>
        )
      case "tags":
        return (
          <WidgetBlock key={fieldId} label="Tags">
            <TagSelector
              referralId={referral.id}
              allTags={allTags}
              selectedTagIds={referral.tags.map((t: any) => t.tagId)}
            />
          </WidgetBlock>
        )
      case "mrn":
        return <PropertyRow key={fieldId} label="MRN" value={referral.genesisMrn} />
      case "dob":
        return <PropertyRow key={fieldId} label="DOB" value={formatDate(referral.patientDob)} />
      case "patientPhone":
        return <PropertyRow key={fieldId} label="Patient Phone" value={formatPhone(referral.patientPhone)} />
      case "patientEmail":
        return <PropertyRow key={fieldId} label="Patient Email" value={referral.patientEmail} />
      case "practice":
        return (
          <PropertyRow
            key={fieldId}
            label="Practice"
            value={referral.referringPractice?.name}
            href={referral.referringPractice ? `/practices/${referral.referringPractice.id}` : undefined}
            bold
          />
        )
      case "provider":
        return (
          <PropertyRow
            key={fieldId}
            label="Provider"
            value={providerName}
            href={referral.referringDoctor ? `/referring-doctors/${referral.referringDoctor.id}` : undefined}
            bold
          />
        )
      case "npi":
        return <PropertyRow key={fieldId} label="NPI" value={referral.referringNpi ?? referral.referringDoctor?.npi} />
      case "location":
        return <PropertyRow key={fieldId} label="Location" value={referral.referringLocation?.name} />
      case "insurance":
        return <PropertyRow key={fieldId} label="Insurance" value={referral.insuranceProvider} />
      case "pipeline":
        return <PropertyRow key={fieldId} label="Pipeline" value={referral.pipeline?.name} />
      case "referralDate":
        return <PropertyRow key={fieldId} label="Referral Date" value={formatDate(referral.referralDate)} />
      case "appointmentDate":
        return <PropertyRow key={fieldId} label="Appointment Date" value={formatDate(referral.appointmentDate)} />
      case "createdBy":
        return <PropertyRow key={fieldId} label="Created By" value={referral.createdBy?.name || referral.createdBy?.email} />
      case "createdAt":
        return <PropertyRow key={fieldId} label="Created Date" value={formatDate(referral.createdAt)} />
      default:
        return null
    }
  }

  return (
    <>
      {isAdmin && (
        <div className="flex justify-end">
          <button
            onClick={() => openEditor(null)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
            title="Create a new card"
          >
            <Plus className="h-3.5 w-3.5" /> Add card
          </button>
        </div>
      )}

      {leftCards.length === 0 ? (
        <>
          {/* Default cards (shown until an admin creates custom cards) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <StatusButtons referral={referral} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Assigned To</CardTitle>
            </CardHeader>
            <CardContent>
              <ReferralAssignee referralId={referral.id} assignedTo={referral.assignedTo} users={users} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Tags</CardTitle>
            </CardHeader>
            <CardContent>
              <TagSelector
                referralId={referral.id}
                allTags={allTags}
                selectedTagIds={referral.tags.map((t: any) => t.tagId)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Patient</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <PropertyRow label="MRN" value={referral.genesisMrn} />
              <PropertyRow label="DOB" value={formatDate(referral.patientDob)} />
              <PropertyRow label="Phone" value={formatPhone(referral.patientPhone)} />
              <PropertyRow label="Email" value={referral.patientEmail} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Source</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <PropertyRow
                label="Practice"
                value={referral.referringPractice?.name}
                href={referral.referringPractice ? `/practices/${referral.referringPractice.id}` : undefined}
                bold
              />
              <PropertyRow
                label="Provider"
                value={providerName}
                href={referral.referringDoctor ? `/referring-doctors/${referral.referringDoctor.id}` : undefined}
                bold
              />
              <PropertyRow label="NPI" value={referral.referringNpi ?? referral.referringDoctor?.npi} />
            </CardContent>
          </Card>
        </>
      ) : (
        /* Custom cards */
        leftCards.map((card) => (
          <Card key={card.cardName}>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">{card.title}</CardTitle>
              {isAdmin && (
                <button
                  onClick={() => openEditor(card)}
                  className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                  title="Customize card"
                >
                  <Settings className="h-4 w-4" />
                </button>
              )}
            </CardHeader>
            <CardContent className="space-y-0 text-sm">
              {card.fields.length > 0 ? (
                card.fields.map((fieldId) => renderField(fieldId))
              ) : (
                <p className="text-xs text-slate-400 py-2">
                  No properties selected. Click the settings icon to customize.
                </p>
              )}
            </CardContent>
          </Card>
        ))
      )}

      {editorOpen && (
        <LeftCardEditorModal
          open={editorOpen}
          onOpenChange={setEditorOpen}
          entityType="REFERRAL"
          existing={editingCard}
          customProperties={customProperties.map((p) => ({ id: p.id, name: p.name }))}
        />
      )}
    </>
  )
}
