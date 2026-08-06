// Value rating logged on an engagement (note/call/meeting), stored in meta.rating.
// Plain module (not "use server") so both the client engagement bar and the
// server actions can import these sync helpers.

export const ACTIVITY_RATINGS: { value: number; label: string }[] = [
  { value: 1, label: "Low Value" },
  { value: 2, label: "Mid Value" },
  { value: 3, label: "High Value" },
]

export function ratingLabel(rating?: number | null): string | null {
  return ACTIVITY_RATINGS.find((r) => r.value === Number(rating))?.label ?? null
}

// Normalize an incoming rating to { rating } for meta, or nothing when unset/invalid.
export function ratingMeta(rating?: number): { rating: number } | undefined {
  const r = Number(rating)
  return r >= 1 && r <= 3 ? { rating: r } : undefined
}
