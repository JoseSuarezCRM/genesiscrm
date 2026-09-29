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
import {
  isEditablePath, isImagePath, safePagePath, type ContentPath,
} from "@/lib/surgeon-site-address"
import { cn } from "@/lib/utils"

/** Bumped only if the message shape changes incompatibly; both halves check it. */
const PROTOCOL = 1

/**
 * A value to push into the preview frame so the page shows it without reloading.
 *
 * `nonce` exists because the same field can be set to the same value twice (undo,
 * or a retype) and the frame still needs to hear about it.
 */
export interface PreviewPatch {
  path: ContentPath
  value: string
  nonce: number
}

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
  /**
   * A staff member clicked an editable string in the preview.
   *
   * The frame reports *which field*, never a new value — it runs on a public
   * marketing site and has no business proposing content. What happens next is
   * entirely this app's decision.
   */
  onPreviewFocus?: (path: ContentPath) => void
  /**
   * The preview asked for an image to be chosen. Same rule: a path, not a URL.
   * `page` is validated here before it is passed on, because a per-page
   * replacement uses it as a key on the record.
   */
  onPreviewPickImage?: (path: ContentPath, page: string | null, hero: boolean) => void
  /** A chosen image to show in the frame straight away. `url` must be absolute. */
  imageUpdate?: { path: ContentPath; url: string; nonce: number } | null
  /** Pushed into the frame so the page shows an edit without reloading. */
  patch?: PreviewPatch | null
  /** Where the frame currently is, so a caller can follow along. */
  onPreviewNavigate?: (pathname: string) => void
  /**
   * Open this section from outside — used when a click in the preview names a
   * field that lives somewhere other than the panel on screen.
   *
   * The rail still moves on its own when clicked; this only nudges it.
   */
  openSection?: string | null
}) {
  const [active, setActive] = React.useState(props.sections[0]?.id ?? "")
  const [tab, setTab] = React.useState<"edit" | "preview">("edit")
  // Bumped to force the iframe to reload after a save.
  const [previewNonce, setPreviewNonce] = React.useState(0)
  const [previewing, setPreviewing] = React.useState(false)
  const [previewSrc, setPreviewSrc] = React.useState<string | null>(null)
  const [previewError, setPreviewError] = React.useState<string | null>(null)
  const frameRef = React.useRef<HTMLIFrameElement | null>(null)
  const [frameReady, setFrameReady] = React.useState(false)

  /**
   * How much of the page on screen is editable, as the frame measured it.
   *
   * Only about a tenth of a clinical article is this surgeon's own text; the
   * rest is written into the page template. Saying so — per page, as a number —
   * is the difference between an editor that seems to work on some paragraphs
   * and not others, and one that tells you why.
   */
  const [coverage, setCoverage] = React.useState<{
    pathname: string
    editableBlocks: number
    totalBlocks: number
    editableWords: number
    totalWords: number
  } | null>(null)
  const [highlight, setHighlight] = React.useState(true)
  /** Brief notice after a click on text that is not editable here. */
  const [fixedNotice, setFixedNotice] = React.useState(false)

  /**
   * The origin the preview is served from, derived from the URL we built.
   *
   * Every message is checked against it and every message we send is addressed
   * to it. Never "*": that would hand a physician's unpublished draft to
   * whatever happened to occupy the frame.
   */
  const previewOrigin = React.useMemo(() => {
    if (!previewSrc) return null
    try {
      return new URL(previewSrc).origin
    } catch {
      return null
    }
  }, [previewSrc])

  const section = props.sections.find((s) => s.id === active) ?? props.sections[0]

  const openSection = props.openSection
  React.useEffect(() => {
    if (openSection) setActive(openSection)
  }, [openSection])

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
      setFrameReady(false)
      setPreviewNonce((n) => n + 1)
      setTab("preview")
    } finally {
      setPreviewing(false)
    }
  }

  /**
   * Listen to the preview frame.
   *
   * Two checks, and both are load-bearing. The origin has to be the one we
   * framed — otherwise any page could drive this editor. And `event.source` has
   * to be that frame's own window: origin alone would also accept a popup, or a
   * second frame, served from the same place.
   *
   * Everything past those checks is still treated as hostile input. The path is
   * validated against the allow-list in `lib/surgeon-site-address.ts`; nothing
   * here walks an unvetted string into the record.
   */
  const handlers = React.useRef({
    onPreviewFocus: props.onPreviewFocus,
    onPreviewPickImage: props.onPreviewPickImage,
    onPreviewNavigate: props.onPreviewNavigate,
  })
  handlers.current = {
    onPreviewFocus: props.onPreviewFocus,
    onPreviewPickImage: props.onPreviewPickImage,
    onPreviewNavigate: props.onPreviewNavigate,
  }

  React.useEffect(() => {
    if (!previewOrigin) return

    const onMessage = (e: MessageEvent) => {
      if (e.origin !== previewOrigin) return
      if (e.source !== frameRef.current?.contentWindow) return
      const msg = e.data
      if (!msg || typeof msg !== "object" || msg.gosm !== PROTOCOL) return

      switch (msg.type) {
        case "ready":
          setFrameReady(true)
          return
        case "nav":
          if (typeof msg.pathname === "string") handlers.current.onPreviewNavigate?.(msg.pathname)
          return
        case "focus":
          if (isEditablePath(msg.path)) handlers.current.onPreviewFocus?.(msg.path)
          return
        case "pick-image":
          if (isEditablePath(msg.path) && isImagePath(msg.path)) {
            handlers.current.onPreviewPickImage?.(msg.path, safePagePath(msg.page), msg.hero === true)
          }
          return
        case "coverage": {
          const c = msg.coverage
          // Numbers from another origin: take them only if they are numbers.
          const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null)
          if (!c || typeof c !== "object" || typeof msg.pathname !== "string") return
          const eb = n(c.editableBlocks), tb = n(c.totalBlocks), ew = n(c.editableWords), tw = n(c.totalWords)
          if (eb === null || tb === null || ew === null || tw === null) return
          setCoverage({ pathname: msg.pathname, editableBlocks: eb, totalBlocks: tb, editableWords: ew, totalWords: tw })
          return
        }
        case "fixed":
          setFixedNotice(true)
          return
      }
    }

    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [previewOrigin])

  /**
   * Open the conversation once the frame has loaded.
   *
   * This side speaks first, which is how the frame learns where to reply —
   * neither half has the other's origin written into it.
   */
  const greetFrame = React.useCallback(() => {
    if (!previewOrigin) return
    frameRef.current?.contentWindow?.postMessage({ gosm: PROTOCOL, type: "hello" }, previewOrigin)
  }, [previewOrigin])

  React.useEffect(() => {
    if (!frameReady || !previewOrigin) return
    frameRef.current?.contentWindow?.postMessage(
      { gosm: PROTOCOL, type: "highlight", on: highlight },
      previewOrigin,
    )
  }, [frameReady, previewOrigin, highlight])

  // The notice is a moment, not a state: it fades on its own.
  React.useEffect(() => {
    if (!fixedNotice) return
    const t = setTimeout(() => setFixedNotice(false), 4000)
    return () => clearTimeout(t)
  }, [fixedNotice])

  // A replacement image, shown in the frame without a reload.
  React.useEffect(() => {
    const u = props.imageUpdate
    if (!u || !frameReady || !previewOrigin) return
    frameRef.current?.contentWindow?.postMessage(
      { gosm: PROTOCOL, type: "image", path: u.path, value: u.url },
      previewOrigin,
    )
  }, [props.imageUpdate, frameReady, previewOrigin])

  // Push an edit into the frame so the page updates without a reload. A reload
  // costs a request to this app and loses the reader's place on the page.
  React.useEffect(() => {
    const patch = props.patch
    if (!patch || !frameReady || !previewOrigin) return
    frameRef.current?.contentWindow?.postMessage(
      { gosm: PROTOCOL, type: "patch", path: patch.path, value: patch.value },
      previewOrigin,
    )
  }, [props.patch, frameReady, previewOrigin])

  // Following the rail: ask the frame to navigate rather than changing its src,
  // because a document load costs a request to this app and a client-side
  // navigation costs nothing.
  React.useEffect(() => {
    if (!frameReady || !previewOrigin || tab !== "preview") return
    const to = section?.previewPath
    if (!to) return
    frameRef.current?.contentWindow?.postMessage({ gosm: PROTOCOL, type: "goto", to }, previewOrigin)
  }, [frameReady, previewOrigin, tab, section?.previewPath])

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
            {coverage && coverage.totalWords > 0 ? (
              <CoverageSummary coverage={coverage} />
            ) : (
              <p className="truncate text-xs text-zinc-500">
                The saved draft, as it would look published.
              </p>
            )}
            <div className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={highlight}
                onClick={() => setHighlight((h) => !h)}
                className="inline-flex items-center gap-2 text-xs text-zinc-600 transition-colors hover:text-zinc-900"
              >
                <span
                  aria-hidden
                  className={cn(
                    "relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors",
                    highlight ? "bg-zinc-900" : "bg-zinc-200",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 size-3 rounded-full bg-white transition-transform",
                      highlight ? "translate-x-3.5" : "translate-x-0.5",
                    )}
                  />
                </span>
                Show editable
              </button>
              <button
                type="button"
                onClick={() => { setFrameReady(false); setCoverage(null); setPreviewNonce((n) => n + 1) }}
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
          {fixedNotice && (
            <p
              role="status"
              className="border-b border-zinc-100 bg-zinc-50 px-4 py-2 text-pretty text-xs text-zinc-600"
            >
              That text isn&apos;t editable here yet — it&apos;s either written into the page itself or
              put together from other settings, like the clinic list. The tinted parts are the
              ones you can change from here.
            </p>
          )}
          {previewError ? (
            <p className="px-4 py-10 text-center text-sm text-zinc-500">{previewError}</p>
          ) : (
            /*
              dvh, not vh: on mobile browsers vh includes the collapsing toolbar,
              so the frame would be taller than the visible area.
            */
            <iframe
              key={previewNonce}
              ref={frameRef}
              src={frameSrc}
              onLoad={greetFrame}
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

/**
 * "17% of this page is editable" — with the count behind it.
 *
 * Words for the percentage, because a heading and a four-hundred-word section
 * are one block each and a block count would make a page of short headings look
 * well covered. Blocks for the detail, because that is what a person sees.
 */
function CoverageSummary(props: {
  coverage: { editableBlocks: number; totalBlocks: number; editableWords: number; totalWords: number }
}) {
  const c = props.coverage
  const pct = Math.round((c.editableWords / c.totalWords) * 100)
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-zinc-100"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Share of this page's text that is editable"
      >
        <div className="h-full rounded-full bg-zinc-900" style={{ width: `${pct}%` }} />
      </div>
      <p className="truncate text-xs text-zinc-600">
        <span className="font-medium tabular-nums text-zinc-900">{pct}%</span> of this page is
        editable here
        <span className="text-zinc-400">
          {" "}
          · <span className="tabular-nums">{c.editableBlocks}</span> of{" "}
          <span className="tabular-nums">{c.totalBlocks}</span> blocks
        </span>
      </p>
    </div>
  )
}
