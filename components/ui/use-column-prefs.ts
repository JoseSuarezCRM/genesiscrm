"use client"

import { useCallback, useEffect, useState } from "react"

// Per-user, per-table column preferences (which columns show + their order +
// how many are frozen), persisted in localStorage. Loads in an effect (not the
// useState initializer) so the SSR/first-render markup matches — the stored
// prefs apply right after mount. Apply survives a reload without saving a view.
export function useColumnPrefs(storageKey: string, defaultColumns: string[]) {
  const [columns, setColumnsState] = useState<string[]>(defaultColumns)
  const [frozen, setFrozenState] = useState<number>(0)

  useEffect(() => {
    try {
      const r = JSON.parse(localStorage.getItem(storageKey) || "null")
      if (r && Array.isArray(r.columns)) setColumnsState(r.columns)
      if (r && typeof r.frozen === "number") setFrozenState(r.frozen)
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  const persist = useCallback((cols: string[], fr: number) => {
    try { localStorage.setItem(storageKey, JSON.stringify({ columns: cols, frozen: fr })) } catch {}
  }, [storageKey])

  // Full apply (from the column chooser / a saved view).
  const apply = useCallback((cols: string[], fr: number) => {
    setColumnsState(cols); setFrozenState(fr); persist(cols, fr)
  }, [persist])

  // Order-only change (e.g. dragging a header) keeps the current frozen count.
  const setColumns = useCallback((cols: string[]) => {
    setColumnsState(cols)
    setFrozenState((fr) => { persist(cols, fr); return fr })
  }, [persist])

  const reset = useCallback(() => {
    setColumnsState(defaultColumns); setFrozenState(0)
    try { localStorage.removeItem(storageKey) } catch {}
  }, [storageKey, defaultColumns])

  return { columns, frozen, apply, setColumns, reset }
}
