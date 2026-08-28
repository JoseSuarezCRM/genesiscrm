"use client"

// Renders a pipeline/stage name per the object's display style:
// "text" (no color), "dot" (colored dot + name), or "badge" (name in a colored pill).
export function PipelineChip({ name, color, style }: { name: string; color?: string | null; style: string }) {
  const c = color || "#64748b"
  if (style === "badge") {
    return <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold text-white" style={{ backgroundColor: c }}>{name}</span>
  }
  if (style === "text") {
    return <span className="text-sm font-medium text-slate-800">{name}</span>
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-800">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c }} />
      {name}
    </span>
  )
}
