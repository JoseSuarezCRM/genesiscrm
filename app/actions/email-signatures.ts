"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { ORG_SIGNATURE_ID, invalidateSignatureCache } from "@/lib/email-signature"
import { sanitizeSignatureHtml } from "@/lib/sanitize-signature"

// Signatures are authored in two places: an admin sets the organization default
// (and each shared mailbox's own), and each person can override theirs in My
// Account. Both write the same table — see lib/email-signature.ts for how one is
// picked at send time.

export interface SignatureState {
  html: string
  /** false on a personal row means "use the organization default". */
  enabled: boolean
}

async function requireUser() {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  return session
}

async function requireAdmin() {
  const session = await requireUser()
  if ((session.user as any).role !== "ADMIN") throw new Error("You don't have permission to do this")
  return session
}

async function read(id: string): Promise<SignatureState> {
  const row = await (prisma as any).emailSignature.findUnique({ where: { id } })
  return { html: row?.html ?? "", enabled: row?.enabled ?? true }
}

async function write(id: string, state: SignatureState, userId: string | null) {
  // Sanitised on save, where it can't be skipped by calling the action
  // directly — and on save rather than on send, because cid: srcs are
  // generated afterwards and would be stripped.
  const html = sanitizeSignatureHtml(state.html)
  await (prisma as any).emailSignature.upsert({
    where: { id },
    create: { id, html, enabled: state.enabled, updatedById: userId },
    update: { html, enabled: state.enabled, updatedById: userId },
  })
  invalidateSignatureCache()
}

/** The signed-in user's personal signature. */
export async function getMySignature(): Promise<SignatureState> {
  const session = await requireUser()
  return read((session.user as any).id)
}

export async function saveMySignature(state: SignatureState) {
  const session = await requireUser()
  await write((session.user as any).id, state, (session.user as any).id)
  revalidatePath("/settings/account")
  return { success: true }
}

export async function getOrgSignature(): Promise<SignatureState> {
  await requireUser()
  return read(ORG_SIGNATURE_ID)
}

export async function saveOrgSignature(state: SignatureState) {
  const session = await requireAdmin()
  await write(ORG_SIGNATURE_ID, state, (session.user as any).id)
  revalidatePath("/settings/email")
  return { success: true }
}
