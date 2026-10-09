"use server"

import { auth } from "@/lib/auth"
import { createAuditLog } from "@/lib/audit"
import { conversationLines, deleteConversation, listConversations, type ChatLine } from "@/lib/genesis-ai/conversation"
import { executeAction } from "@/lib/genesis-ai/actions"
import { cancel, claim, finish } from "@/lib/genesis-ai/actions/lifecycle"
import type { ActionKind, ActionView, ExecResult } from "@/lib/genesis-ai/actions/types"
import type { Viewer } from "@/lib/genesis-ai/access"

// Genesis AI chat history, and confirming the changes it proposes. Everyone
// signed in can use Genesis AI (user's decision, 2026-10-08); every call is
// scoped to the caller's own chats and proposals.

async function viewer(): Promise<Viewer> {
  const session = await auth()
  const u = session?.user as any
  if (!u?.id) throw new Error("Unauthorized")
  // The session's permissions are re-read from the database on every request
  // (lib/auth.ts), so a confirm uses the person's access as it is now.
  return { id: u.id, name: u.name || u.email || "", role: u.role ?? "STAFF", permissions: u.permissions ?? [] }
}

export async function listMyConversations(): Promise<{ id: string; title: string; updatedAt: string }[]> {
  const rows = await listConversations((await viewer()).id)
  return rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updatedAt.toISOString() }))
}

export async function getMyConversation(id: string): Promise<{ id: string; title: string; lines: ChatLine[] } | null> {
  return conversationLines((await viewer()).id, id)
}

export async function deleteMyConversation(id: string): Promise<{ success: boolean }> {
  return { success: await deleteConversation((await viewer()).id, id) }
}

/**
 * Run a change Genesis AI proposed. Only its owner can, once, within 30
 * minutes (lib/genesis-ai/actions/lifecycle.ts). Their access is checked again,
 * then the CRM's own actions run as them — with their usual checks, workflows
 * and audit.
 */
export async function confirmGenesisAction(id: string): Promise<ActionView> {
  const me = await viewer()
  const c = await claim(me.id, id)
  if (!c) throw new Error("That change isn't available.")
  if (c.kind === "settled") return c.view
  let result: ExecResult
  try {
    result = await executeAction(c.row.kind as ActionKind, c.row.payload, me)
  } catch (e) {
    result = { ok: false, message: e instanceof Error ? e.message : "It failed." }
  }
  const view = await finish(me.id, c.row, result)
  // Metadata only — never the values.
  await createAuditLog({
    userId: me.id,
    action: "AI_ACTION",
    resourceType: "AiPendingAction",
    resourceId: id,
    metadata: { kind: c.row.kind, outcome: view.status, conversationId: c.row.conversationId, recordIds: (result.recordIds ?? []).slice(0, 50) },
  })
  return view
}

/** Decline a proposed change. Nothing is changed. */
export async function cancelGenesisAction(id: string): Promise<ActionView> {
  const view = await cancel((await viewer()).id, id)
  if (!view) throw new Error("That change isn't available.")
  return view
}
