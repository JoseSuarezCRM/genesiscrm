"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Drag-and-drop reordering for a list of cards — the same feel as the property
 * reorder inside the Edit Card modal. Cards live-move while dragging; the new order
 * is persisted on drop.
 *
 * Each item is identified by a stable `key`. The grip (drag handle) gets
 * `handleProps(key)`; the card container gets `cardProps(key)` as a drop target.
 */
export function useCardReorder<T>(
  items: T[],
  keyOf: (item: T) => string,
  onReorder: (orderedKeys: string[]) => void,
) {
  const [order, setOrder] = useState<T[]>(items)
  const orderRef = useRef<T[]>(items)
  orderRef.current = order

  const dragKey = useRef<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)

  // Re-sync when the server data changes — by full content, not just the key list,
  // so editing a card's fields (same key) still refreshes what renders. Skipped
  // mid-drag so a live reorder isn't clobbered.
  const signature = JSON.stringify(items)
  useEffect(() => {
    if (dragKey.current === null) setOrder(items)
    /* eslint-disable-next-line */
  }, [signature])

  function moveOver(overKey: string) {
    const from = dragKey.current
    if (!from || from === overKey) return
    setOrder((prev) => {
      const arr = [...prev]
      const fi = arr.findIndex((c) => keyOf(c) === from)
      const ti = arr.findIndex((c) => keyOf(c) === overKey)
      if (fi < 0 || ti < 0 || fi === ti) return prev
      const [moved] = arr.splice(fi, 1)
      arr.splice(ti, 0, moved)
      return arr
    })
  }

  function end() {
    const from = dragKey.current
    dragKey.current = null
    setDragging(null)
    if (from) onReorder(orderRef.current.map(keyOf))
  }

  return {
    order,
    dragging,
    handleProps: (key: string) => ({
      draggable: true,
      onDragStart: (e: React.DragEvent) => { dragKey.current = key; setDragging(key); e.dataTransfer.effectAllowed = "move" },
      onDragEnd: end,
      className: "cursor-grab active:cursor-grabbing",
    }),
    cardProps: (key: string) => ({
      onDragOver: (e: React.DragEvent) => { e.preventDefault(); moveOver(key) },
      onDrop: (e: React.DragEvent) => { e.preventDefault(); end() },
    }),
  }
}
