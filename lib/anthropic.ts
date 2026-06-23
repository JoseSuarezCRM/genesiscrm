import Anthropic from "@anthropic-ai/sdk"

// Lazy-initialized to avoid build-time errors when env var isn't set yet
let _client: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  // maxRetries: the SDK retries 429/5xx/529 + connection errors with exponential
  // backoff. Default is 2 (3 attempts); bump to 4 (5 attempts) so transient
  // "overloaded_error" (529) blips don't surface to the user as a failure.
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!, maxRetries: 4 })
  return _client
}
