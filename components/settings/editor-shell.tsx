"use client"

/**
 * The frame the settings editors sit in: a section rail, one panel at a time,
 * and an optional live preview.
 *
 * It replaces a stack of accordions in one long page. That worked for seven
 * sections; the surgeon editor is heading for fifteen, including fifty page-copy
 * keys and a hundred publications, and a column of collapsed headers is not a
 * way to find anything. The rail keeps every section one click away and shows
 * which ones still need attention.
 *
 * Shared by the surgeon-site and practice editors so they cannot drift into two
 * different-feeling screens.
 */

import * as React from "react"
import { CircleAlert, Eye, PencilLine, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

export interface EditorSection {
  id: string
  label: string
  /** One line, shown under the panel title. */
  hint: string
  /** Rendered in the rail — e.g. "Per surgeon", or a count. */
  badge?: string
  /** Draws attention in the rail: something here is missing or wrong. */
  needsAttention?: boolean
  panel: React.ReactNode
  /**
   * The page the preview should show for this section, e.g. "/about". The
   * preview follows the section being edited, so you are looking at the thing
   * you are changing rather than hunting for it.
   */
  previewPath?: string
}

export function EditorShell(props: {
  title: string
  /** Under the title: when it was last published, last deployed, and so on. */
  subtitle?: React.ReactNode
  /** Save / publish buttons. */
  actions?: React.ReactNode
  /** Errors and confirmations, above everything. */
  notices?: React.ReactNode
  sections: EditorSection[]
  /**
   * Whether a preview can be built at all. False means no Preview tab, rather
   * than a tab that explains why it cannot work.
   */
  canPreview?: boolean
  /**
   * Produces the draft URL, called when Preview is opened — not on page load.
   *
   * On demand because building it mints the site's preview key, and a GET that
   * quietly creates a credential is a surprise. Returns null when it cannot be
   * built, and the shell says so rather than framing a broken URL.
   */
  resolvePreviewSrc?: (path?: string) => Promise<string | null>
  /** Called before showing the preview — the editors save first. */
  onBeforePreview?: () => Promise<void> | void
}) {
  const [active, setActive] = React.useState(props.sections[0]?.id ?? "")
  const [tab, setTab] = React.useState<"edit" | "preview">("edit")
  // Bumped to force the iframe to reload after a save.
  const [previewNonce, setPreviewNonce] = React.useState(0)
  const [previewing, setPreviewing] = React.useState(false)
  const [previewSrc, setPreviewSrc] = React.useState<string | null>(null)
  const [previewError, setPreviewError] = React.useState<string | null>(null)

  const section = props.sections.find((s) => s.id === active) ?? props.sections[0]

  const showPreview = async () => {
    setPreviewing(true)
    setPreviewError(null)
    try {
      await props.onBeforePreview?.()
      const src = (await props.resolvePreviewSrc?.(section?.previewPath)) ?? null
      if (!src) {
        setPreviewError("The preview link could not be built.")
        setPreviewSrc(null)
      } else {
        setPreviewSrc(src)
      }
      setPreviewNonce((n) => n + 1)
      setTab("preview")
    } finally {
      setPreviewing(false)
    }
  }

  // The nonce makes a save reload the frame rather than serving it from cache.
  const frameSrc = previewSrc
    ? previewSrc + (previewSrc.includes("?") ? "&" : "?") + "_r=" + previewNonce
    : ""

  return (
    <div className="mt-4 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-balance text-2xl font-semibold tracking-tight text-zinc-900">
            {props.title}
          </h1>
          {props.subtitle && <p className="mt-1 text-pretty text-sm text-zinc-500">{props.subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">{props.actions}</div>
      </div>

      {props.notices && <div className="mt-5 space-y-3">{props.notices}</div>}

      {props.canPreview && (
        <div className="mt-5 inline-flex rounded-lg border border-zinc-200 bg-white p-0.5">
          <button
            type="button"
            onClick={() => setTab("edit")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === "edit" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900",
            )}
          >
            <PencilLine className="size-4" /> Edit
          </button>
          <button
            type="button"
            onClick={() => void showPreview()}
            disabled={previewing}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
              tab === "preview" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900",
            )}
          >
            <Eye className="size-4" /> Preview
          </button>
        </div>
      )}

      {tab === "preview" && props.canPreview ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-2.5">
            <p className="truncate text-xs text-zinc-500">
              The saved draft, as it would look published.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPreviewNonce((n) => n + 1)}
                aria-label="Reload the preview"
                className="text-zinc-400 transition-colors hover:text-zinc-900"
              >
                <RefreshCw className="size-4" />
              </button>
              <a
                href={frameSrc}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-zinc-600 underline-offset-4 hover:underline"
              >
                Open in a tab
              </a>
            </div>
          </div>
          {previewError ? (
            <p className="px-4 py-10 text-center text-sm text-zinc-500">{previewError}</p>
          ) : (
            /*
              dvh, not vh: on mobile browsers vh includes the collapsing toolbar,
              so the frame would be taller than the visible area.
            */
            <iframe
              key={previewNonce}
              src={frameSrc}
              title="Site preview"
              className="h-[70dvh] w-full border-0 bg-white"
            />
          )}
        </div>
      ) : (
        <div className="mt-4 grid gap-5 lg:grid-cols-[15rem_1fr]">
          <nav aria-label="Sections" className="lg:sticky lg:top-4 lg:self-start">
            <ul className="space-y-0.5">
              {props.sections.map((s) => {
                const isActive = s.id === section?.id
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setActive(s.id)}
                      aria-current={isActive ? "true" : undefined}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                        isActive
                          ? "bg-zinc-900 font-medium text-white"
                          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{s.label}</span>
                      {s.needsAttention && (
                        <CircleAlert
                          className={cn("size-3.5 shrink-0", isActive ? "text-amber-300" : "text-amber-500")}
                          aria-label="Needs attention"
                        />
                      )}
                      {s.badge && (
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 py-0.5 text-[0.65rem] tabular-nums",
                            isActive ? "bg-white/15 text-white" : "bg-zinc-100 text-zinc-500",
                          )}
                        >
                          {s.badge}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>

          <div className="min-w-0 rounded-xl border border-zinc-200 bg-white">
            {section && (
              <>
                <div className="border-b border-zinc-100 px-5 py-4">
                  <h2 className="text-balance text-base font-semibold text-zinc-900">{section.label}</h2>
                  <p className="mt-0.5 text-pretty text-sm text-zinc-500">{section.hint}</p>
                </div>
                <div className="p-5">{section.panel}</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
