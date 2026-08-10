// Shared color palette + helpers for tag/option colors. Used by the tag color
// picker, the property editor's option colors, and the OptionValue renderer.

export const OPTION_COLORS: { label: string; hex: string }[] = [
  { label: "Blue", hex: "#3b82f6" },
  { label: "Indigo", hex: "#6366f1" },
  { label: "Purple", hex: "#a855f7" },
  { label: "Pink", hex: "#ec4899" },
  { label: "Red", hex: "#ef4444" },
  { label: "Orange", hex: "#f97316" },
  { label: "Yellow", hex: "#eab308" },
  { label: "Green", hex: "#22c55e" },
  { label: "Teal", hex: "#14b8a6" },
  { label: "Slate", hex: "#64748b" },
]

// Soft-fill pill style for a hex color (bg tint, solid text, subtle border).
export function hexToChipStyle(hex: string) {
  return { backgroundColor: hex + "20", color: hex, borderColor: hex + "50" }
}

// A stable default color for the option at a given index (cycles the palette).
export function defaultColorForIndex(i: number): string {
  return OPTION_COLORS[((i % OPTION_COLORS.length) + OPTION_COLORS.length) % OPTION_COLORS.length].hex
}
