"use client"

import { useEffect, useState } from "react"
import DOMPurify from "dompurify"

// Render untrusted HTML — a stored email body, say — sanitised in the browser.
//
// Two deliberate choices:
//
// `dompurify`, not `isomorphic-dompurify`. The isomorphic wrapper's node build
// require()s jsdom at module scope, and jsdom's dependencies (parse5,
// tough-cookie, entities, css-tree…) are ESM-only, so on a Node that can't
// require() an ES module the whole route throws ERR_REQUIRE_ESM. Plain dompurify
// has no dependencies at all.
//
// Client-only rendering. Without a window DOMPurify can't sanitise — it sets
// isSupported=false and hands the input straight back — so server-rendering this
// would ship the raw HTML into the markup, which is the exact thing being
// guarded against. Rendering the same placeholder on the server and on the first
// client pass keeps hydration happy; the real content arrives immediately after.

export default function SafeHtml({ html, className }: { html: string; className?: string }) {
  const [clean, setClean] = useState<string | null>(null)

  useEffect(() => {
    setClean(DOMPurify.sanitize(html ?? "", { ADD_ATTR: ["target"] }) as unknown as string)
  }, [html])

  if (clean === null) {
    // Text only: no markup can execute, and it keeps the box from jumping.
    return <div className={className}>{(html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}</div>
  }
  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />
}
