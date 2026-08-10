"use client"

import { Check } from "lucide-react"
import { OPTION_COLORS } from "@/lib/option-colors"

// Swatch-grid color picker (shared by tags + property option colors).
export function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 p-2 bg-white border border-slate-200 rounded-lg shadow-sm">
      {OPTION_COLORS.map((c) => (
        <button
          key={c.hex}
          type="button"
          title={c.label}
          onClick={() => onChange(c.hex)}
          className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center"
          style={{ backgroundColor: c.hex, borderColor: value === c.hex ? "#1e293b" : "transparent" }}
        >
          {value === c.hex && <Check className="w-3 h-3 text-white" />}
        </button>
      ))}
    </div>
  )
}

export default ColorPicker
