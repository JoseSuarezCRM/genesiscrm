"use client"

import StyledSelect from "@/components/ui/styled-select"
import { useState, useTransition } from "react"
import { assignReferral } from "@/app/actions/referrals"
import { UserCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

type User = { id: string; name: string | null; email: string }

interface Props {
  referralId: string
  assignedTo: User | null
  users: User[]
}

export default function ReferralAssignee({ referralId, assignedTo, users }: Props) {
  const [value, setValue] = useState(assignedTo?.id ?? "")
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  function handleChange(newId: string) {
    setValue(newId)
    setSaved(false)
    startTransition(async () => {
      await assignReferral(referralId, newId || null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div className="flex items-center gap-2">
      <UserCircle className="h-4 w-4 text-slate-400 shrink-0" />
      <div className="relative flex-1">
        <StyledSelect
          value={value}
          onChange={e => handleChange(e.target.value)}
          disabled={isPending}
          className="w-full text-sm rounded-md border border-input bg-white px-2 py-1 pr-7 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        >
          <option value="">Unassigned</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>{u.name || u.email}</option>
          ))}
        </StyledSelect>
        {isPending && (
          <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-slate-400" />
        )}
      </div>
      {saved && <span className="text-xs text-green-600 font-medium">Saved</span>}
    </div>
  )
}
