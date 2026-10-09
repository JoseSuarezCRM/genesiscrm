"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import GenesisPanel from "@/components/genesis-ai/panel"

// Genesis AI's open/closed state, shared by the top-bar button and the panel.
// Mounted once in the dashboard layout, so a chat survives page navigation —
// clicking a record link in an answer opens the record with the chat still there.

const Ctx = createContext<{ isOpen: boolean; open: () => void; close: () => void; toggle: () => void }>({
  isOpen: false, open: () => {}, close: () => {}, toggle: () => {},
})

export function useGenesisAI() {
  return useContext(Ctx)
}

export function GenesisAIProvider({ userName, children }: { userName: string; children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const open = useCallback(() => setOpen(true), [])
  const close = useCallback(() => setOpen(false), [])
  const toggle = useCallback(() => setOpen((o) => !o), [])

  // Ctrl/⌘+J opens and closes it (Ctrl/⌘+K is search).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "j") {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <Ctx.Provider value={{ isOpen, open, close, toggle }}>
      {children}
      <GenesisPanel open={isOpen} onClose={close} userName={userName} />
    </Ctx.Provider>
  )
}
