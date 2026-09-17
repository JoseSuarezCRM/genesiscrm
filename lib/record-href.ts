// The detail-page route for a record, as a pure function.
//
// Kept out of lib/reporting/objects.ts (which owns the report registry and
// imports Prisma) so a client component can link to a record without dragging
// the ORM into the browser bundle. That module imports this one, so there's a
// single list rather than two that drift.

const RECORD_ROUTE: Record<string, string> = {
  REFERRAL: "/referrals",
  PRACTICE: "/practices",
  PROVIDER: "/referring-doctors",
  LOCATION: "/locations",
  SURGERY: "/surgery",
}

/**
 * Link to a record, or null when there's nowhere to send them — an object with
 * no detail page, or a missing id.
 *
 * Object keys arrive in two shapes: the uppercase keys the generic record
 * triggers write ("REFERRAL"), and the lowercase ones the older referral- and
 * surgery-specific triggers wrote ("referral"). Custom objects keep their case,
 * since "CO:<key>" maps to a real URL segment.
 */
export function recordHref(objectKey: string, id: string | null | undefined): string | null {
  if (!id || !objectKey) return null
  if (objectKey.startsWith("CO:")) return `/objects/${objectKey.slice(3)}/${id}`
  const base = RECORD_ROUTE[objectKey.toUpperCase()]
  return base ? `${base}/${id}` : null
}
