"use client"

// A textarea that doesn't fight iOS/iPadOS voice dictation.
//
// A normal controlled <textarea value={s} onChange={setS}/> breaks dictation: React
// re-assigns the DOM value on every recognised word, which resets the caret and
// detaches the dictation session (the field "freezes" and stops accepting edits), and
// it re-renders the whole parent page on every input event.
//
// This one is uncontrolled — the DOM owns the text while you type — and commits
// upward on blur. React never writes into the node while it has focus, and the parent
// re-renders once, at the end, instead of once per word.
//
// Because the commit is on blur, a submit handler must read the text imperatively:
//   const notes = notesRef.current?.flush() ?? value
// (a button tap fires blur just before click, so the handler's closure is still stale).

import * as React from "react"
import { cn } from "@/lib/utils"

export interface NotesTextareaHandle {
  /** Commit the current text (if changed) and return it. Safe to call any time. */
  flush: () => string
  focus: () => void
  /** The underlying element, for callers that need selection/scroll access. */
  el: () => HTMLTextAreaElement | null
}

export interface NotesTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "defaultValue"> {
  value: string
  /** Fired with the text — on blur by default, or per keystroke when commit="input". */
  onChange: (value: string) => void
  /**
   * "blur" (default) also spares the parent a re-render per keystroke — best for a
   * field inside a big list/page. "input" keeps live semantics for callers whose
   * Save/Cancel depends on the current draft; it still never writes back into a
   * focused field, which is the part that breaks dictation.
   */
  commit?: "blur" | "input"
  /** Optional cheap notification on every input (e.g. to enable a Save button). */
  onInput?: React.FormEventHandler<HTMLTextAreaElement>
}

export const NotesTextarea = React.forwardRef<NotesTextareaHandle, NotesTextareaProps>(
  ({ value, onChange, commit = "blur", onBlur, onInput, className, ...props }, ref) => {
    const elRef = React.useRef<HTMLTextAreaElement>(null)
    // The last text the parent and this field agree on. Guards both directions:
    // we don't re-emit unchanged text, and we don't overwrite text we ourselves sent up.
    const committed = React.useRef(value)
    // Keep the latest onChange without making flush() identity-unstable.
    const onChangeRef = React.useRef(onChange)
    onChangeRef.current = onChange

    const flush = React.useCallback(() => {
      const el = elRef.current
      if (!el) return committed.current
      const next = el.value
      if (next !== committed.current) {
        committed.current = next
        onChangeRef.current(next)
      }
      return next
    }, [])

    React.useImperativeHandle(ref, () => ({
      flush,
      focus: () => elRef.current?.focus(),
      el: () => elRef.current,
    }), [flush])

    // Pull an externally-changed value in — but never while the field has focus, or we
    // would clobber what the user is dictating right now.
    React.useEffect(() => {
      const el = elRef.current
      if (!el || value === committed.current) return
      if (typeof document !== "undefined" && document.activeElement === el) return
      committed.current = value
      el.value = value
    }, [value])

    return (
      <textarea
        ref={elRef}
        defaultValue={value}
        onInput={(e) => { if (commit === "input") flush(); onInput?.(e) }}
        onBlur={(e) => { flush(); onBlur?.(e) }}
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    )
  },
)
NotesTextarea.displayName = "NotesTextarea"
