"use client"

import { useCallback, useEffect, useRef, useState } from "react"

// Preview email HTML the way a mail client would render it.
//
// An iframe rather than a styled div, because the app's own CSS is actively
// hostile to email markup. Tailwind's preflight sets box-sizing:border-box
// (which eats a table cell's padding out of its declared width, wrapping text
// that shouldn't wrap), img{display:block} (which stacks inline logos
// vertically), and table{border-collapse:collapse}. None of that exists in
// Outlook or Gmail, so a preview rendered in the page shows a layout the
// recipient will never see.
//
// It also stops the signature's own <style> block escaping: a <style> tag
// rendered into the page applies document-wide, so previewing a signature that
// says `a{text-decoration:none}` would quietly restyle every link in the CRM.
//
// Isolation in both directions, and accurate by construction rather than by
// chasing individual rules.

/** Only what a mail client actually provides — nothing inherited from the app. */
function wrap(html: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0;background:#fff;}
  body{font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1e293b;
       -webkit-text-size-adjust:100%;word-break:normal;}
</style></head><body>${html}</body></html>`
}

export default function EmailHtmlPreview({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(80)

  // Size to the content. Without this it sits in a fixed box with its own
  // scrollbar, which is a different kind of misrepresentation.
  const measure = useCallback(() => {
    const doc = ref.current?.contentDocument
    if (!doc?.body) return
    const h = Math.max(doc.body.scrollHeight, doc.documentElement?.scrollHeight ?? 0)
    setHeight(h + 8)
  }, [])

  useEffect(() => {
    const frame = ref.current
    if (!frame) return
    measure()
    // srcDoc is same-origin, so the document is readable. Images load after the
    // first paint and change the height, hence the observer and the load hooks.
    const doc = frame.contentDocument
    if (!doc?.body) return
    const ro = new ResizeObserver(measure)
    ro.observe(doc.body)
    const imgs = Array.from(doc.images ?? [])
    for (const img of imgs) img.addEventListener("load", measure)
    return () => {
      ro.disconnect()
      for (const img of imgs) img.removeEventListener("load", measure)
    }
  }, [html, measure])

  return (
    <iframe
      ref={ref}
      title="Signature preview"
      srcDoc={wrap(html)}
      onLoad={measure}
      // Same-origin so it can be measured, but nothing in it should run.
      sandbox="allow-same-origin"
      className={className}
      style={{ width: "100%", height, border: 0, display: "block" }}
    />
  )
}
