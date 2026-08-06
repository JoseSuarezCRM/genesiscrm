// Plain (non-"use server") helpers for media URLs. Kept out of
// app/actions/media.ts because a "use server" module may only export async
// functions — these are sync and are imported by route handlers too.

// Absolute base URL, for contexts that leave the app (email images).
export function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
  ).replace(/\/$/, "")
}

// Canonical, RELATIVE reference to a media asset. Used for in-app display and
// stored in template blocks — being same-origin, it always renders in the
// builder/library regardless of how the deploy's base URL is configured.
export function mediaUrl(id: string): string {
  return `/api/media/${id}`
}

// Absolute media URL — only for email HTML sent to recipients, who can't resolve
// a relative path. Needs a correct base (NEXT_PUBLIC_APP_URL / NEXTAUTH_URL).
export function absoluteMediaUrl(id: string): string {
  return `${appBaseUrl()}${mediaUrl(id)}`
}

// Extract a media asset id from a relative or absolute /api/media/<id> URL.
export function mediaIdFromUrl(url: string): string | null {
  const m = /\/api\/media\/([A-Za-z0-9_-]+)/.exec(url || "")
  return m ? m[1] : null
}

// Rewrite relative /api/media/<id> image srcs to absolute — call when producing
// HTML that will be delivered outside the app (e.g. an outgoing email).
export function absolutizeMediaUrls(html: string): string {
  const base = appBaseUrl()
  if (!base) return html
  return html.replace(/(src=")(\/api\/media\/[A-Za-z0-9_-]+)/g, (_m, p1, path) => `${p1}${base}${path}`)
}
