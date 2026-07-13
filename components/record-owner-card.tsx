"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import StyledSelect from "@/components/ui/styled-select"
import { setRecordOwner, type OwnableObject } from "@/app/actions/record-owner"

interface Props {
  type: OwnableObject
  recordId: string
  /** e.g. "Provider Owner" — the playbook names it after the object. */
  ownerLabel: string
  ownerId: string | null
  users: { id: string; label: string }[]
  createdByName?: string | null
  createdAt?: Date | string | null
  updatedByName?: string | null
  updatedAt?: Date | string | null
  canEdit: boolean
}

function fmt(d: Date | string | null | undefined) {
  return d ? new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) : "—"
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="text-slate-900 font-medium text-right">{value}</span>
    </div>
  )
}

export default function RecordOwnerCard({
  type, recordId, ownerLabel, ownerId, users,
  createdByName, createdAt, updatedByName, updatedAt, canEdit,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [owner, setOwner] = useState(ownerId ?? "")

  function save(value: string) {
    setOwner(value)
    startTransition(async () => {
      await setRecordOwner(type, recordId, value || null)
      router.refresh()
    })
  }

  const ownerName = users.find((u) => u.id === owner)?.label ?? "—"

  return (
    <div className="bg-white border border-slate-200 rounded-xl">
      <div className="px-5 py-3 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">Record details</h2>
      </div>
      <div className="p-5 space-y-3 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-500 shrink-0">{ownerLabel}</span>
          {canEdit ? (
            <StyledSelect value={owner} onChange={(e) => save(e.target.value)} disabled={isPending} className="w-44 h-8">
              <option value="">— Unassigned —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </StyledSelect>
          ) : (
            <span className="text-slate-900 font-medium text-right">{ownerName}</span>
          )}
        </div>
        <Row label="Created by" value={createdByName ?? "—"} />
        <Row label="Created" value={fmt(createdAt)} />
        <Row label="Last updated by" value={updatedByName ?? "—"} />
        <Row label="Last updated" value={fmt(updatedAt)} />
      </div>
    </div>
  )
}
