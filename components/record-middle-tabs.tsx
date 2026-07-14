"use client"

import { useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

/** Overview / Activities tabs for the middle column, matching the custom-object detail. */
export default function RecordMiddleTabs({ overview, activities }: { overview: ReactNode; activities: ReactNode }) {
  const [tab, setTab] = useState<"overview" | "activities">("overview")

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b border-slate-200">
        {(["overview", "activities"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn(
              "px-3 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors",
              tab === t ? "border-zinc-900 text-zinc-900" : "border-transparent text-slate-500 hover:text-slate-800",
            )}>
            {t}
          </button>
        ))}
      </div>

      <div className={tab === "overview" ? "space-y-6" : "hidden"}>{overview}</div>
      <div className={tab === "activities" ? "" : "hidden"}>{activities}</div>
    </div>
  )
}
