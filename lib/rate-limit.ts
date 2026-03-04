interface RateLimitEntry {
  count: number
  resetAt: number // Unix timestamp in ms
}

const store = new Map<string, RateLimitEntry>()

const WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const MAX_ATTEMPTS = 5

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: Date
}

export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true, remaining: MAX_ATTEMPTS - 1, resetAt: new Date(now + WINDOW_MS) }
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0, resetAt: new Date(entry.resetAt) }
  }

  entry.count += 1
  return { allowed: true, remaining: MAX_ATTEMPTS - entry.count, resetAt: new Date(entry.resetAt) }
}

export function resetRateLimit(key: string): void {
  store.delete(key)
}

// Periodically clean up expired entries to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now()
  Array.from(store.entries()).forEach(([key, entry]) => {
    if (now > entry.resetAt) store.delete(key)
  })
}, WINDOW_MS)
