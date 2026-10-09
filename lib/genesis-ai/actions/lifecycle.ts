// The life of a proposed change: who may confirm or cancel it, once, and when it
// expires. Server only. The server actions in app/actions/genesis-ai.ts compose
// these with executeAction; kept here so the rules can be tested without a
// signed-in request (scripts/check-genesis-ai.ts).

import { prisma } from "@/lib/prisma"
import { actionView, appendActionNote } from "../conversation"
import { ACTION_TTL_MS, type ActionCard, type ActionView, type ExecResult } from "./types"

type Row = NonNullable<Awaited<ReturnType<typeof prisma.aiPendingAction.findFirst>>>

export type Claim =
  | { kind: "run"; row: Row }            // claimed: run it now, then finish()
  | { kind: "settled"; view: ActionView } // already done / cancelled / running / expired

/** Find `id` among `userId`'s own proposals, or null. */
export function ownAction(userId: string, id: string) {
  return prisma.aiPendingAction.findFirst({ where: { id, userId } })
}

/**
 * Take a pending proposal for running. Only its owner can, only once (an atomic
 * PENDING → RUNNING), and only within ACTION_TTL_MS — past that it's marked
 * expired and the chat is told.
 */
export async function claim(userId: string, id: string, now = Date.now()): Promise<Claim | null> {
  const row = await ownAction(userId, id)
  if (!row) return null
  if (row.status !== "PENDING") return { kind: "settled", view: actionView(row, now) }
  if (now - row.createdAt.getTime() > ACTION_TTL_MS) {
    const marked = await prisma.aiPendingAction.updateMany({ where: { id, userId, status: "PENDING" }, data: { status: "EXPIRED", resolvedAt: new Date(now) } })
    if (marked.count === 1) await appendActionNote(userId, row.conversationId, `"${(row.card as unknown as ActionCard).title}" expired before it was confirmed. Nothing was changed.`)
    return { kind: "settled", view: actionView({ ...row, status: "EXPIRED" }, now) }
  }
  const taken = await prisma.aiPendingAction.updateMany({ where: { id, userId, status: "PENDING" }, data: { status: "RUNNING" } })
  if (taken.count !== 1) return { kind: "settled", view: actionView((await prisma.aiPendingAction.findUniqueOrThrow({ where: { id } })), now) }
  return { kind: "run", row }
}

/** Record how a claimed proposal went, and tell the chat. */
export async function finish(userId: string, row: Row, result: ExecResult): Promise<ActionView> {
  const status = result.ok ? "DONE" : "FAILED"
  const stored = { message: result.message, link: result.link ?? null }
  await prisma.aiPendingAction.update({ where: { id: row.id }, data: { status, result: stored, resolvedAt: new Date() } })
  const title = (row.card as unknown as ActionCard).title
  await appendActionNote(userId, row.conversationId, result.ok
    ? `The person confirmed "${title}" and it's done: ${result.message}`
    : `The person confirmed "${title}" but it failed: ${result.message}`)
  return { id: row.id, card: row.card as unknown as ActionCard, status, result: stored }
}

/** Decline a pending proposal (owner only). Returns null when it isn't theirs. */
export async function cancel(userId: string, id: string): Promise<ActionView | null> {
  const row = await ownAction(userId, id)
  if (!row) return null
  const done = await prisma.aiPendingAction.updateMany({ where: { id, userId, status: "PENDING" }, data: { status: "CANCELLED", resolvedAt: new Date() } })
  if (done.count === 1) await appendActionNote(userId, row.conversationId, `The person cancelled "${(row.card as unknown as ActionCard).title}". Nothing was changed.`)
  return actionView(await prisma.aiPendingAction.findUniqueOrThrow({ where: { id } }))
}
