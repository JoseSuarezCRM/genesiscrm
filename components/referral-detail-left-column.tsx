"use client"

import { useState, useEffect, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Settings, Plus, Check, X, ChevronUp, ChevronDown } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ReferralStatus } from "@prisma/client"
import { STATUS_LABELS, formatDate, formatPhone } from "@/lib/utils"
import { updateReferralStatus, updateReferralField } from "@/app/actions/referrals"
import ReferralAssignee from "@/components/referral-assignee"
import TagSelector from "@/components/tag-selector"
import LeftCardEditorModal from "@/components/left-card-editor-modal"
import { replaceColumnCards } from "@/app/actions/record-card-actions"
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
  canEditCards?: boolean
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
    <div className="py-2.5 border-b border-slate-100 last:border-0">
      <span className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-0.5">
        {label}
      </span>
      {href ? (
        <Link
          href={href}
          className={`block text-sm text-blue-600 hover:text-blue-700 hover:underline ${bold ? "font-semibold" : ""}`}
        >
          {value ?? "—"}
        </Link>
      ) : (
        <span className={`block text-sm text-slate-900 ${bold ? "font-semibold" : ""}`}>
          {value ?? <span className="text-slate-400">—</span>}
        </span>
      )}
    </div>
  )
}

function EditableRow({
  referralId,
  field,
  label,
  value,
  type = "text",
  format,
}: {
  referralId: string
  field: string
  label: string
  value: any
  type?: "text" | "date"
  format?: (v: any) => string | null
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [current, setCurrent] = useState<any>(value)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Sync with fresh server data after revalidation
  useEffect(() => { setCurrent(value) }, [value])

  const display = current != null && current !== ""
    ? (format ? format(current) : String(current))
    : null

  const startEdit = () => {
    if (type === "date") {
      setDraft(current ? new Date(current).toISOString().split("T")[0] : "")
    } else {
      setDraft(current != null ? String(current) : "")
    }
    setError(null)
    setEditing(true)
  }

  const save = () => {
    startTransition(async () => {
      const res = await updateReferralField(referralId, field, draft || null)
      if (res?.error) {
        setError(typeof res.error === "string" ? res.error : "Failed to save")
        return
      }
      setCurrent(draft || null)
      setEditing(false)
    })
  }

  if (editing) {
    return (
      <div className="py-2.5 border-b border-slate-100 last:border-0 space-y-1.5">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
          {label}
        </span>
        <div className="flex items-center gap-1">
          <input
            autoFocus
            type={type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                save()
              } else if (e.key === "Escape") {
                setEditing(false)
              }
            }}
            disabled={isPending}
            className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 disabled:opacity-50"
          />
          <button
            onClick={save}
            disabled={isPending}
            className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
            title="Save (Enter)"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            onClick={() => setEditing(false)}
            disabled={isPending}
            className="p-1 text-slate-400 hover:bg-slate-100 rounded"
            title="Cancel (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    )
  }

  return (
    <div className="py-2.5 border-b border-slate-100 last:border-0">
      <span className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-0.5">
        {label}
      </span>
      <button
        onClick={startEdit}
        className="block w-full text-left text-sm text-slate-900 cursor-text rounded px-1 -mx-1 py-0.5 hover:bg-blue-50/70 hover:ring-1 hover:ring-blue-200 transition-colors"
        title={`Click to edit ${label}`}
      >
        {display ?? <span className="text-slate-400">—</span>}
      </button>
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
  canEditCards = isAdmin,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingCard, setEditingCard] = useState<CardLayout | null>(null)

  const openEditor = (card: CardLayout | null) => {
    setEditingCard(card)
    setEditorOpen(true)
  }

  // The default cards, expressed as field-based cards so they go through the same
  // renderer (and become reorderable) instead of hardcoded JSX.
  const DEFAULT_CARDS: CardLayout[] = [
    { cardName: "status", title: "Status", fields: ["status"] },
    { cardName: "assigned", title: "Assigned To", fields: ["assignedTo"] },
    { cardName: "tags", title: "Tags", fields: ["tags"] },
    { cardName: "patient", title: "Patient", fields: ["mrn", "dob", "patientPhone", "patientEmail"] },
    { cardName: "source", title: "Source", fields: ["practice", "provider", "npi"] },
  ]
  const effectiveCards = leftCards.length ? leftCards : DEFAULT_CARDS

  // Reorder persists the whole column (materializing the defaults on first move).
  function move(index: number, dir: -1 | 1) {
    const next = [...effectiveCards]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    startTransition(async () => {
      await replaceColumnCards("REFERRAL", "LEFT", next.map((c) => ({ cardName: c.cardName, title: c.title, fields: c.fields })))
      router.refresh()
    })
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
        return <EditableRow key={fieldId} referralId={referral.id} field="genesisMrn" label="Genesis MRN" value={referral.genesisMrn} />
      case "patientMrn":
        return <EditableRow key={fieldId} referralId={referral.id} field="patientMrn" label="Patient MRN" value={referral.patientMrn} />
      case "dob":
        return <EditableRow key={fieldId} referralId={referral.id} field="patientDob" label="DOB" value={referral.patientDob} type="date" format={formatDate} />
      case "patientPhone":
        return <EditableRow key={fieldId} referralId={referral.id} field="patientPhone" label="Patient Phone" value={referral.patientPhone} format={formatPhone} />
      case "patientEmail":
        return <EditableRow key={fieldId} referralId={referral.id} field="patientEmail" label="Patient Email" value={referral.patientEmail} />
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
        return <EditableRow key={fieldId} referralId={referral.id} field="referringNpi" label="NPI" value={referral.referringNpi ?? referral.referringDoctor?.npi} />
      case "location":
        return <PropertyRow key={fieldId} label="Location" value={referral.referringLocation?.name} />
      case "insurance":
        return <EditableRow key={fieldId} referralId={referral.id} field="insuranceProvider" label="Insurance" value={referral.insuranceProvider} />
      case "pipeline":
        return <PropertyRow key={fieldId} label="Pipeline" value={referral.pipeline?.name} />
      case "referralDate":
        return <EditableRow key={fieldId} referralId={referral.id} field="referralDate" label="Referral Date" value={referral.referralDate} type="date" format={formatDate} />
      case "appointmentDate":
        return <EditableRow key={fieldId} referralId={referral.id} field="appointmentDate" label="Appointment Date" value={referral.appointmentDate} type="date" format={formatDate} />
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
      {canEditCards && (
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

      {effectiveCards.map((card, index) => (
        <Card key={card.cardName}>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">{card.title}</CardTitle>
            {canEditCards && (
              <div className="flex items-center gap-0.5 text-slate-300">
                <button onClick={() => move(index, -1)} disabled={index === 0} title="Move up"
                  className="hover:text-slate-600 disabled:opacity-30 disabled:hover:text-slate-300"><ChevronUp className="h-3.5 w-3.5" /></button>
                <button onClick={() => move(index, 1)} disabled={index === effectiveCards.length - 1} title="Move down"
                  className="hover:text-slate-600 disabled:opacity-30 disabled:hover:text-slate-300"><ChevronDown className="h-3.5 w-3.5" /></button>
                <button onClick={() => openEditor(card)} className="hover:text-slate-600 ml-0.5" title="Customize card">
                  <Settings className="h-4 w-4" />
                </button>
              </div>
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
      ))}

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
