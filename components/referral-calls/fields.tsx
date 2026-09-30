"use client"

/**
 * The intake's building blocks, in the app's zinc style. Inputs use a 16px font
 * below the sm breakpoint so iOS Safari doesn't zoom into a field on focus, and
 * every tap target is at least 36–44px tall.
 */

import * as React from "react"
import { Check, Copy, RotateCcw, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { NotesTextarea } from "@/components/ui/notes-textarea"

export const inputClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base sm:text-sm text-zinc-900 placeholder:text-zinc-400 " +
  "focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 transition-colors"

export function Section({
  step, title, action, children, className, id,
}: {
  step?: number
  title: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  id?: string
}) {
  return (
    <section id={id} className={cn("rounded-xl border border-zinc-200 bg-white", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
        <h2 className="flex items-center gap-2.5 text-sm font-semibold text-zinc-900">
          {step !== undefined && (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-semibold text-white tabular-nums">
              {step}
            </span>
          )}
          {title}
        </h2>
        {action && <div className="flex items-center gap-1.5">{action}</div>}
      </div>
      <div className="px-4 py-4">{children}</div>
    </section>
  )
}

/** Where a field's value came from, for the small marker beside its label. */
export type FieldOrigin = "ai" | "rules" | "manual" | "empty"

export function FieldShell({
  label, htmlFor, origin, onUseSuggestion, copyValue, error, children, className,
}: {
  label: string
  htmlFor?: string
  origin?: FieldOrigin
  /** Shown when the person overrode a suggestion: puts the suggestion back. */
  onUseSuggestion?: () => void
  /** Adds a Copy button for this field's value. */
  copyValue?: string
  error?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1.5 flex min-h-[20px] items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
          {label}
          {origin === "ai" && (
            <span title="Filled by AI from the pasted call — check it" className="inline-flex items-center gap-0.5 rounded-full bg-violet-50 px-1.5 py-px text-[10px] font-semibold text-violet-700">
              <Sparkles className="h-2.5 w-2.5" /> AI
            </span>
          )}
        </label>
        <div className="flex items-center gap-1">
          {onUseSuggestion && (
            <button type="button" onClick={onUseSuggestion} title="Put the suggested value back"
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800">
              <RotateCcw className="h-3 w-3" /> Use suggestion
            </button>
          )}
          {copyValue !== undefined && <CopyButton text={copyValue} small />}
        </div>
      </div>
      {children}
      {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  )
}

export function TextInput({
  id, value, onChange, onBlur, placeholder, inputMode, className, invalid, autoCapitalize,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  placeholder?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
  className?: string
  invalid?: boolean
  autoCapitalize?: string
}) {
  return (
    <input
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      inputMode={inputMode}
      autoComplete="off"
      autoCapitalize={autoCapitalize}
      spellCheck={false}
      className={cn(inputClass, "h-10", invalid && "border-red-300 focus:ring-red-500/10", className)}
    />
  )
}

/** A dictation-safe textarea (see NotesTextarea) that grows with its content. */
export function LongInput({
  id, value, onChange, placeholder, rows = 3, className,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  className?: string
}) {
  return (
    <NotesTextarea
      id={id}
      commit="input"
      rows={rows}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={cn(inputClass, "min-h-[4.5rem] resize-y leading-relaxed", className)}
    />
  )
}

export function Chip({
  on, onClick, children, tone = "default", title,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
  tone?: "default" | "urgent"
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className={cn(
        "inline-flex min-h-[36px] items-center rounded-full border px-3 text-sm font-medium transition-colors",
        on
          ? tone === "urgent"
            ? "border-red-600 bg-red-600 text-white"
            : "border-zinc-900 bg-zinc-900 text-white"
          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50",
      )}
    >
      {children}
    </button>
  )
}

export function ChipRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap gap-1.5", className)}>{children}</div>
}

/* ── Copying ───────────────────────────────────────────────────────────────── */

type CopyListener = (text: string | null) => void
const listeners = new Set<CopyListener>()

/**
 * Copy text, starting the clipboard write synchronously inside the tap — iOS
 * refuses writes that begin after an await. If the browser refuses anyway, the
 * text is handed to <CopyFallback/>, which shows it selected for a manual copy
 * (the original tool's fallback).
 */
export function copyText(text: string): Promise<boolean> {
  let p: Promise<void>
  try {
    p = navigator.clipboard.writeText(text)
  } catch {
    p = Promise.reject(new Error("clipboard"))
  }
  return p.then(
    () => { listeners.forEach((l) => l(null)); return true },
    () => { listeners.forEach((l) => l(text)); return false },
  )
}

export function CopyFallback() {
  const [text, setText] = React.useState<string | null>(null)
  const ref = React.useRef<HTMLTextAreaElement>(null)
  React.useEffect(() => {
    const l: CopyListener = (t) => setText(t)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  React.useEffect(() => {
    if (text !== null) { ref.current?.focus(); ref.current?.select() }
  }, [text])
  if (text === null) return null
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-amber-900">Copy didn&apos;t go through. Select this text and copy it.</p>
        <button type="button" onClick={() => setText(null)} className="text-xs font-medium text-amber-800 hover:underline">Close</button>
      </div>
      <textarea ref={ref} readOnly value={text} rows={6} className={cn(inputClass, "font-mono text-xs")} />
    </div>
  )
}

export function CopyButton({
  text, label = "Copy", small, className, disabled,
}: {
  text: string | (() => string)
  label?: string
  small?: boolean
  className?: string
  disabled?: boolean
}) {
  const [done, setDone] = React.useState(false)
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        copyText(typeof text === "function" ? text() : text).then((ok) => {
          if (!ok) return
          setDone(true)
          setTimeout(() => setDone(false), 1400)
        })
      }}
      className={cn(
        "inline-flex items-center gap-1 rounded-md font-medium transition-colors disabled:opacity-40",
        small ? "px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
          : "h-8 border border-zinc-200 bg-white px-2.5 text-xs text-zinc-700 hover:bg-zinc-50",
        done && "text-emerald-700",
        className,
      )}
    >
      {done ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {done ? "Copied" : label}
    </button>
  )
}
