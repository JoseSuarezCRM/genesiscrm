"use server"

/**
 * Saving the On-call AI rules ("what to pull and where"). Admin only.
 *
 * Only async functions may be exported from a "use server" file.
 */

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { RC_MAX_EXTRA_AI_FIELDS, RC_OBJECT_KEY } from "@/lib/referral-calls/constants"
import { getReferralCallDef } from "@/lib/referral-calls/provision"
import { AI_FILLABLE_TYPES, TEXT_SHOWABLE_TYPES, addedProperties, type FieldRules } from "@/lib/referral-calls/extras"
import { BUILTIN_AI_FIELDS } from "@/lib/referral-calls/ai-prompt"

const Rule = z
  .object({
    instruction: z.string().max(1000).optional(),
    extract: z.boolean().optional(),
    inSurgeonText: z.boolean().optional(),
    inEpicNote: z.boolean().optional(),
  })
  .strict()

const Input = z
  .object({
    instructions: z.string().max(4000),
    fields: z.record(z.string().max(100), Rule),
  })
  .strict()

export async function saveExtractionRules(raw: unknown): Promise<{ ok: true; updatedAt: string } | { ok: false; error: string }> {
  const session = await auth()
  const user = session?.user as { id?: string; role?: string } | undefined
  if (!user?.id || user.role !== "ADMIN") return { ok: false, error: "Only admins can change the On-call AI rules." }

  const parsed = Input.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Some rules couldn't be read. Nothing was saved." }
  const input = parsed.data

  const def = await getReferralCallDef()
  if (!def) return { ok: false, error: "On-call isn't set up yet. Open the On-call page once first." }

  const builtinIds = new Map(BUILTIN_AI_FIELDS.map((b) => [b.propId as string, b]))
  const added = new Map(addedProperties(def.properties).map((p) => [p.id, p]))

  // Keep only what applies to each field, and only what differs from the default,
  // so an improved default instruction reaches every field an admin didn't customise.
  const fields: FieldRules = {}
  for (const [id, r] of Object.entries(input.fields)) {
    const builtin = builtinIds.get(id)
    const prop = added.get(id)
    if (!builtin && !prop) continue // a property removed meanwhile, or not one of ours
    const out: FieldRules[string] = {}
    const instruction = (r.instruction ?? "").trim()
    if (builtin) {
      if (instruction && instruction !== builtin.defaultInstruction) out.instruction = instruction
      if (r.extract === false) out.extract = false
    } else if (prop) {
      if (instruction) out.instruction = instruction
      if (r.extract === true && AI_FILLABLE_TYPES.has(prop.type)) out.extract = true
      if (TEXT_SHOWABLE_TYPES.has(prop.type)) {
        if (r.inSurgeonText) out.inSurgeonText = true
        if (r.inEpicNote) out.inEpicNote = true
      }
    }
    if (Object.keys(out).length) fields[id] = out
  }

  const aiAdded = Object.entries(fields).filter(([id, r]) => added.has(id) && r.extract).length
  if (aiAdded > RC_MAX_EXTRA_AI_FIELDS) {
    return { ok: false, error: `The AI can fill at most ${RC_MAX_EXTRA_AI_FIELDS} added fields. Turn some off.` }
  }

  const row = await (prisma as any).extractionProfile.upsert({
    where: { objectKey: RC_OBJECT_KEY },
    create: { objectKey: RC_OBJECT_KEY, instructions: input.instructions.trim(), fields, updatedById: user.id },
    update: { instructions: input.instructions.trim(), fields, updatedById: user.id },
    select: { updatedAt: true },
  })
  revalidatePath("/settings/on-call-ai")
  revalidatePath("/on-call")
  return { ok: true, updatedAt: new Date(row.updatedAt).toISOString() }
}
