"use client"

/**
 * A list of records, edited one at a time in a dialog.
 *
 * The inline `RowList` works for a label/detail pair. It does not work for a
 * clinic, which has fourteen fields plus six Spanish ones — as a table row that
 * is unreadable, and it is part of why the Spanish clinic copy never got an
 * editor at all.
 *
 * The list shows a summary line per entry; everything else lives behind Edit.
 * Adding opens the dialog on a blank record, so a new entry is filled in before
 * it appears rather than landing in the list empty.
 *
 * Radix Dialog rather than a hand-rolled overlay: focus trapping, Escape and
 * scroll locking are exactly the things not worth reimplementing.
 */

import * as React from "react"
import { Plus, Pencil, Trash2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { confirmDialog } from "@/components/ui/confirm-dialog"

export function CollectionEditor<T>(props: {
  items: T[]
  onChange: (items: T[]) => void
  /** A fresh, empty record. */
  blank: () => T
  /** What one of these is called: "clinic", "review". */
  itemLabel: string
  /** The line shown in the list. Keep it short — it is the only thing scanned. */
  summary: (item: T) => { title: string; detail?: string }
  /**
   * The dialog body. `index` is where this entry sits (or will sit, when new),
   * so inputs can be named by their record path for the preview's click-to-focus.
   */
  form: (item: T, update: (item: T) => void, index: number) => React.ReactNode
  /** Shown when there is nothing yet. Always paired with the add button. */
  emptyHint: string
  /** Let entries be reordered — order is meaningful for clinics and protocols. */
  reorderable?: boolean
  /**
   * Open this entry, because a click in the site preview named it.
   *
   * `nonce` makes a second click on the same entry reopen it after it was
   * closed; the index alone would not change, so nothing would happen.
   */
  focus?: { index: number; nonce: number } | null
}) {
  // -1 is "closed"; items.length is "adding a new one".
  const [editing, setEditing] = React.useState(-1)
  const [draft, setDraft] = React.useState<T | null>(null)

  const open = (index: number, value: T) => {
    setDraft(value)
    setEditing(index)
  }

  const close = () => {
    setEditing(-1)
    setDraft(null)
  }

  const focus = props.focus
  React.useEffect(() => {
    if (!focus) return
    const item = props.items[focus.index]
    if (item !== undefined) open(focus.index, item)
    // Keyed on the nonce: the request is the event, not the index.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce])

  const commit = () => {
    if (draft === null) return
    const next = [...props.items]
    if (editing === props.items.length) next.push(draft)
    else next[editing] = draft
    props.onChange(next)
    close()
  }

  const remove = async (i: number) => {
    const item = props.items[i]
    if (item === undefined) return
    const { title } = props.summary(item)
    const what = title || "this " + props.itemLabel
    if (!(await confirmDialog("Remove " + what + "?"))) return
    props.onChange(props.items.filter((_, j) => j !== i))
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= props.items.length) return
    const next = [...props.items]
    const [row] = next.splice(from, 1)
    if (row !== undefined) next.splice(to, 0, row)
    props.onChange(next)
  }

  return (
    <div className="space-y-2">
      {props.items.length === 0 ? (
        // An empty state with exactly one next action.
        <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center">
          <p className="text-pretty text-sm text-zinc-500">{props.emptyHint}</p>
          <button
            type="button"
            onClick={() => open(0, props.blank())}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            <Plus className="size-4" /> Add {props.itemLabel}
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200">
          {props.items.map((item, i) => {
            const { title, detail } = props.summary(item)
            const name = title || props.itemLabel
            return (
              <li key={i} className="flex items-center gap-3 bg-white px-3 py-2.5">
                {props.reorderable && (
                  <span className="flex flex-col text-[0.6rem] leading-none text-zinc-300">
                    <button
                      type="button"
                      onClick={() => move(i, i - 1)}
                      disabled={i === 0}
                      aria-label={"Move " + name + " up"}
                      className="py-0.5 transition-colors hover:text-zinc-600 disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, i + 1)}
                      disabled={i === props.items.length - 1}
                      aria-label={"Move " + name + " down"}
                      className="py-0.5 transition-colors hover:text-zinc-600 disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-900">
                    {title || <span className="text-zinc-400">Untitled {props.itemLabel}</span>}
                  </span>
                  {detail && <span className="block truncate text-xs text-zinc-500">{detail}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => open(i, item)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                >
                  <Pencil className="size-3.5" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => void remove(i)}
                  aria-label={"Remove " + name}
                  className="text-zinc-300 transition-colors hover:text-red-600"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {props.items.length > 0 && (
        <button
          type="button"
          onClick={() => open(props.items.length, props.blank())}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
        >
          <Plus className="size-4" /> Add {props.itemLabel}
        </button>
      )}

      <Dialog open={editing >= 0} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-h-[85dvh] max-w-2xl overflow-y-auto rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-balance capitalize">
              {editing === props.items.length ? "New " + props.itemLabel : "Edit " + props.itemLabel}
            </DialogTitle>
            <DialogDescription className="text-pretty">
              Changes apply when you press Done. Nothing is live until the site is published.
            </DialogDescription>
          </DialogHeader>

          {draft !== null && (
            <div className="space-y-4">{props.form(draft, setDraft, editing)}</div>
          )}

          <div className="mt-2 flex items-center justify-end gap-2 border-t border-zinc-100 pt-4">
            <button
              type="button"
              onClick={close}
              className="rounded-lg px-3 py-2 text-sm text-zinc-600 transition-colors hover:text-zinc-900"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commit}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
            >
              Done
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
