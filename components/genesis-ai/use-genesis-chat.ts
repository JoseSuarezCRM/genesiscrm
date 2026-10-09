"use client"

import { useCallback, useRef, useState } from "react"
import { getMyConversation } from "@/app/actions/genesis-ai"

// The chat window's state: one conversation at a time, answers streamed in from
// /api/genesis-ai/chat (newline-delimited JSON events — see that route).

export interface ToolLine { id: string; status: string; done: boolean; error?: boolean }

export interface UILine {
  id: string
  role: "user" | "assistant"
  text: string
  tools: ToolLine[]
  notice?: string
  error?: string
  streaming?: boolean
}

let seq = 0
const lineId = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`

export function useGenesisChat() {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [title, setTitle] = useState<string | null>(null)
  const [lines, setLines] = useState<UILine[]>([])
  const [busy, setBusy] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const convRef = useRef<string | null>(null)
  convRef.current = conversationId
  // Bumped when the window switches chats, so a stream that's still winding
  // down never writes into the chat that replaced it.
  const genRef = useRef(0)

  const send = useCallback(async (text: string) => {
    const message = text.trim()
    if (!message || abortRef.current) return
    const ac = new AbortController()
    abortRef.current = ac
    const gen = genRef.current
    const patchLast = (fn: (l: UILine) => UILine) => {
      if (genRef.current !== gen) return
      setLines((ls) => (ls.length ? [...ls.slice(0, -1), fn(ls[ls.length - 1])] : ls))
    }
    setBusy(true)
    setLines((ls) => [
      ...ls,
      { id: lineId(), role: "user", text: message, tools: [] },
      { id: lineId(), role: "assistant", text: "", tools: [], streaming: true },
    ])
    try {
      const res = await fetch("/api/genesis-ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, ...(convRef.current ? { conversationId: convRef.current } : {}) }),
        signal: ac.signal,
      })
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => null)
        patchLast((l) => ({ ...l, streaming: false, error: err?.error ?? "Genesis AI couldn't answer. Try again." }))
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ""
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf("\n")) >= 0) {
          const raw = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!raw) continue
          let ev: any
          try { ev = JSON.parse(raw) } catch { continue }
          switch (ev.t) {
            case "conversation":
              if (genRef.current !== gen) break
              setConversationId(ev.id); convRef.current = ev.id
              setTitle((t) => t ?? ev.title)
              break
            case "text":
              patchLast((l) => ({ ...l, text: l.text + ev.d }))
              break
            case "tool":
              patchLast((l) => ({ ...l, tools: [...l.tools, { id: ev.id, status: ev.status, done: false }] }))
              break
            case "tool_done":
              patchLast((l) => ({ ...l, tools: l.tools.map((t) => (t.id === ev.id ? { ...t, status: ev.status, done: true, error: !!ev.error } : t)) }))
              break
            case "notice":
              patchLast((l) => ({ ...l, notice: ev.d }))
              break
            case "error":
              patchLast((l) => ({ ...l, error: ev.message }))
              break
          }
        }
      }
    } catch (e: any) {
      if (e?.name === "AbortError") patchLast((l) => ({ ...l, notice: l.notice ?? "Stopped." }))
      else patchLast((l) => ({ ...l, error: "The connection dropped. Try again." }))
    } finally {
      patchLast((l) => ({ ...l, streaming: false }))
      if (abortRef.current === ac) abortRef.current = null
      if (genRef.current === gen) setBusy(false)
    }
  }, [])

  const stop = useCallback(() => { abortRef.current?.abort() }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    genRef.current++
    setBusy(false)
    setConversationId(null); convRef.current = null
    setTitle(null)
    setLines([])
  }, [])

  /** Load a past chat into the window. */
  const open = useCallback(async (id: string) => {
    abortRef.current?.abort()
    abortRef.current = null
    const gen = ++genRef.current
    setBusy(false)
    const conv = await getMyConversation(id)
    if (!conv || genRef.current !== gen) return false
    setConversationId(conv.id); convRef.current = conv.id
    setTitle(conv.title)
    setLines(conv.lines.map((l) => ({
      id: lineId(), role: l.role, text: l.text,
      tools: (l.tools ?? []).map((s, i) => ({ id: `h${i}`, status: s, done: true })),
    })))
    return true
  }, [])

  return { conversationId, title, lines, busy, send, stop, reset, open }
}
