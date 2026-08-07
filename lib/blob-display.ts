// Private-store Blob images can't be shown via a bare <img src>; route them
// through the authenticated /api/documents/image proxy for in-app display.
// (The PDF renderer embeds bytes directly with the token, so it uses the raw URL.)

export function blobDisplayUrl(url?: string | null): string {
  if (!url) return ""
  return /blob\.vercel-storage\.com\/document-assets\//.test(url)
    ? `/api/documents/image?u=${encodeURIComponent(url)}`
    : url
}

// Rewrite blob-asset <img src> in a preview HTML string to the proxy for display.
export function proxyImageSrc(html: string): string {
  return html.replace(/src="(https:\/\/[^"]*blob\.vercel-storage\.com\/document-assets\/[^"]*)"/g,
    (_m, u) => `src="/api/documents/image?u=${encodeURIComponent(u)}"`)
}
