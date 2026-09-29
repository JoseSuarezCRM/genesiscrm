"use client"

/**
 * The keyed page copy: fifty-odd boxes, grouped by the part of the site they
 * appear on.
 *
 * These were unreachable before. The record has held `pageCopy`, `pageLists` and
 * `articleBios` since the site app was first wired up, but nothing rendered a
 * field for them, so the only way to write one was a script on the command line.
 *
 * Grouped and collapsed, because fifty boxes in a column is not an editor.
 * Each group says how many of its keys are written, so the empty ones are
 * findable without opening everything.
 *
 * ── On blanks ─────────────────────────────────────────────────────────────────
 *
 * Every box here is optional and none is a publish gate. The site falls back to
 * a sentence built from the surgeon's own record, or renders nothing. A blank
 * costs a page some polish; a box filled in from another surgeon's site is a
 * false claim about a physician. That asymmetry is why nothing here nags.
 */

import * as React from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import {
  META_LENGTH_GUIDE,
  filledCount,
  unknownKeys,
  type CopyGroup,
  type CopyKey,
} from "@/lib/surgeon-site-copy"
import { StringList } from "@/components/settings/editor-fields"
import { cn } from "@/lib/utils"

/* ── One labelled box ──────────────────────────────────────────────────────── */

function CopyBox(props: {
  spec: CopyKey
  value: string
  onChange: (v: string) => void
  /** Put the caret here — a click in the site preview named this field. */
  focused?: boolean
}) {
  const { spec } = props
  const ref = React.useRef<HTMLTextAreaElement | null>(null)

  React.useEffect(() => {
    if (!props.focused) return
    const el = ref.current
    if (!el) return
    // Scroll first, then focus: focusing alone jumps the panel abruptly, and a
    // staff member who clicked something on the page should see it arrive.
    el.scrollIntoView({ block: "center", behavior: "smooth" })
    el.focus({ preventScroll: true })
  }, [props.focused])
  const meta = spec.kind === "meta"
  const len = props.value.trim().length
  const over = meta && len > META_LENGTH_GUIDE

  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          {spec.label}
        </span>
        {/*
          Only on meta descriptions, and only once something is typed: a running
          0/155 on an empty optional box reads as a requirement.
        */}
        {meta && len > 0 && (
          <span className={cn("text-[0.7rem] tabular-nums", over ? "text-amber-600" : "text-zinc-400")}>
            {len}/{META_LENGTH_GUIDE}
          </span>
        )}
      </span>
      <textarea
        ref={ref}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        rows={meta ? 2 : 4}
        className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none transition-colors focus:border-zinc-400"
      />
      <span className="mt-1 block text-pretty text-xs text-zinc-400">
        {spec.hint ??
          (meta ? "One sentence. Search engines cut it off past about 155 characters." : null)}
      </span>
    </label>
  )
}

/* ── A collapsible group ───────────────────────────────────────────────────── */

function Group(props: {
  label: string
  blurb: string
  filled: number
  total: number
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200">
      <button
        type="button"
        onClick={props.onToggle}
        aria-expanded={props.open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50"
      >
        {props.open ? (
          <ChevronDown className="size-4 shrink-0 text-zinc-400" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-zinc-400" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-zinc-900">{props.label}</span>
          <span className="block truncate text-xs text-zinc-500">{props.blurb}</span>
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[0.7rem] tabular-nums",
            props.filled === 0 ? "bg-zinc-100 text-zinc-500" : "bg-zinc-900 text-white",
          )}
        >
          {props.filled}/{props.total}
        </span>
      </button>
      {props.open && (
        <div className="space-y-5 border-t border-zinc-100 bg-white p-4">{props.children}</div>
      )}
    </div>
  )
}

/* ── The grouped page copy ─────────────────────────────────────────────────── */

export function CopyKeyEditor(props: {
  groups: CopyGroup[]
  values: Record<string, string>
  onChange: (values: Record<string, string>) => void
  /** Every key the manifest names, for spotting the ones it does not. */
  known: ReadonlySet<string>
  /** A key named by a click in the site preview: open its group and focus it. */
  focusKey?: string | null
}) {
  const [open, setOpen] = React.useState<string | null>(props.groups[0]?.id ?? null)

  // Fifty boxes live behind ten collapsed headings, so naming a key is not
  // enough — the group holding it has to be opened before it can be focused.
  const focusKey = props.focusKey
  React.useEffect(() => {
    if (!focusKey) return
    const group = props.groups.find((g) => g.keys.some((k) => k.key === focusKey))
    if (group) setOpen(group.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey])

  const set = (key: string, v: string) => {
    const next = { ...props.values }
    // Delete rather than store "": the site checks for a *missing* key to decide
    // whether to fall back, and an empty string is a value that defeats that.
    if (v.trim() === "") delete next[key]
    else next[key] = v
    props.onChange(next)
  }

  const orphans = unknownKeys(props.values, props.known)

  return (
    <div className="space-y-2">
      {props.groups.map((g) => (
        <Group
          key={g.id}
          label={g.label}
          blurb={g.blurb}
          filled={filledCount(props.values, g.keys)}
          total={g.keys.length}
          open={open === g.id}
          onToggle={() => setOpen(open === g.id ? null : g.id)}
        >
          {g.keys.map((k) => (
            <CopyBox
              key={k.key}
              spec={k}
              value={props.values[k.key] ?? ""}
              onChange={(v) => set(k.key, v)}
              focused={focusKey === k.key}
            />
          ))}
        </Group>
      ))}

      {/*
        Keys in the data that this CRM's manifest does not name — either the site
        app grew one and the manifest has not caught up, or the site dropped one
        and the value is now dead. Shown either way: an editor that silently
        hides stored content is worse than one that shows it unlabelled.
      */}
      {orphans.length > 0 && (
        <Group
          label="Other copy"
          blurb="Stored on this record but not on the current list of pages."
          filled={orphans.length}
          total={orphans.length}
          open={open === "__other"}
          onToggle={() => setOpen(open === "__other" ? null : "__other")}
        >
          <p className="text-pretty text-sm text-zinc-500">
            These were written at some point but no page asks for them now. They are harmless —
            nothing renders them — and safe to clear.
          </p>
          {orphans.map((k) => (
            <CopyBox
              key={k}
              spec={{ key: k, label: k, kind: "body", hint: "Not used by any page." }}
              value={props.values[k] ?? ""}
              onChange={(v) => set(k, v)}
            />
          ))}
        </Group>
      )}
    </div>
  )
}

/* ── The list-valued copy ──────────────────────────────────────────────────── */

export function CopyListEditor(props: {
  keys: CopyKey[]
  values: Record<string, string[]>
  onChange: (values: Record<string, string[]>) => void
}) {
  const set = (key: string, v: string[]) => {
    const next = { ...props.values }
    if (v.length === 0) delete next[key]
    else next[key] = v
    props.onChange(next)
  }

  return (
    <div className="space-y-6">
      {props.keys.map((k) => (
        <div key={k.key}>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{k.label}</p>
          {k.hint && <p className="mb-2 mt-1 text-pretty text-xs text-zinc-400">{k.hint}</p>}
          <StringList
            values={props.values[k.key] ?? []}
            onChange={(v) => set(k.key, v)}
            addLabel="Add a line"
            itemLabel="line"
          />
        </div>
      ))}
    </div>
  )
}

/* ── The per-article "why patients choose" paragraphs ──────────────────────── */

export function ArticleBioEditor(props: {
  keys: { key: string; label: string; area: string }[]
  values: Record<string, string>
  onChange: (values: Record<string, string>) => void
  /** An article named by a click in the site preview: open its area, focus it. */
  focusKey?: string | null
}) {
  const [open, setOpen] = React.useState<string | null>(null)

  const focusKey = props.focusKey
  React.useEffect(() => {
    if (!focusKey) return
    const area = props.keys.find((k) => k.key === focusKey)?.area
    if (area) setOpen(area)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey])

  const set = (key: string, v: string) => {
    const next = { ...props.values }
    if (v.trim() === "") delete next[key]
    else next[key] = v
    props.onChange(next)
  }

  // Grouped by body area, in the order the manifest lists them, so the sections
  // match how the site's menu is organised.
  const areas: { area: string; keys: typeof props.keys }[] = []
  for (const k of props.keys) {
    const last = areas[areas.length - 1]
    if (last && last.area === k.area) last.keys.push(k)
    else areas.push({ area: k.area, keys: [k] })
  }

  return (
    <div className="space-y-2">
      {areas.map((a) => (
        <Group
          key={a.area}
          label={a.area}
          blurb={`${a.keys.length} article${a.keys.length === 1 ? "" : "s"}`}
          filled={a.keys.filter((k) => (props.values[k.key] ?? "").trim()).length}
          total={a.keys.length}
          open={open === a.area}
          onToggle={() => setOpen(open === a.area ? null : a.area)}
        >
          {a.keys.map((k) => (
            <CopyBox
              key={k.key}
              spec={{
                key: k.key,
                label: k.label,
                kind: "body",
                hint: "Why patients choose this surgeon for this problem. Leave blank and the article ends without the section.",
              }}
              value={props.values[k.key] ?? ""}
              onChange={(v) => set(k.key, v)}
              focused={focusKey === k.key}
            />
          ))}
        </Group>
      ))}
    </div>
  )
}
