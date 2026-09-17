"use client"

import { cn } from "@/lib/utils"

// The app's on/off switch, previously hand-rolled in org-rules-manager,
// property-editor and custom-property-field. Same markup and proportions, in one
// place so a fourth copy doesn't drift.

export default function Switch({
  checked,
  onChange,
  disabled,
  label,
  className,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  /** Screen-reader name. Give one whenever the switch has no visible text beside it. */
  label?: string
  className?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-blue-600" : "bg-slate-300",
        className,
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  )
}
