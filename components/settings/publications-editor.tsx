"use client"

/**
 * A surgeon's publication list.
 *
 * Horner's runs to about a hundred entries of six fields each. Six hundred boxes
 * is not something anyone is going to fill in, and the list does not originate
 * here anyway — it comes out of PubMed, Scopus or a CV, where it is already a
 * table. So the primary way in is a paste, and the row editor is for fixing the
 * two or three the paste got wrong.
 *
 * Pasting REPLACES the list rather than appending. A publication list is a
 * single exported artefact; appending a re-export silently doubles it, and the
 * duplicates are only visible by scrolling a hundred rows. Replacing is
 * recoverable — the draft is not saved until Save — and appending is not.
 */

import * as React from "react"
import { ClipboardPaste, TriangleAlert } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { CollectionEditor } from "@/components/settings/collection-editor"
import { Field, Grid, Input } from "@/components/settings/editor-fields"
import type { SurgeonPublication } from "@/lib/surgeon-site"

/* ── Parsing a pasted table ────────────────────────────────────────────────── */

/**
 * One row of delimiter-separated text, respecting quotes.
 *
 * Titles contain commas — "Anterior cruciate ligament reconstruction, revision"
 * — so a naive split on comma cuts them in half. Tabs are the preferred
 * delimiter for exactly this reason (a spreadsheet copy is tab-separated and
 * needs no quoting at all), but a pasted CSV has to work too.
 */
function splitRow(line: string, delimiter: string): string[] {
  const out: string[] = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"') {
        // "" inside a quoted cell is an escaped quote, not the end of it.
        if (line[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) {
      out.push(cell)
      cell = ""
    } else cell += ch
  }
  out.push(cell)
  return out.map((c) => c.trim())
}

const COLUMNS = ["title", "year", "date", "journal", "type", "url"] as const
type Column = (typeof COLUMNS)[number]

/** Header spellings seen in the wild, mapped to our field names. */
const HEADER_ALIASES: Record<string, Column> = {
  title: "title",
  "article title": "title",
  year: "year",
  "publication year": "year",
  date: "date",
  "publication date": "date",
  journal: "journal",
  "journal/book": "journal",
  source: "journal",
  type: "type",
  "publication type": "type",
  url: "url",
  link: "url",
  doi: "url",
}

export interface ParseResult {
  rows: SurgeonPublication[]
  /** Line numbers that produced nothing, with why. */
  skipped: { line: number; reason: string }[]
  /** Whether a header row was recognised, and the order it implied. */
  columns: Column[]
  headerFound: boolean
}

export function parsePublications(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "")
  const skipped: { line: number; reason: string }[] = []
  if (lines.length === 0) return { rows: [], skipped, columns: [...COLUMNS], headerFound: false }

  // Tab wins when present: a spreadsheet paste is tab-separated, and its cells
  // are then unquoted, so treating it as CSV would mangle every title with a
  // comma in it.
  const delimiter = (lines[0] ?? "").includes("\t") ? "\t" : ","

  let columns: Column[] = [...COLUMNS]
  let headerFound = false
  let start = 0

  const firstCells = splitRow(lines[0] ?? "", delimiter).map((c) => c.toLowerCase())
  const mapped = firstCells.map((c) => HEADER_ALIASES[c])
  if (mapped.filter(Boolean).length >= 2) {
    headerFound = true
    start = 1
    // An unrecognised column keeps its slot so the ones after it stay aligned;
    // "__skip" is not a field, so its value is discarded.
    columns = mapped.map((m) => m ?? ("__skip" as Column))
  }

  const rows: SurgeonPublication[] = []
  for (let i = start; i < lines.length; i++) {
    const cells = splitRow(lines[i] ?? "", delimiter)
    const get = (c: Column) => {
      const at = columns.indexOf(c)
      return at >= 0 ? (cells[at] ?? "") : ""
    }

    const title = get("title")
    if (!title) {
      skipped.push({ line: i + 1, reason: "no title" })
      continue
    }

    const rawYear = get("year")
    const date = get("date")
    // A year is required by the site's grouping. Fall back to the first
    // four-digit run in the date rather than dropping the row: an export that
    // has "2019 Mar 14" and no year column is still a usable list.
    const year =
      Number.parseInt(rawYear, 10) || Number.parseInt(date.match(/\b(19|20)\d{2}\b/)?.[0] ?? "", 10)
    if (!year) {
      skipped.push({ line: i + 1, reason: "no year" })
      continue
    }

    rows.push({
      title,
      year,
      date: date || String(year),
      journal: get("journal"),
      type: get("type"),
      url: get("url"),
    })
  }

  return { rows, skipped, columns, headerFound }
}

/* ── The editor ────────────────────────────────────────────────────────────── */

export function PublicationsEditor(props: {
  items: SurgeonPublication[]
  onChange: (items: SurgeonPublication[]) => void
}) {
  const [pasting, setPasting] = React.useState(false)
  const [text, setText] = React.useState("")

  const result = React.useMemo(() => (text.trim() ? parsePublications(text) : null), [text])

  const apply = () => {
    if (!result) return
    props.onChange(result.rows)
    setText("")
    setPasting(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-pretty text-sm text-zinc-500">
          {props.items.length === 0
            ? "No publications. The research pages stay hidden until there is at least one."
            : `${props.items.length} publication${props.items.length === 1 ? "" : "s"}, grouped by year on the site.`}
        </p>
        <button
          type="button"
          onClick={() => setPasting(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
        >
          <ClipboardPaste className="size-4" /> Paste a list
        </button>
      </div>

      <CollectionEditor
        items={props.items}
        onChange={props.onChange}
        blank={() => ({ title: "", year: new Date().getFullYear(), date: "", journal: "", type: "", url: "" })}
        itemLabel="publication"
        emptyHint="No publications yet. Paste a list from PubMed or a CV, or add one by hand."
        summary={(p) => ({
          title: p.title,
          detail: [p.journal, p.date || String(p.year)].filter(Boolean).join(" · "),
        })}
        form={(p, update) => (
          <>
            <Field label="Title" wide>
              <Input value={p.title} onChange={(v) => update({ ...p, title: v })} />
            </Field>
            <Grid>
              <Field label="Year" hint="Used to group the list.">
                <Input
                  value={String(p.year || "")}
                  type="number"
                  onChange={(v) => update({ ...p, year: Number.parseInt(v, 10) || 0 })}
                />
              </Field>
              <Field label="Date" hint='As printed, e.g. "2019 Mar 14".'>
                <Input value={p.date} onChange={(v) => update({ ...p, date: v })} />
              </Field>
              <Field label="Journal">
                <Input value={p.journal} onChange={(v) => update({ ...p, journal: v })} />
              </Field>
              <Field label="Type" hint='e.g. "Journal Article", "Review".'>
                <Input value={p.type} onChange={(v) => update({ ...p, type: v })} />
              </Field>
              <Field label="Link" hint="PubMed, DOI or the publisher." wide>
                <Input value={p.url} onChange={(v) => update({ ...p, url: v })} />
              </Field>
            </Grid>
          </>
        )}
      />

      <Dialog open={pasting} onOpenChange={(o) => !o && setPasting(false)}>
        <DialogContent className="max-h-[85dvh] max-w-3xl overflow-y-auto rounded-xl">
          <DialogHeader>
            <DialogTitle>Paste a publication list</DialogTitle>
            <DialogDescription className="text-pretty">
              Copy the rows straight out of a spreadsheet, or paste a CSV export. This replaces
              the whole list — nothing is stored until you save the draft.
            </DialogDescription>
          </DialogHeader>

          <div>
            <p className="mb-2 text-pretty text-xs text-zinc-500">
              Columns are recognised from a header row. Without one, the order is assumed to be{" "}
              <span className="font-medium text-zinc-700">
                title, year, date, journal, type, link
              </span>
              .
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              aria-label="Pasted publication rows"
              placeholder={
                "Title\tYear\tDate\tJournal\tType\tURL\nOutcomes after…\t2019\t2019 Mar 14\tJAMA\tJournal Article\thttps://…"
              }
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-xs outline-none transition-colors focus:border-zinc-400"
            />
          </div>

          {result && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm">
              <p className="font-medium text-zinc-900">
                {result.rows.length} publication{result.rows.length === 1 ? "" : "s"} read
                {result.headerFound ? ", header row recognised" : ""}
              </p>
              {result.skipped.length > 0 && (
                <div className="mt-2 flex items-start gap-2 text-amber-700">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  <div className="text-pretty text-xs">
                    <p>
                      {result.skipped.length} line{result.skipped.length === 1 ? "" : "s"} skipped:{" "}
                      {result.skipped
                        .slice(0, 5)
                        .map((s) => `line ${s.line} (${s.reason})`)
                        .join(", ")}
                      {result.skipped.length > 5 && " …"}
                    </p>
                  </div>
                </div>
              )}
              {result.rows[0] && (
                <p className="mt-2 truncate text-xs text-zinc-500">
                  First: {result.rows[0].title} — {result.rows[0].journal || "no journal"},{" "}
                  {result.rows[0].year}
                </p>
              )}
            </div>
          )}

          <div className="mt-2 flex items-center justify-end gap-2 border-t border-zinc-100 pt-4">
            <button
              type="button"
              onClick={() => setPasting(false)}
              className="rounded-lg px-3 py-2 text-sm text-zinc-600 transition-colors hover:text-zinc-900"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={!result || result.rows.length === 0}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-40"
            >
              Replace {props.items.length > 0 ? `all ${props.items.length}` : "the list"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
