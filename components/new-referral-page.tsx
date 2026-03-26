"use client"

import { useState } from "react"
import FaxUpload from "@/components/fax-upload"
import ReferralForm from "@/components/referral-form"
import type { ExtractedReferralData } from "@/app/api/fax/extract/route"
import type { PendingFile } from "@/app/api/fax/extract/route"

interface Location {
  id: string
  name: string
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

interface NewReferralPageProps {
  practices: Practice[]
}

export default function NewReferralPage({ practices }: NewReferralPageProps) {
  const [extractedData, setExtractedData] = useState<ExtractedReferralData | null>(null)
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null)

  function handleExtracted(data: ExtractedReferralData) {
    setPendingFile(data.pendingFile ?? null)
    setExtractedData(data)
  }

  return (
    <div className="space-y-4">
      <FaxUpload onExtracted={handleExtracted} />
      <div className="bg-white border rounded-lg p-6">
        <ReferralForm practices={practices} prefillData={extractedData ?? undefined} pendingFile={pendingFile} />
      </div>
    </div>
  )
}
