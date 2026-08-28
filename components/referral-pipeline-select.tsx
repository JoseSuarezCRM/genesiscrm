"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import StyledSelect from "@/components/ui/styled-select"
import { updateReferralPipeline } from "@/app/actions/referrals"
import { PipelineChip } from "@/components/pipeline-chip"

// Inline pipeline picker for a referral. Read-only name when the user can't edit.
export default function ReferralPipelineSelect({ referralId, value, name, pipelines, canEdit, colorStyle = "dot" }: {
  referralId: string
  value: string | null
  name: string | null | undefined
  pipelines: { id: string; name: string; color?: string }[]
  canEdit: boolean
  colorStyle?: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [cur, setCur] = useState(value ?? "")

  if (!canEdit) return name ? <PipelineChip name={name} color={pipelines.find((p) => p.id === value)?.color} style={colorStyle} /> : <span className="text-sm text-slate-400">—</span>

  return (
    <StyledSelect
      value={cur}
      onChange={(e) => { const v = e.target.value; setCur(v); startTransition(async () => { await updateReferralPipeline(referralId, v || null); router.refresh() }) }}
      className="w-full text-sm border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-zinc-400"
    >
      <option value="">—</option>
      {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </StyledSelect>
  )
}
