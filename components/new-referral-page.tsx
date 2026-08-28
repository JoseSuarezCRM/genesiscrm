"use client"

import { useState } from "react"
import FaxUpload from "@/components/fax-upload"
import BatchFaxUpload from "@/components/batch-fax-upload"
import ReferralForm from "@/components/referral-form"
import type { ExtractedReferralData } from "@/app/api/fax/extract/route"
import type { PendingFile } from "@/app/api/fax/extract/route"

interface Location {
  id: string
  name: string
  phone: string | null
  fax: string | null
  address: string | null
}

interface Doctor {
  id: string
  name: string
  specialty: string | null
  locations: { locationId: string }[]
}

interface Practice {
  id: string
  name: string
  locations: Location[]
  doctors: Doctor[]
}

interface Pipeline { id: string; name: string; color: string }

interface NewReferralPageProps {
  practices: Practice[]
  pipelines?: Pipeline[]
  defaultPipelineId?: string
  customProps?: any[]
  createFormConfig?: { key: string; required?: boolean }[] | null
  isAdmin?: boolean
  users?: { id: string; label: string }[]
}

export default function NewReferralPage({ practices, pipelines = [], defaultPipelineId, customProps = [], createFormConfig = null, isAdmin = false, users = [] }: NewReferralPageProps) {
  const [mode, setMode] = useState<"single" | "batch">("single")
  const [extractedData, setExtractedData] = useState<ExtractedReferralData | null>(null)
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null)

  function handleExtracted(data: ExtractedReferralData) {
    setPendingFile(data.pendingFile ?? null)
    setExtractedData(data)
  }

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
        <button
          onClick={() => setMode("single")}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            mode === "single"
              ? "bg-white shadow-sm text-slate-800"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Single Fax
        </button>
        <button
          onClick={() => setMode("batch")}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            mode === "batch"
              ? "bg-white shadow-sm text-slate-800"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Batch Upload
        </button>
      </div>

      {mode === "single" && (
        <>
          <FaxUpload onExtracted={handleExtracted} />
          <div className="bg-white border rounded-lg p-6">
            <ReferralForm
              practices={practices}
              pipelines={pipelines}
              defaultValues={defaultPipelineId ? { pipelineId: defaultPipelineId } : undefined}
              prefillData={extractedData ?? undefined}
              pendingFile={pendingFile}
              customProps={customProps}
              createFormConfig={createFormConfig}
              isAdmin={isAdmin}
              users={users}
            />
          </div>
        </>
      )}

      {mode === "batch" && <BatchFaxUpload practices={practices} />}
    </div>
  )
}
