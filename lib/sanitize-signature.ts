// Server-side sanitiser for signature HTML. Dependency-free on purpose.
//
// This used `isomorphic-dompurify`, which is the right tool in a browser but on
// the server pulls in jsdom — 790-odd files, instantiated at module import, in
// every serverless function that touches a signature. The editor still uses real
// DOMPurify client-side (there it resolves to the browser build and runs against
// the native DOM); this is the server's own pass, so nothing can be stored by
// calling the action directly.
//
// Signatures are pasted wholesale from Outlook, so the input is a full document
// of table layout, inline styles and mso-* properties. All of that has to
// survive — a signature is unreadable without it — while anything executable
// must not.
//
// A regex pass is weaker than a real parser, so it's deliberately conservative:
// it strips whole elements rather than trying to repair them, and it targets the
// script-bearing vectors rather than trying to enumerate everything allowed.

// Removed with their content — none belong in an email signature. `style` is
// deliberately absent: it's kept and scrubbed further down.
const DROP_WITH_CONTENT = ["script", "iframe", "object", "embed", "applet", "noscript", "template", "form"]

/** Elements removed but whose content is kept (wrappers a paste brings along). */
const UNWRAP = ["html", "head", "body"]

/** Void/standalone elements removed outright. */
const DROP_SELF = ["link", "base", "meta", "param", "source", "input", "button", "textarea", "select"]

// @import pulls a remote stylesheet; behavior/expression are IE hooks that
// execute. DOMPurify never touched the CSS inside a <style> block either, so
// this was always handled separately.
const DANGEROUS_CSS = /@import\b[^;}]*;?|\bbehavior\s*:[^;}]*;?|\bexpression\s*\([^)]*\)/gi

function stripElement(html: string, tag: string, keepContent: boolean): string {
  const paired = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, "gi")
  let out = html.replace(paired, keepContent ? "$1" : "")
  // Any unmatched opening/closing tag left over (malformed paste, or a self
  // closing form of it).
  out = out.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi"), "")
  return out
}

export function sanitizeSignatureHtml(html: string): string {
  let out = String(html ?? "")

  // Comments can hide markup that a lenient parser later revives, and Outlook's
  // mso conditional comments are of exactly that shape.
  out = out.replace(/<!--[\s\S]*?-->/g, "")
  out = out.replace(/<!DOCTYPE[^>]*>/gi, "")

  for (const tag of DROP_WITH_CONTENT) out = stripElement(out, tag, false)
  for (const tag of UNWRAP) out = stripElement(out, tag, true)
  for (const tag of DROP_SELF) out = out.replace(new RegExp(`<${tag}\\b[^>]*>`, "gi"), "")

  // Inline event handlers, quoted or bare.
  out = out.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
  out = out.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
  out = out.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")

  // Scheme-based execution in any attribute that takes a URL. `data:` is allowed
  // only for images — the editor re-hosts those anyway, but a pasted one must
  // not become a way to serve text/html.
  out = out.replace(/\b(href|src|action|formaction|background|poster)\s*=\s*"(\s*(?:javascript|vbscript|data:text\/html)[^"]*)"/gi, "")
  out = out.replace(/\b(href|src|action|formaction|background|poster)\s*=\s*'(\s*(?:javascript|vbscript|data:text\/html)[^']*)'/gi, "")

  // The <style> block is kept — real signatures rely on it (this one uses
  // `a img { text-decoration: none }` to stop the logo links underlining) — but
  // its CSS is scrubbed.
  out = out.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (whole, css: string) =>
    whole.replace(css, css.replace(DANGEROUS_CSS, "")),
  )
  // And the same properties anywhere in an inline style attribute.
  out = out.replace(/\sstyle\s*=\s*"([^"]*)"/gi, (whole, css: string) =>
    DANGEROUS_CSS.test(css) ? ` style="${css.replace(DANGEROUS_CSS, "")}"` : whole,
  )

  return out.trim()
}
