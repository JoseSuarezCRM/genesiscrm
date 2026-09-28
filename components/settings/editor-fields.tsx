"use client"

/**
 * The form controls the settings editors share.
 *
 * Lifted out of surgeon-site-editor.tsx so the practice editor uses the same
 * ones rather than growing a second, slightly-different set. Behaviour is
 * unchanged from the originals apart from the accessibility fixes noted below.
 */

import * as React from "react"
import { Plus, Trash2 } from "lucide-react"
import StyledSelect from "@/components/ui/styled-select"
import { cn } from "@/lib/utils"

export function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>
}

export function Field(props: {
  label: string
  hint?: string
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <label className={cn("block", props.wide && "sm:col-span-2")}>
      <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">{props.label}</span>
      {props.children}
      {props.hint && <span className="mt-1 block text-pretty text-xs text-zinc-400">{props.hint}</span>}
    </label>
  )
}

const controlClass =
  "mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none transition-colors focus:border-zinc-400"

export function Input(props: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <input
      type={props.type ?? "text"}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      placeholder={props.placeholder}
      className={controlClass}
    />
  )
}

export function Textarea(props: {
  value: string
  onChange: (v: string) => void
  rows?: number
  placeholder?: string
}) {
  return (
    <textarea
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      rows={props.rows ?? 3}
      placeholder={props.placeholder}
      className={controlClass}
    />
  )
}

/**
 * A choice from a fixed set.
 *
 * Wraps the app's StyledSelect rather than a native `<select>`, per the house
 * rule that every field uses the shared inputs. Used wherever the site app
 * resolves a stored string through a lookup table — icon names, review sources —
 * because those are closed sets and a text box invites a value that silently
 * resolves to the fallback.
 */
export function Select(props: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  /** Offered as the first entry when the field is legitimately unset. */
  placeholder?: string
}) {
  return (
    <div className={controlClass + " p-0"}>
      <StyledSelect
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full border-0 bg-transparent px-3 py-2 text-sm"
      >
        {props.placeholder !== undefined && <option value="">{props.placeholder}</option>}
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </StyledSelect>
    </div>
  )
}

/* ── Repeatable rows ───────────────────────────────────────────────────────── */

export function RowList<T>(props: {
  rows: T[]
  onChange: (rows: T[]) => void
  blank: T
  addLabel: string
  /** What one row is called, for the remove button's label. */
  itemLabel?: string
  render: (row: T, update: (row: T) => void) => React.ReactNode
}) {
  const what = props.itemLabel ?? "row"
  return (
    <div className="space-y-2">
      {props.rows.map((row, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="grid flex-1 gap-2 sm:grid-cols-2">
            {props.render(row, (next) => {
              const rows = [...props.rows]
              rows[i] = next
              props.onChange(rows)
            })}
          </div>
          <button
            type="button"
            onClick={() => props.onChange(props.rows.filter((_, j) => j !== i))}
            className="mt-2 text-zinc-300 transition-colors hover:text-red-600"
            // Icon-only: the visible label is the icon, so the name is here.
            aria-label={`Remove ${what} ${i + 1}`}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => props.onChange([...props.rows, props.blank])}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
      >
        <Plus className="size-4" /> {props.addLabel}
      </button>
    </div>
  )
}

export function StringList(props: {
  values: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  multiline?: boolean
  addLabel?: string
  itemLabel?: string
}) {
  const what = props.itemLabel ?? "entry"
  const set = (i: number, v: string) => {
    const next = [...props.values]
    next[i] = v
    props.onChange(next)
  }
  return (
    <div className="space-y-2">
      {props.values.map((value, i) => (
        <div key={i} className="flex items-start gap-2">
          {props.multiline ? (
            <textarea
              value={value}
              rows={4}
              placeholder={props.placeholder}
              onChange={(e) => set(i, e.target.value)}
              className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            />
          ) : (
            <input
              value={value}
              placeholder={props.placeholder}
              onChange={(e) => set(i, e.target.value)}
              className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            />
          )}
          <button
            type="button"
            onClick={() => props.onChange(props.values.filter((_, j) => j !== i))}
            className="mt-2 text-zinc-300 transition-colors hover:text-red-600"
            aria-label={`Remove ${what} ${i + 1}`}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => props.onChange([...props.values, ""])}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
      >
        <Plus className="size-4" /> {props.addLabel ?? "Add"}
      </button>
    </div>
  )
}
