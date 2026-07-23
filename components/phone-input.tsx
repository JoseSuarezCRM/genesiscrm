"use client"

import { useEffect, useState } from "react"
import StyledSelect from "@/components/ui/styled-select"

// A small, dependency-free country-code picker + number field. Stores the value as
// E.164-ish ("+<dial><digits>"), defaulting to US.
//
// Labels are plain text ("US +1") rather than flag emoji — Windows doesn't render
// regional-indicator flags, so emoji labels collapsed to bare letters with the
// dial code cut off. `code` is the (unique) select value; `dial` is what we store,
// so US and CA can both map to +1 while staying distinct in the picker.
const COUNTRIES: { code: string; label: string; dial: string }[] = [
  { code: "US", label: "US +1", dial: "+1" },
  { code: "CA", label: "CA +1", dial: "+1" },
  { code: "MX", label: "MX +52", dial: "+52" },
  { code: "GB", label: "UK +44", dial: "+44" },
  { code: "IN", label: "IN +91", dial: "+91" },
  { code: "BR", label: "BR +55", dial: "+55" },
  { code: "CO", label: "CO +57", dial: "+57" },
  { code: "ES", label: "ES +34", dial: "+34" },
  { code: "FR", label: "FR +33", dial: "+33" },
  { code: "DE", label: "DE +49", dial: "+49" },
  { code: "IT", label: "IT +39", dial: "+39" },
  { code: "AU", label: "AU +61", dial: "+61" },
  { code: "PH", label: "PH +63", dial: "+63" },
  { code: "CN", label: "CN +86", dial: "+86" },
  { code: "JP", label: "JP +81", dial: "+81" },
  { code: "KR", label: "KR +82", dial: "+82" },
  { code: "AE", label: "AE +971", dial: "+971" },
  { code: "SA", label: "SA +966", dial: "+966" },
  { code: "ZA", label: "ZA +27", dial: "+27" },
  { code: "NG", label: "NG +234", dial: "+234" },
  { code: "AR", label: "AR +54", dial: "+54" },
  { code: "CL", label: "CL +56", dial: "+56" },
  { code: "PE", label: "PE +51", dial: "+51" },
  { code: "GT", label: "GT +502", dial: "+502" },
  { code: "DO", label: "DO +1809", dial: "+1809" },
  { code: "PR", label: "PR +1787", dial: "+1787" },
]

// Compose the stored value from a country code + local number (matches parse()).
function compose(code: string, rest: string): string {
  const dial = COUNTRIES.find((c) => c.code === code)?.dial ?? "+1"
  const digits = rest.replace(/[^\d\s()\-.]/g, "").trim()
  return digits ? `${dial} ${digits}` : ""
}

// Split a stored value into a country code + the local number, longest dial wins.
function parse(value: string | undefined): { code: string; rest: string } {
  const v = (value ?? "").trim()
  if (v.startsWith("+")) {
    // Longest dial first so +1809 beats +1, +971 beats +9, etc.
    const byLen = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length)
    const match = byLen.find((c) => v.startsWith(c.dial))
    if (match) return { code: match.code, rest: v.slice(match.dial.length).trim() }
  }
  // No prefix stored — treat the whole thing as a US local number.
  return { code: "US", rest: v.replace(/^\+/, "") }
}

export default function PhoneInput({ value, onChange, className, onCommit }: {
  value: string
  onChange: (v: string) => void
  className?: string
  /** Fired on Enter or when focus leaves the whole control (for auto-save). */
  onCommit?: () => void
}) {
  const initial = parse(value)
  const [code, setCode] = useState(initial.code)
  const [rest, setRest] = useState(initial.rest)

  // Re-sync when the value prop changes externally (e.g. a different record loads),
  // but NOT in response to our own emits — so picking a country before typing a
  // number keeps that country instead of snapping back to US.
  useEffect(() => {
    if (compose(code, rest) !== (value ?? "")) {
      const p = parse(value)
      setCode(p.code)
      setRest(p.rest)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function pickCountry(nextCode: string) {
    setCode(nextCode)
    onChange(compose(nextCode, rest))
  }
  function setNumber(next: string) {
    setRest(next)
    onChange(compose(code, next))
  }

  return (
    <div className={"flex gap-1.5 min-w-0 " + (className ?? "")}
      onBlur={onCommit ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) onCommit() } : undefined}>
      <StyledSelect value={code} onChange={(e) => pickCountry(e.target.value)}
        className="w-[92px] shrink-0 text-sm border border-slate-200 rounded-lg px-1.5 py-1.5 focus:outline-none focus:border-zinc-400">
        {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
      </StyledSelect>
      <input
        value={rest}
        onChange={(e) => setNumber(e.target.value)}
        onKeyDown={onCommit ? (e) => { if (e.key === "Enter") { e.preventDefault(); onCommit() } } : undefined}
        placeholder="Phone number"
        className="min-w-0 flex-1 w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-zinc-400"
        autoFocus
      />
    </div>
  )
}
