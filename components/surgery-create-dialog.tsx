"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import CreateRecordModal from "@/components/create-record-modal"
import { builtinCreateCatalog, splitCreateValues } from "@/lib/create-catalog"
import { createSurgeryCase } from "@/app/actions/surgery"
import { SURGERY_STATUS_OPTIONS } from "@/lib/automation-properties"
import { type CreateFormField } from "@/app/actions/create-form"

// Curated default fields shown before an admin configures the create form (the
// clinical details — clearances, procedure, CT/GLP-1/DME — are added after).
const SURGERY_DEFAULT_FIELDS: CreateFormField[] = [
  { key: "patientName", required: true }, { key: "mrn" }, { key: "status" },
  { key: "orderingProvider" }, { key: "diagnosis" }, { key: "facility" },
  { key: "surgeryDate" }, { key: "language" }, { key: "email" }, { key: "notes" },
]

export default function SurgeryCreateDialog({ customProps = [], createFormConfig = null, users = [], isAdmin = false }: {
  customProps?: { id: string; name: string; type: string; options?: string[]; optionLabels?: any; optionColors?: any; optionStyle?: any; numberFormat?: any }[]
  createFormConfig?: CreateFormField[] | null
  users?: { id: string; label: string }[]
  isAdmin?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-2" /> New Case
      </Button>
      {open && (
        <CreateRecordModal
          objectType="SURGERY"
          title="New Surgery Case"
          catalog={builtinCreateCatalog({
            entityType: "SURGERY",
            customProps,
            extras: [{ key: "status", label: "Status", type: "select", options: SURGERY_STATUS_OPTIONS.map((s) => s.value), optionLabels: Object.fromEntries(SURGERY_STATUS_OPTIONS.map((s) => [s.value, s.label])) }],
            required: ["patientName"],
            ownerLabel: "Case Owner",
          })}
          config={createFormConfig}
          defaultConfig={SURGERY_DEFAULT_FIELDS}
          users={users}
          canEditForm={isAdmin}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); router.refresh() }}
          onConfigChanged={() => router.refresh()}
          onSubmit={async (values) => {
            const { native, customProperties, ownerId } = splitCreateValues(values)
            return await createSurgeryCase({ ...(native as any), customProperties, ownerId }) as any
          }}
        />
      )}
    </>
  )
}
