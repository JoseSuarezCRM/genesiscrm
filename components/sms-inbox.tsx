"use client"

import { useState, useEffect, useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Send, MessageSquare, Plus, X, Phone, Trash2,
  ChevronRight, Circle, ExternalLink, Search,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  sendSms, createThread, markThreadRead, deleteThread,
  getMessages, getThreads,
} from "@/app/actions/sms"

// ── Types ──────────────────────────────────────────────────────────────────
interface Thread {
  id: string
  phone: string
  contactName: string | null
  referralId: string | null
  unreadCount: number
  lastMessageAt: string
  messages: { body: string; direction: string; createdAt: string }[]
}

interface Message {
  id: string
  body: string
  direction: "INBOUND" | "OUTBOUND"
  status: string | null
  createdAt: string
  sentBy: { name: string | null; email: string } | null
}

interface Props {
  initialThreads: Thread[]
  isAdmin: boolean
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" })
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}

// ── New Thread Modal ───────────────────────────────────────────────────────
function NewThreadModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [phone, setPhone] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!phone.trim()) { setError("Phone number is required."); return }
    startTransition(async () => {
      const res = await createThread(phone, name)
      if ("error" in res) { setError(res.error); return }
      onCreated(res.threadId)
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">New Conversation</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Phone Number *</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 000 0000"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Contact Name (optional)</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Patient or provider name"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg disabled:opacity-50"
          >
            {isPending ? "Starting…" : "Start Conversation"}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function SmsInbox({ initialThreads, isAdmin }: Props) {
  const router = useRouter()
  const [threads, setThreads] = useState<Thread[]>(initialThreads)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [draftBody, setDraftBody] = useState("")
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState("")
  const [showNew, setShowNew] = useState(false)
  const [search, setSearch] = useState("")
  const [isPending, startTransition] = useTransition()
  const bottomRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const activeThread = threads.find((t) => t.id === activeId) ?? null

  // ── Auto-scroll to bottom of messages ──────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // ── Load messages when thread changes ──────────────────────────────────
  useEffect(() => {
    if (!activeId) return
    loadMessages(activeId)
    markThreadRead(activeId)
    setThreads((prev) =>
      prev.map((t) => (t.id === activeId ? { ...t, unreadCount: 0 } : t))
    )
  }, [activeId])

  // ── Poll for new messages every 5s when a thread is open ───────────────
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (!activeId) return

    pollRef.current = setInterval(async () => {
      const [freshThreads, freshMsgs] = await Promise.all([
        getThreads() as Promise<any[]>,
        getMessages(activeId) as Promise<any[]>,
      ])
      setThreads(
        freshThreads.map((t: any) => ({
          ...t,
          lastMessageAt: t.lastMessageAt.toISOString?.() ?? t.lastMessageAt,
          messages: t.messages.map((m: any) => ({
            ...m,
            createdAt: m.createdAt.toISOString?.() ?? m.createdAt,
          })),
        }))
      )
      setMessages(
        freshMsgs.map((m: any) => ({
          ...m,
          createdAt: m.createdAt.toISOString?.() ?? m.createdAt,
        }))
      )
    }, 5000)

    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [activeId])

  async function loadMessages(threadId: string) {
    const msgs = (await getMessages(threadId)) as any[]
    setMessages(
      msgs.map((m) => ({
        ...m,
        createdAt: m.createdAt.toISOString?.() ?? m.createdAt,
      }))
    )
  }

  async function handleSend() {
    if (!activeId || !draftBody.trim()) return
    setSending(true)
    setSendError("")
    const body = draftBody.trim()
    setDraftBody("")

    const res = await sendSms(activeId, body)
    setSending(false)
    if (!res.success) {
      setSendError(res.error ?? "Failed to send.")
      setDraftBody(body)
      return
    }
    await loadMessages(activeId)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleThreadCreated(id: string) {
    setShowNew(false)
    setActiveId(id)
    startTransition(async () => {
      const fresh = (await getThreads()) as any[]
      setThreads(
        fresh.map((t: any) => ({
          ...t,
          lastMessageAt: t.lastMessageAt.toISOString?.() ?? t.lastMessageAt,
          messages: t.messages.map((m: any) => ({
            ...m,
            createdAt: m.createdAt.toISOString?.() ?? m.createdAt,
          })),
        }))
      )
    })
  }

  function handleDelete(threadId: string) {
    if (!confirm("Delete this conversation? All messages will be removed.")) return
    startTransition(async () => {
      await deleteThread(threadId)
      setThreads((prev) => prev.filter((t) => t.id !== threadId))
      if (activeId === threadId) { setActiveId(null); setMessages([]) }
    })
  }

  const filtered = threads.filter((t) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      t.phone.includes(q) ||
      t.contactName?.toLowerCase().includes(q) ||
      t.messages[0]?.body.toLowerCase().includes(q)
    )
  })

  const totalUnread = threads.reduce((s, t) => s + t.unreadCount, 0)

  return (
    <>
      {showNew && (
        <NewThreadModal
          onClose={() => setShowNew(false)}
          onCreated={handleThreadCreated}
        />
      )}

      <div className="flex h-full overflow-hidden rounded-xl border border-slate-200 bg-white">

        {/* ── Thread list ─────────────────────────────────────────────── */}
        <div className="w-80 shrink-0 flex flex-col border-r border-slate-100">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-100 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-800">Messages</h2>
                {totalUnread > 0 && (
                  <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 bg-blue-600 text-white text-[10px] font-bold rounded-full">
                    {totalUnread}
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowNew(true)}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-50"
              >
                <Plus className="h-3.5 w-3.5" /> New
              </button>
            </div>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations…"
                className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Thread items */}
          <div className="flex-1 overflow-y-auto sidebar-scroll">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs">
                {search ? "No matching conversations" : "No conversations yet"}
              </div>
            ) : (
              filtered.map((t) => {
                const lastMsg = t.messages[0]
                const isActive = t.id === activeId
                return (
                  <div
                    key={t.id}
                    onClick={() => setActiveId(t.id)}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 cursor-pointer border-b border-slate-50 hover:bg-slate-50 transition-colors group",
                      isActive && "bg-blue-50 border-l-2 border-l-blue-500"
                    )}
                  >
                    {/* Avatar */}
                    <div className="flex items-center justify-center w-9 h-9 rounded-full bg-slate-200 text-slate-600 text-xs font-semibold shrink-0">
                      {(t.contactName ?? t.phone).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className={cn("text-sm truncate", t.unreadCount > 0 ? "font-semibold text-slate-900" : "font-medium text-slate-700")}>
                          {t.contactName ?? t.phone}
                        </p>
                        <span className="text-[10px] text-slate-400 shrink-0 ml-1">
                          {formatTime(t.lastMessageAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        {t.contactName && (
                          <span className="text-[10px] text-slate-400 font-mono">{t.phone}</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className={cn("text-xs truncate", t.unreadCount > 0 ? "text-slate-700" : "text-slate-400")}>
                          {lastMsg
                            ? `${lastMsg.direction === "OUTBOUND" ? "You: " : ""}${lastMsg.body}`
                            : "No messages yet"}
                        </p>
                        {t.unreadCount > 0 && (
                          <span className="shrink-0 ml-1 flex items-center justify-center h-4 min-w-4 px-1 bg-blue-600 text-white text-[10px] font-bold rounded-full">
                            {t.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ── Conversation panel ─────────────────────────────────────── */}
        {!activeThread ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400">
            <MessageSquare className="h-12 w-12 mb-3 opacity-20" />
            <p className="text-sm font-medium">Select a conversation</p>
            <p className="text-xs mt-1">or start a new one</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-w-0">
            {/* Thread header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-full bg-blue-100 text-blue-600 text-sm font-semibold">
                  {(activeThread.contactName ?? activeThread.phone).charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {activeThread.contactName ?? activeThread.phone}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Phone className="h-3 w-3" />
                    <span>{activeThread.phone}</span>
                    {activeThread.referralId && (
                      <a
                        href={`/referrals/${activeThread.referralId}`}
                        className="flex items-center gap-0.5 text-blue-500 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> Referral
                      </a>
                    )}
                  </div>
                </div>
              </div>
              {isAdmin && (
                <button
                  onClick={() => handleDelete(activeThread.id)}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete conversation"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto sidebar-scroll px-5 py-4 space-y-3">
              {messages.length === 0 ? (
                <div className="text-center text-slate-400 text-xs py-8">
                  No messages yet — send the first one below.
                </div>
              ) : (
                messages.map((msg) => {
                  const isOut = msg.direction === "OUTBOUND"
                  return (
                    <div key={msg.id} className={cn("flex", isOut ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-xs lg:max-w-md space-y-1", isOut ? "items-end" : "items-start", "flex flex-col")}>
                        <div
                          className={cn(
                            "px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
                            isOut
                              ? "bg-blue-600 text-white rounded-br-md"
                              : "bg-slate-100 text-slate-800 rounded-bl-md"
                          )}
                        >
                          {msg.body}
                        </div>
                        <div className={cn("flex items-center gap-1 px-1", isOut ? "flex-row-reverse" : "flex-row")}>
                          <span className="text-[10px] text-slate-400">
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {isOut && msg.sentBy && (
                            <span className="text-[10px] text-slate-400">
                              · {msg.sentBy.name ?? msg.sentBy.email}
                            </span>
                          )}
                          {isOut && msg.status && (
                            <span className={cn("text-[10px]", msg.status === "failed" ? "text-red-400" : "text-slate-400")}>
                              · {msg.status}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="px-4 py-3 border-t border-slate-100 shrink-0">
              {sendError && (
                <p className="text-xs text-red-600 mb-2">{sendError}</p>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={draftBody}
                  onChange={(e) => {
                    setDraftBody(e.target.value)
                    e.target.style.height = "auto"
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                  className="flex-1 resize-none border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-h-28 overflow-y-auto"
                  style={{ height: "38px" }}
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !draftBody.trim()}
                  className="flex items-center justify-center w-9 h-9 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl transition-colors shrink-0"
                  title="Send (Enter)"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5 ml-1">
                Sending from {process.env.NEXT_PUBLIC_TWILIO_PHONE ?? "your Twilio number"}
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
