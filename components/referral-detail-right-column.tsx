"use client"

import { useState, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Settings, SlidersHorizontal, GripVertical } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { STATUS_LABELS } from "@/lib/utils"
import { ReferralStatus } from "@prisma/client"
import CardCustomizationModal from "@/components/card-customization-modal"
import { setCardVisibility, reorderRightCards } from "@/app/actions/card-layouts"
import { useCardReorder } from "@/components/use-card-reorder"
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
  isAdmin: boolean
  canEditCards?: boolean
}

function getFieldValue(obj: any, path: string): any {
  return path.split(".").reduce((curr, prop) => curr?.[prop], obj)
}

function CardsVisibilityModal({
  open,
  onOpenChange,
  layouts,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  layouts: CardLayout[]
  onSaved: (visibility: Record<string, boolean>) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [visibility, setVisibility] = useState<Record<string, boolean>>(
    Object.fromEntries(layouts.map((l) => [l.cardName, l.visible !== false]))
  )

  const handleSave = () => {
    startTransition(async () => {
      for (const layout of layouts) {
        const next = visibility[layout.cardName]
        if (next !== (layout.visible !== false)) {
          await setCardVisibility(
            layout.entityType as any,
            layout.cardName,
            layout.title,
            next
          )
        }
      }
      onSaved(visibility)
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Associated Cards</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-4">
          <p className="text-xs text-slate-500">
            Choose which cards appear in this column on all referrals.
          </p>
          {layouts.map((layout) => (
            <div key={layout.cardName} className="flex items-center gap-2">
              <Checkbox
                id={`card-visible-${layout.cardName}`}
                checked={visibility[layout.cardName]}
                onCheckedChange={(checked) =>
                  setVisibility((prev) => ({ ...prev, [layout.cardName]: checked === true }))
                }
              />
              <label
                htmlFor={`card-visible-${layout.cardName}`}
                className="text-sm text-slate-700 cursor-pointer flex-1"
              >
                {layout.title}
              </label>
            </div>
          ))}
        </div>
        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function ReferralDetailRightColumn({
  referral,
  referralCardLayout,
  practiceCardLayout,
  providerCardLayout,
  isAdmin,
  canEditCards = isAdmin,
}: Props) {
  const [customizationOpen, setCustomizationOpen] = useState(false)
  const [cardsModalOpen, setCardsModalOpen] = useState(false)
  const [editingCardName, setEditingCardName] = useState<string | null>(null)
  const [layouts, setLayouts] = useState([
    referralCardLayout,
    practiceCardLayout,
    providerCardLayout,
  ])

  const router = useRouter()
  const [, startReorder] = useTransition()

  // Update layouts when props change (e.g., when opening a different referral)
  useEffect(() => {
    setLayouts([referralCardLayout, practiceCardLayout, providerCardLayout])
  }, [referralCardLayout, practiceCardLayout, providerCardLayout])

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
  const getLayoutByCardName = (cardName: string): CardLayout => {
    switch (cardName) {
      case "Referral":
        return layouts[0] || referralCardLayout
      case "Practice":
        return layouts[1] || practiceCardLayout
      case "Provider":
        return layouts[2] || providerCardLayout
      default:
        return referralCardLayout
    }
  }

  const currentReferralLayout = getLayoutByCardName("Referral")
  const currentPracticeLayout = getLayoutByCardName("Practice")
  const currentProviderLayout = getLayoutByCardName("Provider")
  const currentEditingLayout = editingCardName ? getLayoutByCardName(editingCardName) : referralCardLayout

  // Drag-and-drop card order. Cards lay out via CSS `order` (no JSX moved).
  const orderedNames = [referralCardLayout, practiceCardLayout, providerCardLayout]
    .map((l, i) => ({ name: l.cardName, o: (l as any).order ?? i }))
    .sort((a, b) => a.o - b.o)
    .map((x) => ({ cardName: x.name }))
  const dnd = useCardReorder(orderedNames, (c) => c.cardName, (names) => {
    startReorder(async () => {
      await reorderRightCards("REFERRAL", names.map((n) => {
        const l = getLayoutByCardName(n)
        return { cardName: n, title: l.title, fields: l.fields, visible: l.visible !== false }
      }))
      router.refresh()
    })
  })
  const orderOf = (name: string) => { const i = dnd.order.findIndex((c) => c.cardName === name); return i < 0 ? 99 : i }

  // Drag handle + gear for a card header.
  const HeaderControls = ({ name }: { name: string }) => (
    <div className="flex items-center gap-1 text-slate-300">
      <span {...dnd.handleProps(name)} title="Drag to reorder" className="hover:text-slate-500">
        <GripVertical className="h-4 w-4" />
      </span>
      <button onClick={() => handleOpenCustomization(name)} className="hover:text-slate-600" title="Customize card">
        <Settings className="h-4 w-4" />
      </button>
    </div>
  )

  // Shows only the value (HubSpot-style association card); label kept as hover tooltip
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
      <div className="py-1.5 border-b border-slate-100 last:border-0" title={label}>
        {href ? (
          <Link
            href={href}
            className="block text-sm font-semibold text-blue-600 hover:text-blue-700 hover:underline"
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

  return (
    <>
      <div className="lg:col-span-1 flex flex-col gap-4 lg:overflow-y-auto lg:pr-1">
        {canEditCards && (
          <div className="flex justify-end" style={{ order: -1 }}>
            <button
              onClick={() => setCardsModalOpen(true)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
              title="Choose which cards appear"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" /> Customize cards
            </button>
          </div>
        )}

        {/* Referral Info Card */}
        {currentReferralLayout.visible !== false && (
          <Card style={{ order: orderOf("Referral") }} {...dnd.cardProps("Referral")} className={dnd.dragging === "Referral" ? "opacity-50 ring-2 ring-zinc-300" : undefined}>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">{currentReferralLayout.title}</CardTitle>
              {canEditCards && <HeaderControls name="Referral" />}
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
        {currentPracticeLayout.visible !== false && (
          <Card style={{ order: orderOf("Practice") }} {...dnd.cardProps("Practice")} className={dnd.dragging === "Practice" ? "opacity-50 ring-2 ring-zinc-300" : undefined}>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">{currentPracticeLayout.title}</CardTitle>
              {canEditCards && <HeaderControls name="Practice" />}
            </CardHeader>
            <CardContent className="space-y-0 text-sm">
              {!referral.referringPractice ? (
                <p className="text-xs text-slate-400 py-3">No practice assigned</p>
              ) : currentPracticeLayout.fields.length > 0 ? (
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
                      bold={fieldId === "name"}
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
        {currentProviderLayout.visible !== false && (
          <Card style={{ order: orderOf("Provider") }} {...dnd.cardProps("Provider")} className={dnd.dragging === "Provider" ? "opacity-50 ring-2 ring-zinc-300" : undefined}>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">{currentProviderLayout.title}</CardTitle>
              {canEditCards && <HeaderControls name="Provider" />}
            </CardHeader>
            <CardContent className="space-y-0 text-sm">
              {!referral.referringDoctor ? (
                <p className="text-xs text-slate-400 py-3">No provider assigned</p>
              ) : currentProviderLayout.fields.length > 0 ? (
                currentProviderLayout.fields.map((fieldId: string) => {
                  if (fieldId === "location") {
                    const locations = (referral.referringDoctor.locations || [])
                      .map((dl: any) => dl.location?.name)
                      .filter(Boolean)
                      .join(", ")
                    return (
                      <PropertyRow
                        key={fieldId}
                        label="Location"
                        value={locations || null}
                      />
                    )
                  }
                  const fieldMap: Record<string, { label: string; path: string }> = {
                    name: { label: "Name", path: "referringDoctor.name" },
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
                          ? `/referring-doctors/${doctor.id}`
                          : undefined
                      }
                      bold={fieldId === "name"}
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

      {/* Card visibility modal */}
      {cardsModalOpen && (
        <CardsVisibilityModal
          open={cardsModalOpen}
          onOpenChange={setCardsModalOpen}
          layouts={layouts}
          onSaved={(visibility) =>
            setLayouts((prev) =>
              prev.map((l) => ({ ...l, visible: visibility[l.cardName] }))
            )
          }
        />
      )}

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
