interface RateLimitEntry {
  count: number
  resetAt: number // Unix timestamp in ms
}

const store = new Map<string, RateLimitEntry>()

const WINDOW_MS = 15 * 60 * 1000 // 15 minutes

/**
 * The default ceiling, which is a login-abuse shape: five tries per quarter
 * hour makes password guessing useless and costs a real person nothing.
 *
 * It is the wrong shape for every caller whose happy path is a person clicking
 * repeatedly — those pass their own `max`. Sharing one number between "someone
 * is attacking the login" and "someone is previewing their own draft" means the
 * feature's normal use is indistinguishable from the attack it defends against.
 */
const MAX_ATTEMPTS = 5

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: Date
}

export function checkRateLimit(key: string, max: number = MAX_ATTEMPTS): RateLimitResult {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true, remaining: max - 1, resetAt: new Date(now + WINDOW_MS) }
  }

  if (entry.count >= max) {
    return { allowed: false, remaining: 0, resetAt: new Date(entry.resetAt) }
  }

  entry.count += 1
  return { allowed: true, remaining: max - entry.count, resetAt: new Date(entry.resetAt) }
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
