"use client"

import { useEffect, type RefObject } from "react"

// A dropdown menu portaled to <body> lives OUTSIDE a Radix modal Dialog's content,
// so the Dialog's FocusScope steals focus back the instant you click the menu's
// search box (its `focusout` handler refocuses the dialog whenever the element
// gaining focus — relatedTarget — is outside the dialog). That focusout originates
// from the element losing focus INSIDE the dialog, so a listener on the menu never
// sees it. FocusScope listens on `document` in the bubble phase, so we register a
// CAPTURE-phase guard that runs first and stops focus events involving the menu
// before they reach FocusScope. The browser's default focus still happens; only
// Radix's steal is suppressed — so the search input becomes typable inside a Dialog.
export function useMenuFocusGuard(open: boolean, menuRef: RefObject<HTMLElement>) {
  useEffect(() => {
    if (!open) return
    const inMenu = (n: EventTarget | null) => !!(n && menuRef.current && menuRef.current.contains(n as Node))
    const guard = (e: FocusEvent) => {
      if (inMenu(e.target) || inMenu(e.relatedTarget)) e.stopImmediatePropagation()
    }
    document.addEventListener("focusin", guard, true)
    document.addEventListener("focusout", guard, true)
    return () => {
      document.removeEventListener("focusin", guard, true)
      document.removeEventListener("focusout", guard, true)
    }
  }, [open, menuRef])
}
