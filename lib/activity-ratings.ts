// Value rating logged on an engagement (note/call/meeting), stored in meta.rating.
// Plain module (not "use server") so both the client engagement bar and the
// server actions can import these sync helpers.

// Clinic Value: a plain 1 (lowest) … 6 (highest) numeric scale.
export const ACTIVITY_RATINGS: number[] = [1, 2, 3, 4, 5, 6]

// Meeting rating: a plain 1 (lowest) … 6 (highest) scale, separate from the
// clinic value above.
export const MEETING_RATINGS: number[] = [1, 2, 3, 4, 5, 6]

// Highest value on either scale (both share the same 1..6 range).
export const RATING_MAX = 6

// Normalize an incoming rating to { rating } for meta, or nothing when unset/invalid.
export function ratingMeta(rating?: number): { rating: number } | undefined {
  const r = Number(rating)
  return r >= 1 && r <= RATING_MAX ? { rating: r } : undefined
}
