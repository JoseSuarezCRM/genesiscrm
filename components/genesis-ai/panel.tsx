"use client"

import { useEffect, useRef, useState } from "react"
import { Sparkles, X, History, SquarePen, ArrowUp, Square, Loader2, Check, AlertCircle, Trash2, ChevronLeft } from "lucide-react"
import Markdown from "@/components/genesis-ai/markdown"
import { useGenesisChat, type UILine } from "@/components/genesis-ai/use-genesis-chat"
import { listMyConversations, deleteMyConversation } from "@/app/actions/genesis-ai"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import { cn } from "@/lib/utils"

const SUGGESTIONS = [
  "How many referrals came in last month, by practice?",
  "What are my open tasks due this week?",
  "Which providers referred the most patients this quarter?",
  "Show the newest referrals that haven't been contacted yet",
]

/** The Genesis AI side panel. Non-modal: the page behind stays usable. */
export default function GenesisPanel({ open, onClose, userName }: { open: boolean; onClose: () => void; userName: string }) {
  const chat = useGenesisChat()
  const [shown, setShown] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [view, setView] = useState<"chat" | "history">("chat")
  const [draft, setDraft] = useState("")
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)

  // Slide in/out (same pattern as the record "All properties" panel).
  useEffect(() => {
    if (open) {
      setMounted(true)
      requestAnimationFrame(() => setShown(true))
      setTimeout(() => inputRef.current?.focus(), 220)
    } else {
      setShown(false)
      const t = setTimeout(() => setMounted(false), 200)
      return () => clearTimeout(t)
    }
  }, [open])

  // Escape closes (when focus is inside the panel).
  const onKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Escape") onClose() }

  // Follow the answer as it streams, unless the person scrolled up to read.
  useEffect(() => {
    const el = scrollRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [chat.lines])
  const onScroll = () => {
    const el = scrollRef.current
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  function submit(text = draft) {
    if (!text.trim() || chat.busy) return
    stickRef.current = true
    chat.send(text)
    setDraft("")
    setView("chat")
  }

  if (!mounted) return null
  const firstName = userName.split(/\s+/)[0] || "there"

  return (
    <aside
      onKeyDown={onKeyDown}
      aria-label="Genesis AI"
      className={cn(
        "fixed right-0 top-0 z-[60] flex h-full w-full max-w-xl flex-col border-l border-zinc-200 bg-white shadow-2xl transition-transform duration-200 ease-out",
        shown ? "translate-x-0" : "translate-x-full",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3">
        {view === "history" ? (
          <button onClick={() => setView("chat")} title="Back to the chat" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white"><Sparkles className="h-4 w-4" /></span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-900">{view === "history" ? "Your chats" : "Genesis AI"}</p>
          {view === "chat" && chat.title && <p className="truncate text-xs text-zinc-500">{chat.title}</p>}
        </div>
        <button onClick={() => setView(view === "history" ? "chat" : "history")} title="Your chats"
          className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-zinc-100 hover:text-zinc-900", view === "history" ? "bg-zinc-100 text-zinc-900" : "text-zinc-500")}>
          <History className="h-4 w-4" />
        </button>
        <button onClick={() => { chat.reset(); setView("chat"); setDraft(""); setTimeout(() => inputRef.current?.focus(), 0) }} title="New chat"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
          <SquarePen className="h-4 w-4" />
        </button>
        <button onClick={onClose} title="Close (Esc)" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
          <X className="h-4 w-4" />
        </button>
      </div>

      {view === "history" ? (
        <HistoryList
          currentId={chat.conversationId}
          onOpen={async (id) => { if (await chat.open(id)) setView("chat") }}
          onDeleted={(id) => { if (id === chat.conversationId) chat.reset() }}
        />
      ) : (
        <>
          {/* Messages */}
          <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 py-4">
            {chat.lines.length === 0 ? (
              <div className="flex h-full flex-col justify-center">
                <p className="text-lg font-semibold text-zinc-900">Hi {firstName}, what would you like to know?</p>
                <p className="mt-1 text-sm text-zinc-500">Ask about referrals, practices, providers, surgery cases, tasks, activities — anything in the CRM you can open.</p>
                <div className="mt-5 space-y-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => submit(s)}
                      className="block w-full rounded-xl border border-zinc-200 px-3 py-2 text-left text-sm text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {chat.lines.map((l) => <Line key={l.id} line={l} />)}
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-zinc-200 px-4 pb-3 pt-3">
            <div className="flex items-end gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 focus-within:border-zinc-400">
              <textarea
                ref={inputRef}
                value={draft}
                rows={1}
                maxLength={4000}
                placeholder="Ask Genesis AI…"
                onChange={(e) => {
                  setDraft(e.target.value)
                  const t = e.target; t.style.height = "auto"; t.style.height = `${Math.min(t.scrollHeight, 160)}px`
                }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit() } }}
                className="max-h-40 flex-1 resize-none bg-transparent py-1 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
              />
              {chat.busy ? (
                <button onClick={chat.stop} title="Stop" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white hover:bg-zinc-800">
                  <Square className="h-3.5 w-3.5 fill-current" />
                </button>
              ) : (
                <button onClick={() => submit()} disabled={!draft.trim()} title="Send (Enter)"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-30">
                  <ArrowUp className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="mt-2 text-center text-[11px] text-zinc-400">
              Answers come only from records you can open. Genesis AI can make mistakes — check important details.
            </p>
          </div>
        </>
      )}
    </aside>
  )
}

function Line({ line }: { line: UILine }) {
  if (line.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-zinc-100 px-3.5 py-2 text-sm text-zinc-900">{line.text}</div>
      </div>
    )
  }
  const thinking = line.streaming && !line.text && line.tools.every((t) => t.done)
  return (
    <div className="space-y-2">
      {line.tools.length > 0 && (
        <div className="space-y-1">
          {line.tools.map((t) => (
            <p key={t.id} className="flex items-center gap-1.5 text-xs text-zinc-500">
              {!t.done ? <Loader2 className="h-3 w-3 animate-spin" /> : t.error ? <AlertCircle className="h-3 w-3 text-amber-500" /> : <Check className="h-3 w-3 text-emerald-500" />}
              {t.status}
            </p>
          ))}
        </div>
      )}
      {thinking && <p className="flex items-center gap-1.5 text-xs text-zinc-400"><Loader2 className="h-3 w-3 animate-spin" /> Thinking…</p>}
      {line.text && <Markdown text={line.text} />}
      {line.notice && <p className="text-xs text-zinc-500">{line.notice}</p>}
      {line.error && <p className="flex items-center gap-1.5 text-xs text-red-600"><AlertCircle className="h-3.5 w-3.5" /> {line.error}</p>}
    </div>
  )
}

function HistoryList({ currentId, onOpen, onDeleted }: { currentId: string | null; onOpen: (id: string) => void; onDeleted: (id: string) => void }) {
  const [items, setItems] = useState<{ id: string; title: string; updatedAt: string }[] | null>(null)
  useEffect(() => { listMyConversations().then(setItems).catch(() => setItems([])) }, [])

  async function remove(id: string, title: string) {
    if (!(await confirmDialog({ title: `Delete "${title}"?`, description: "The chat is erased for good.", confirmLabel: "Delete", destructive: true }))) return
    await deleteMyConversation(id)
    setItems((xs) => (xs ?? []).filter((x) => x.id !== id))
    onDeleted(id)
  }

  return (
    <div className="flex-1 overflow-y-auto px-2 py-2">
      {items === null ? (
        <p className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-400">No chats yet.</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((c) => (
            <li key={c.id} className={cn("group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-50", c.id === currentId && "bg-zinc-100")}>
              <button onClick={() => onOpen(c.id)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm text-zinc-800">{c.title}</p>
                <p className="text-[11px] text-zinc-400">{new Date(c.updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
              </button>
              <button onClick={() => remove(c.id, c.title)} title="Delete chat"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-400 opacity-0 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="px-2 pt-3 text-[11px] text-zinc-400">Only you can see your chats. They're deleted 30 days after your last message.</p>
    </div>
  )
}
