// Renamed built-in fields — the server half. See lib/native-labels-shared.ts for
// the rule and the client half.

import { prisma } from "@/lib/prisma"
import { RECORD_FIELDS } from "@/lib/record-field-catalog"
import { labelFrom, type NativeLabelMap } from "@/lib/native-labels-shared"

export { labelFrom, canonicalFieldKey, type NativeLabelMap } from "@/lib/native-labels-shared"

// Read on nearly every catalog build (filters build one per object), so it's
// memoised briefly per process. A rename clears this process's copy; other
// serverless instances catch up within the TTL.
const TTL_MS = 5_000
let memo: { at: number; map: NativeLabelMap } | null = null

export async function getNativeLabels(): Promise<NativeLabelMap> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.map
  const map = await loadNativeLabels(prisma)
  memo = { at: Date.now(), map }
  return map
}

/** The stored renames, read through `db` (the client, or a transaction). */
export async function loadNativeLabels(db: any): Promise<NativeLabelMap> {
  const rows: { objectType: string; fieldKey: string; label: string }[] =
    await db.nativeFieldLabel.findMany({ select: { objectType: true, fieldKey: true, label: true } }).catch(() => [])
  const map: NativeLabelMap = {}
  for (const r of rows) (map[r.objectType] ??= {})[r.fieldKey] = r.label
  return map
}

export function clearNativeLabelsMemo() {
  memo = null
}

/** Tests only (scripts/check-native-labels.ts): serve `map` until clearNativeLabelsMemo(). */
export function primeNativeLabelsForTest(map: NativeLabelMap) {
  memo = { at: Number.MAX_SAFE_INTEGER, map }
}

/**
 * What a rename request means: refused (not a built-in field of the object), a
 * reset (empty, or the catalog's own name), or the cleaned label to store.
 */
export function nativeLabelChange(objectType: string, fieldKey: string, label: string | null):
  { error: string } | { reset: true } | { label: string } {
  const field = (RECORD_FIELDS[objectType] ?? []).find((f) => f.key === fieldKey)
  if (!field) return { error: "That isn't a built-in field of this object." }
  const clean = (label ?? "").trim().replace(/\s+/g, " ").slice(0, 80)
  if (!clean || clean === field.label) return { reset: true }
  return { label: clean }
}

/** One field's current name: the admin's, else `fallback`. */
export async function nativeLabel(objectType: string, key: string, fallback: string): Promise<string> {
  return labelFrom(await getNativeLabels(), objectType, key, fallback)
}

/** A field list with every renamed field's label replaced. */
export async function applyNativeLabels<T extends { key: string; label: string }>(objectType: string, fields: T[]): Promise<T[]> {
  const map = await getNativeLabels()
  if (!map[objectType]) return fields
  return fields.map((f) => ({ ...f, label: labelFrom(map, objectType, f.key, f.label) }))
}
