/**
 * The quick-pick chips, with the original tool's rules.
 *
 * Blood thinner is "set" mode: one choice, tap again to clear, and "None" also
 * clears the last dose. Social is "toggle" mode: one line per chip, but only one
 * historian line and only one living situation at a time. Outcome is a set,
 * except that WBAT and NWB exclude each other.
 */

import { RC_OUTCOME_LABELS, RC_WEIGHT_BEARING } from "./constants"

/** Whether a chip reads as selected: a line or comma-separated item matches. */
export function isPickOn(current: string, value: string): boolean {
  const items = current.split(/\n|,\s*/).map((s) => s.trim().toLowerCase())
  return items.includes(value.toLowerCase())
}

/** Blood thinner. Returns the new value, and whether to clear the last dose. */
export function applyThinnerPick(current: string, value: string): { value: string; clearLastDose: boolean } {
  const on = current.trim().toLowerCase() === value.toLowerCase()
  const next = on ? "" : value
  return { value: next, clearLastDose: !on && value === "None" }
}

/** Social / historian lines. */
export function toggleSocialPick(current: string, value: string): string {
  let lines = current.split("\n").map((s) => s.trim()).filter(Boolean)
  const i = lines.findIndex((l) => l.toLowerCase() === value.toLowerCase())
  if (i >= 0) {
    lines.splice(i, 1)
  } else {
    if (/historian/i.test(value)) lines = lines.filter((l) => !/historian/i.test(l))
    if (/^lives|^from snf/i.test(value)) lines = lines.filter((l) => !/^lives|^from (snf|alf)/i.test(l))
    lines.push(value)
  }
  return lines.join("\n")
}

/** Outcome, as the form holds it: ", "-joined labels in the canonical order. */
export function toggleOutcome(current: string, label: string): string {
  let set = current.split(", ").filter(Boolean)
  if (set.includes(label)) {
    set = set.filter((x) => x !== label)
  } else {
    if ((RC_WEIGHT_BEARING as readonly string[]).includes(label)) {
      set = set.filter((x) => !(RC_WEIGHT_BEARING as readonly string[]).includes(x))
    }
    set.push(label)
  }
  return set
    .sort((a, b) => RC_OUTCOME_LABELS.indexOf(a) - RC_OUTCOME_LABELS.indexOf(b))
    .join(", ")
}
