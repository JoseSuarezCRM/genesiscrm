"use client"

import * as React from "react"
import ReactPhoneInput, { type Value } from "react-phone-number-input"
import "react-phone-number-input/style.css"
import { cn } from "@/lib/utils"

// Custom text input styled to match shadcn Input
const PhoneTextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
)
PhoneTextInput.displayName = "PhoneTextInput"

interface PhoneInputProps {
  value: string | undefined
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
}

export function PhoneInput({ value, onChange, disabled, placeholder, className }: PhoneInputProps) {
  return (
    <div
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      <ReactPhoneInput
        international
        defaultCountry="US"
        value={value as Value}
        onChange={(v) => onChange(v ?? "")}
        disabled={disabled}
        placeholder={placeholder ?? "Phone number"}
        inputComponent={PhoneTextInput}
        className="flex-1 flex items-center gap-2"
      />
    </div>
  )
}
