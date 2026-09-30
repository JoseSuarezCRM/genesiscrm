/**
 * What each field shows, when three sources want to fill it.
 *
 *   rules   the ported parser, re-run on every keystroke — instant, free
 *   ai      the model's reading of a particular paste — slower, better
 *   manual  whatever the person typed or picked — always wins
 *
 * The rule the whole intake depends on: **a field someone has touched is never
 * overwritten.** Staff fill the form while the AI is still reading; if its
 * result could replace what they had just corrected, nobody could trust any
 * field on the screen.
 *
 * An AI result is tied to the source text it was computed from. When the
 * source changes, the result stays valid only for fields the parser still reads
 * the same way — so a pasted second line invalidates only what it affects,
 * instead of throwing away the whole AI reading.
 */

import type { FieldKey, ReferralCallFields } from "./types"

export interface AiReading {
  /** The source text/image this reading was computed from. */
  sourceKey: string
  values: ReferralCallFields
  /** What the parser said at the time, to tell which fields a later edit changed. */
  rulesAtRequest: ReferralCallFields
}

export type Manual = Partial<ReferralCallFields>

/** A cheap identity for a paste: the text plus which image, if any. */
export function sourceKey(text: string, imageKey: string | null): string {
  return `${imageKey ?? ""}\u0000${text}`
}

export function autoValue<K extends FieldKey>(
  key: K,
  rules: ReferralCallFields,
  ai: AiReading | null,
  currentKey: string,
): ReferralCallFields[K] {
  if (!ai) return rules[key]
  if (ai.sourceKey === currentKey) return ai.values[key]
  // The source changed since the AI read it. Keep the AI's value only where the
  // parser still agrees with what it saw then — i.e. the change didn't touch it.
  return rules[key] === ai.rulesAtRequest[key] ? ai.values[key] : rules[key]
}

export function displayValue<K extends FieldKey>(
  key: K,
  rules: ReferralCallFields,
  ai: AiReading | null,
  manual: Manual,
  currentKey: string,
): ReferralCallFields[K] {
  return key in manual ? (manual[key] as ReferralCallFields[K]) : autoValue(key, rules, ai, currentKey)
}

/** Every field, resolved. */
export function resolveFields(
  rules: ReferralCallFields,
  ai: AiReading | null,
  manual: Manual,
  currentKey: string,
): ReferralCallFields {
  const out = { ...rules }
  for (const key of Object.keys(rules) as FieldKey[]) {
    ;(out as Record<string, unknown>)[key] = displayValue(key, rules, ai, manual, currentKey)
  }
  return out
}

/**
 * How many fields an AI reading would change if applied — for the "Apply AI
 * suggestions (N)" banner shown when a reading arrives after the call was saved.
 */
export function pendingSuggestions(
  current: ReferralCallFields,
  ai: ReferralCallFields,
): FieldKey[] {
  return (Object.keys(ai) as FieldKey[]).filter((k) => {
    const next = ai[k]
    if (typeof next === "string" && !next.trim()) return false
    if (next === false) return false
    return current[k] !== next
  })
}
