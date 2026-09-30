/**
 * The saved AI rules for the call log ("what to pull and where"). Server-only.
 *
 * One ExtractionProfile row per object key. Absent until an admin first saves
 * the On-call AI settings page; until then every field uses its default rule.
 */

import { prisma } from "@/lib/prisma"
import { RC_OBJECT_KEY } from "./constants"
import { parseFieldRules, type FieldRules } from "./extras"

export interface ExtractionProfileData {
  /** General instructions for every extraction. */
  instructions: string
  fields: FieldRules
  updatedAt: string | null
}

export async function getExtractionProfile(objectKey: string = RC_OBJECT_KEY): Promise<ExtractionProfileData> {
  const row = await (prisma as any).extractionProfile.findUnique({
    where: { objectKey },
    select: { instructions: true, fields: true, updatedAt: true },
  })
  return {
    instructions: typeof row?.instructions === "string" ? row.instructions : "",
    fields: parseFieldRules(row?.fields),
    updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  }
}
