"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useScheduling } from "./store"

const TABS: { href: string; label: string }[] = [
  { href: "/scheduling-v2", label: "Overview" },
  { href: "/scheduling-v2/roster", label: "Roster" },
  { href: "/scheduling-v2/master-schedule", label: "Master Schedule" },
  { href: "/scheduling-v2/schedule-builder", label: "Schedule Builder" },
  { href: "/scheduling-v2/interns", label: "Intern / MA / FD Hub" },
  { href: "/scheduling-v2/xrt", label: "XRT Hub" },
  { href: "/scheduling-v2/growth", label: "Growth" },
]

function SaveStatus() {
  const { status, savedAt, saveNow } = useScheduling()
  const label =
    status === "saving" ? "Saving…"
    : status === "dirty" ? "Unsaved changes"
    : status === "saved" && savedAt
      ? `Saved · ${savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
      : "Shared org-wide"
  return (
    <div className="flex items-center gap-3 shrink-0">
      <span
        className={cn(
          "text-xs tabular-nums",
          status === "dirty" ? "text-amber-600" : "text-zinc-500"
        )}
      >
        {label}
      </span>
      <button
        onClick={saveNow}
        className="h-8 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-600 hover:border-zinc-400"
      >
        Save now
      </button>
    </div>
  )
}

export default function SchedulingNav() {
  const pathname = usePathname()
  const isActive = (href: string) =>
    href === "/scheduling-v2" ? pathname === href : pathname.startsWith(href)

  return (
    <div className="sticky top-0 z-20 border-b border-zinc-200 bg-white">
      <div className="flex items-center justify-between gap-4 px-5 pt-3">
        <h1 className="text-base font-semibold text-zinc-900">Operations Planner</h1>
        <SaveStatus />
      </div>
      <div className="flex gap-1 overflow-x-auto px-3 pt-2">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              isActive(t.href)
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
