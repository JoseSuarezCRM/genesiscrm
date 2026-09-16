// One sanitiser for signature HTML, shared by the editor preview and the save
// actions so the two can't disagree about what's allowed.
//
// Signatures are pasted wholesale from Outlook or an agency's .html file, so the
// input is a full document full of table layout, inline styles and mso-*
// properties. All of that has to survive — an email signature is unreadable
// without it — while anything executable must not.

import DOMPurify from "isomorphic-dompurify"

// `<style>` blocks are dropped by DOMPurify's defaults, but real signatures rely
// on them (this one uses `a img { text-decoration: none }` to keep the logo
// links from underlining). FORCE_BODY is what keeps the block *and* the body
// content when the input is a whole document.
const CONFIG = { ADD_ATTR: ["target"], ADD_TAGS: ["style"], FORCE_BODY: true }

// DOMPurify leaves the CSS inside a <style> block alone, so these get handled
// here: @import pulls a remote stylesheet, and behavior/expression are IE hooks
// that execute. Harmless in a mail client, not harmless in our own preview.
const DANGEROUS_CSS = /@import\b[^;}]*;?|\bbehavior\s*:[^;}]*;?|\bexpression\s*\([^)]*\)/gi

function scrubStyleBlocks(html: string): string {
  return html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (whole, css: string) => {
    const cleaned = css.replace(DANGEROUS_CSS, "")
    return whole.replace(css, cleaned)
  })
}

/** Strip anything executable; keep everything an email signature needs. */
export function sanitizeSignatureHtml(html: string): string {
  return scrubStyleBlocks(DOMPurify.sanitize(html ?? "", CONFIG))
}
