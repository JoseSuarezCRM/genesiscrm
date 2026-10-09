// Genesis AI chats: storage and what the chat window shows. Server only.
//
// Every function takes the owner's user id and scopes every query by it — a
// chat is only ever read, extended or deleted by the person who had it.
//
// Turns are stored exactly as the API sent and received them, thinking blocks
// included: the model needs its own earlier turns back unchanged.

import type Anthropic from "@anthropic-ai/sdk"
import { prisma } from "@/lib/prisma"
import { ACTION_TTL_MS, type ActionCard, type ActionView } from "./actions/types"

/** Chats untouched this long are deleted (/api/cron/ai-cleanup). */
export const RETENTION_DAYS = 30

type Param = Anthropic.Messages.MessageParam

export async function ownConversation(userId: string, id: string) {
  return prisma.aiConversation.findFirst({ where: { id, userId }, select: { id: true, title: true } })
}

export async function createConversation(userId: string, firstQuestion: string) {
  const title = firstQuestion.replace(/\s+/g, " ").trim().slice(0, 80) || "New chat"
  return prisma.aiConversation.create({ data: { userId, title }, select: { id: true, title: true } })
}

/**
 * The history to send, oldest first. Consecutive turns of the same role (left
 * when an earlier question was stopped before its answer) are joined, so the
 * conversation always alternates.
 */
export async function loadHistory(userId: string, conversationId: string): Promise<Param[]> {
  const rows = await prisma.aiMessage.findMany({
    where: { conversationId, conversation: { userId } },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  })
  const out: Param[] = []
  for (const r of rows) {
    const role = r.role === "assistant" ? "assistant" : "user"
    const content = r.content as unknown as Param["content"]
    const last = out[out.length - 1]
    if (last && last.role === role) {
      const a = typeof last.content === "string" ? [{ type: "text" as const, text: last.content }] : last.content
      const b = typeof content === "string" ? [{ type: "text" as const, text: content }] : content
      last.content = [...(a as any[]), ...(b as any[])] as any
    } else {
      out.push({ role, content })
    }
  }
  return out
}

/** Append finished turns (a question, or a complete answer round) in order. */
export async function appendTurns(userId: string, conversationId: string, turns: Param[]) {
  if (!turns.length) return
  const owned = await ownConversation(userId, conversationId)
  if (!owned) return
  // createdAt must keep their order even within one millisecond.
  const base = Date.now()
  await prisma.$transaction([
    ...turns.map((t, i) => prisma.aiMessage.create({
      data: { conversationId, role: t.role, content: t.content as any, createdAt: new Date(base + i) },
    })),
    prisma.aiConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
  ])
}

/**
 * Notes the CRM adds to a chat when a proposal is confirmed or cancelled, so the
 * next answer knows what happened. Sent to the model; never shown as a message.
 */
export const ACTION_NOTE_PREFIX = "[Genesis action] "

export async function appendActionNote(userId: string, conversationId: string, text: string) {
  await appendTurns(userId, conversationId, [{ role: "user", content: [{ type: "text", text: `${ACTION_NOTE_PREFIX}${text}` }] }])
}

// ── What the chat window shows (never thinking blocks or raw tool results) ───

export interface ChatLine {
  role: "user" | "assistant"
  text: string
  /** Lookups made while answering, as short labels. */
  tools?: string[]
  /** Changes proposed while answering, with what became of them. */
  actions?: ActionView[]
}

/** A stored proposal as the window shows it — past its time, it reads as expired. */
export function actionView(row: { id: string; card: unknown; status: string; result: unknown; createdAt: Date }, now = Date.now()): ActionView {
  const expired = row.status === "PENDING" && now - row.createdAt.getTime() > ACTION_TTL_MS
  return { id: row.id, card: row.card as ActionCard, status: (expired ? "EXPIRED" : row.status) as ActionView["status"], result: (row.result as ActionView["result"]) ?? null }
}

const TOOL_LABEL: Record<string, string> = {
  list_objects: "Looked at what you can access",
  describe_object: "Read the fields",
  find_records: "Searched records",
  query_records: "Listed records",
  aggregate: "Summarized records",
  get_record: "Opened a record",
  propose_update_records: "Prepared a change",
  propose_create_record: "Prepared a new record",
  propose_add_note: "Prepared a note",
  propose_delete_records: "Prepared a deletion",
  propose_link_records: "Prepared a link",
  propose_create_segment: "Prepared a segment",
  propose_create_report: "Prepared a report",
  propose_create_view: "Prepared a view",
}

/** A stored chat as the window renders it: questions, answers, lookup labels and change cards. */
export function displayLines(turns: { role: string; content: unknown }[], actions: Map<string, ActionView> = new Map()): ChatLine[] {
  const lines: ChatLine[] = []
  for (const t of turns) {
    const blocks: any[] = typeof t.content === "string" ? [{ type: "text", text: t.content }] : ((t.content as any[]) ?? [])
    if (t.role === "user") {
      const text = blocks.filter((b) => b.type === "text" && !String(b.text).startsWith(ACTION_NOTE_PREFIX)).map((b) => b.text).join("\n").trim()
      if (text) lines.push({ role: "user", text })
      continue // tool_result turns and action notes aren't shown
    }
    const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("").trim()
    const uses = blocks.filter((b) => b.type === "tool_use")
    const tools = uses.map((b) => TOOL_LABEL[b.name] ?? "Looked something up")
    const cards = uses.map((b) => actions.get(b.id)).filter((a): a is ActionView => !!a)
    const last = lines[lines.length - 1]
    // One answer can span several rounds (lookups, then text): show it as one.
    if (last?.role === "assistant") {
      if (text) last.text = last.text ? `${last.text}\n\n${text}` : text
      if (tools.length) last.tools = [...(last.tools ?? []), ...tools]
      if (cards.length) last.actions = [...(last.actions ?? []), ...cards]
    } else {
      lines.push({ role: "assistant", text, ...(tools.length ? { tools } : {}), ...(cards.length ? { actions: cards } : {}) })
    }
  }
  return lines
}

export async function listConversations(userId: string) {
  return prisma.aiConversation.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, title: true, updatedAt: true },
  })
}

export async function conversationLines(userId: string, id: string): Promise<{ id: string; title: string; lines: ChatLine[] } | null> {
  const conv = await ownConversation(userId, id)
  if (!conv) return null
  const [turns, rows] = await Promise.all([
    prisma.aiMessage.findMany({
      where: { conversationId: id, conversation: { userId } },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true },
    }),
    prisma.aiPendingAction.findMany({
      where: { conversationId: id, userId },
      select: { id: true, toolUseId: true, card: true, status: true, result: true, createdAt: true },
    }),
  ])
  const actions = new Map(rows.map((r) => [r.toolUseId, actionView(r)]))
  return { id: conv.id, title: conv.title, lines: displayLines(turns, actions) }
}

export async function deleteConversation(userId: string, id: string): Promise<boolean> {
  const r = await prisma.aiConversation.deleteMany({ where: { id, userId } })
  return r.count > 0
}

/** Delete chats nobody has touched in RETENTION_DAYS. Returns how many. */
export async function purgeExpired(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const r = await prisma.aiConversation.deleteMany({ where: { updatedAt: { lt: cutoff } } })
  return r.count
}
