"use server"

import { auth } from "@/lib/auth"
import { conversationLines, deleteConversation, listConversations, type ChatLine } from "@/lib/genesis-ai/conversation"

// Genesis AI chat history. Everyone signed in can use Genesis AI (user's
// decision, 2026-10-08); every call is scoped to the caller's own chats.

async function me(): Promise<string> {
  const session = await auth()
  const id = (session?.user as any)?.id
  if (!id) throw new Error("Unauthorized")
  return id
}

export async function listMyConversations(): Promise<{ id: string; title: string; updatedAt: string }[]> {
  const rows = await listConversations(await me())
  return rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updatedAt.toISOString() }))
}

export async function getMyConversation(id: string): Promise<{ id: string; title: string; lines: ChatLine[] } | null> {
  return conversationLines(await me(), id)
}

export async function deleteMyConversation(id: string): Promise<{ success: boolean }> {
  return { success: await deleteConversation(await me(), id) }
}
