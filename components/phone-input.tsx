"use client"

import { useMemo } from "react"
import StyledSelect from "@/components/ui/styled-select"

// A small, dependency-free country-code picker + number field. Stores the value as
// E.164-ish ("+<dial><digits>"), defaulting to US. Add rows as needed.
const COUNTRIES: { label: string; dial: string }[] = [
  { label: "🇺🇸 +1", dial: "+1" },
  { label: "🇲🇽 +52", dial: "+52" },
  { label: "🇨🇦 +1 (CA)", dial: "+1ca" }, // distinct key; normalized to +1 on save
  { label: "🇬🇧 +44", dial: "+44" },
  { label: "🇮🇳 +91", dial: "+91" },
  { label: "🇧🇷 +55", dial: "+55" },
  { label: "🇨🇴 +57", dial: "+57" },
  { label: "🇪🇸 +34", dial: "+34" },
  { label: "🇫🇷 +33", dial: "+33" },
  { label: "🇩🇪 +49", dial: "+49" },
  { label: "🇦🇺 +61", dial: "+61" },
  { label: "🇵🇭 +63", dial: "+63" },
]

const realDial = (d: string) => (d === "+1ca" ? "+1" : d)

export default function PhoneInput({ value, onChange, className, onCommit }: {
  value: string
  onChange: (v: string) => void
  className?: string
  /** Fired on Enter or when focus leaves the whole control (for auto-save). */
  onCommit?: () => void
}) {
  // Split a stored value into a dial code + the rest, longest match wins.
  const { dial, rest } = useMemo(() => {
    const v = (value ?? "").trim()
    if (v.startsWith("+")) {
      const dials = Array.from(new Set(COUNTRIES.map((c) => realDial(c.dial)))).sort((a, b) => b.length - a.length)
      const match = dials.find((d) => v.startsWith(d))
      if (match) return { dial: match, rest: v.slice(match.length).trim() }
    }
    // No prefix stored — treat the whole thing as the local number under US.
    return { dial: "+1", rest: v.replace(/^\+/, "") }
  }, [value])

  function emit(nextDial: string, nextRest: string) {
    const digits = nextRest.replace(/[^\d\s()\-.]/g, "")
    onChange(digits.trim() ? `${realDial(nextDial)} ${digits.trim()}` : "")
  }

  return (
    <div className="flex gap-1.5 min-w-0"
      onBlur={onCommit ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) onCommit() } : undefined}>
      <StyledSelect value={COUNTRIES.find((c) => realDial(c.dial) === dial)?.dial ?? "+1"}
        onChange={(e) => emit(e.target.value, rest)}
        className="w-[76px] shrink-0 text-sm border border-slate-200 rounded-lg px-1.5 py-1.5 focus:outline-none focus:border-zinc-400">
        {COUNTRIES.map((c) => <option key={c.dial} value={c.dial}>{c.label}</option>)}
      </StyledSelect>
      <input
        value={rest}
        onChange={(e) => emit(dial, e.target.value)}
        onKeyDown={onCommit ? (e) => { if (e.key === "Enter") { e.preventDefault(); onCommit() } } : undefined}
        placeholder="Phone number"
        className="min-w-0 flex-1 w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-zinc-400"
        autoFocus
      />
    </div>
  )
}
