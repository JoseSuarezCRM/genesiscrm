"use client"

import { createContext, useCallback, useContext } from "react"
import { labelFrom, type NativeLabelMap } from "@/lib/native-labels-shared"

// Admins' names for built-in fields, loaded once per request by the dashboard
// layout. Screens that name a built-in field read it through useFieldLabel, so a
// rename in Settings → Properties reaches every list, record, form and picker.
const NativeLabelsContext = createContext<NativeLabelMap>({})

export function NativeLabelsProvider({ labels, children }: { labels: NativeLabelMap; children: React.ReactNode }) {
  return <NativeLabelsContext.Provider value={labels}>{children}</NativeLabelsContext.Provider>
}

/**
 * `fieldLabel(objectType, key, fallback)` — the admin's name for a built-in
 * field, or `fallback` (the screen's own wording) when it hasn't been renamed.
 */
export function useFieldLabel() {
  const map = useContext(NativeLabelsContext)
  return useCallback((objectType: string, key: string, fallback: string) => labelFrom(map, objectType, key, fallback), [map])
}

/** The whole map, for code that relabels a list of definitions at once. */
export function useNativeLabels(): NativeLabelMap {
  return useContext(NativeLabelsContext)
}
