/**
 * Protecting custom-object properties that code depends on.
 *
 * Custom objects are admin-editable by design: rename, retype, delete, change
 * options. That is a problem the moment code writes to one — the on-call intake
 * stores "Callback" under the id `callback` and filters on status values like
 * `sent_to_surgeon`. Delete the property or remove the option, and the intake
 * silently writes into a void or saved views silently match nothing.
 *
 * A locked property may still be relabeled, recoloured, re-described and given
 * NEW options — everything an admin reasonably wants. It may not be deleted,
 * retyped, or lose an option value that already exists.
 *
 * Enforced here, on the server, against the STORED list rather than whatever the
 * client sent — a client cannot unlock a property by omitting the flag.
 */

import type { CustomObjectProperty } from "@/app/actions/custom-objects"

export function enforcePropertyLocks(
  stored: CustomObjectProperty[],
  incoming: CustomObjectProperty[],
): { properties: CustomObjectProperty[] } | { error: string } {
  const byId = new Map(incoming.map((p) => [p.id, p]))
  const result = [...incoming]

  for (const prev of stored) {
    if (!prev.locked) continue
    const next = byId.get(prev.id)

    // Missing: a stale Settings tab, or a crafted request. Put it back rather
    // than failing the whole save, so an admin's other changes still land.
    if (!next) {
      result.push(prev)
      continue
    }

    if (next.type !== prev.type) {
      return { error: `"${prev.name}" is used by the On-call intake, so its type can't be changed.` }
    }

    const kept = new Set(next.options ?? [])
    const removed = (prev.options ?? []).filter((o) => !kept.has(o))
    if (removed.length) {
      const label = prev.optionLabels?.[removed[0]!] ?? removed[0]
      return {
        error: `"${label}" in "${prev.name}" is used by the On-call intake, so it can't be removed. You can rename it.`,
      }
    }
  }

  // Locked stays locked, whatever the client sent.
  const lockedIds = new Set(stored.filter((p) => p.locked).map((p) => p.id))
  return {
    properties: result.map((p) => (lockedIds.has(p.id) ? { ...p, locked: true } : p)),
  }
}

export function hasLockedProperties(properties: CustomObjectProperty[] | unknown): boolean {
  return Array.isArray(properties) && properties.some((p) => (p as CustomObjectProperty)?.locked === true)
}
