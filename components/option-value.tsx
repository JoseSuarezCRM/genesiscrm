import React from "react"
import { hexToChipStyle } from "@/lib/option-colors"

export type OptionStyle = "default" | "dot" | "badge"

// Renders a dropdown / multi-select value using its per-property Option style:
// plain text, a colored dot + label, or a colored badge pill. Multi-select values
// render as several chips. Falls back to plain text when no style/colors are set.
export function OptionValue({
  value,
  optionLabels,
  optionColors,
  optionStyle,
  className,
}: {
  value: string | string[] | null | undefined
  optionLabels?: Record<string, string> | null
  optionColors?: Record<string, string> | null
  optionStyle?: string | null
  className?: string
}) {
  const values = (Array.isArray(value) ? value : value == null || value === "" ? [] : [value]).map((v) => String(v))
  if (values.length === 0) return null

  const labelOf = (v: string) => optionLabels?.[v] ?? v
  const colorOf = (v: string) => optionColors?.[v]
  const style = (optionStyle ?? "default") as OptionStyle

  if (style === "badge") {
    return (
      <span className={"inline-flex flex-wrap gap-1 " + (className ?? "")}>
        {values.map((v) => {
          const c = colorOf(v)
          return (
            <span key={v}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
              style={c ? hexToChipStyle(c) : { backgroundColor: "#f1f5f9", color: "#475569", borderColor: "#e2e8f0" }}>
              {labelOf(v)}
            </span>
          )
        })}
      </span>
    )
  }

  if (style === "dot") {
    return (
      <span className={"inline-flex flex-wrap items-center gap-x-3 gap-y-1 " + (className ?? "")}>
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: colorOf(v) ?? "#cbd5e1" }} />
            <span>{labelOf(v)}</span>
          </span>
        ))}
      </span>
    )
  }

  // default: plain text
  return <span className={className}>{values.map(labelOf).join(", ")}</span>
}

export default OptionValue
