// Plain (non-"use server") helpers for building public media URLs. Kept out of
// app/actions/media.ts because a "use server" module may only export async
// functions — these are sync and are imported by route handlers too.

// Absolute base URL for building public asset links usable in emails/PDFs.
export function appBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
  ).replace(/\/$/, "")
}

// Public URL for a media asset — served (bytes only) via our own route so it
// works in the builder, in recipients' inboxes, and in generated PDFs.
export function mediaUrl(id: string): string {
  return `${appBaseUrl()}/api/media/${id}`
}
