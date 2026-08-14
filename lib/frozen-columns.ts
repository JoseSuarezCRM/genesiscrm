// "Frozen" (sticky) columns for list tables. Given the full left-to-right column
// order (leading fixed columns included), the number of frozen columns, and a
// width resolver, returns each frozen column's cumulative left offset so the
// header <th> and body <td> can be made position:sticky and pinned while the
// rest of the table scrolls horizontally.

import type { CSSProperties } from "react"

export interface FrozenInfo { left: number; last: boolean }

export function frozenMap(
  orderedKeys: string[],
  frozenCount: number,
  widthOf: (key: string) => number,
  baseOffset = 0,
): Map<string, FrozenInfo> {
  const m = new Map<string, FrozenInfo>()
  const n = Math.max(0, Math.min(frozenCount, orderedKeys.length))
  let acc = baseOffset
  for (let i = 0; i < n; i++) {
    m.set(orderedKeys[i], { left: acc, last: i === n - 1 })
    acc += widthOf(orderedKeys[i])
  }
  return m
}

// Style for a frozen header cell (higher z so it sits above frozen body cells).
export function frozenHeadStyle(f: FrozenInfo | undefined): CSSProperties | undefined {
  return f ? { position: "sticky", left: f.left, zIndex: 30 } : undefined
}

// Style for a frozen body cell.
export function frozenCellStyle(f: FrozenInfo | undefined): CSSProperties | undefined {
  return f ? { position: "sticky", left: f.left, zIndex: 10 } : undefined
}

// Extra classes: a solid background (so scrolled content doesn't show through) and
// a divider/shadow on the last frozen column. `headerBg` differs from body rows.
export function frozenClass(f: FrozenInfo | undefined, headerBg = "bg-white"): string {
  if (!f) return ""
  return `${headerBg} ${f.last ? "shadow-[inset_-6px_0_6px_-6px_rgba(0,0,0,0.12)]" : ""}`
}
