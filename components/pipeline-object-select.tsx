"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Loader2 } from "lucide-react"
import StyledSelect from "@/components/ui/styled-select"

// "Select an object" for Pipelines & Stages. A dropdown rather than a row of chips,
// because the object list grows with every custom object the user creates.
export default function PipelineObjectSelect({ objects, value }: {
  objects: { key: string; label: string }[]
  value: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-slate-500">Select an object:</label>
      <StyledSelect
        value={value}
        onChange={(e) => {
          const next = e.target.value
          if (next === value) return
          setPending(true)
          // A full navigation (not router.push) so the page is re-fetched for the new
          // object rather than served from the client router cache.
          window.location.href = `/settings/pipelines?object=${encodeURIComponent(next)}`
        }}
        className="h-9 min-w-[220px] rounded-lg border border-slate-200 bg-white px-3 text-sm"
        searchable={objects.length > 8}
      >
        {objects.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </StyledSelect>
      {pending && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
    </div>
  )
}
