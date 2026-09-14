import { prisma } from "@/lib/prisma"
import { decryptSecret } from "@/lib/crypto"
import { DEFAULT_INTAKE_FORMS } from "@/lib/intakeq-referral"

// Reads UI-managed integration credentials from the DB, decrypting the API key.
// Falls back to the old environment variables so nothing breaks mid-migration.

const PROVIDER = "intakeq"

export async function getIntegration(provider = PROVIDER) {
  return (prisma as any).integration.findUnique({ where: { provider } })
}

export async function getIntakeqApiKey(): Promise<string | null> {
  const row = await getIntegration().catch(() => null)
  if (row?.enabled && row.apiKeyEnc) {
    try { return decryptSecret(row.apiKeyEnc) } catch { return null }
  }
  return process.env.INTAKEQ_API_KEY ?? null
}

export async function getIntakeqWebhookSecret(): Promise<string | null> {
  const row = await getIntegration().catch(() => null)
  return row?.webhookSecret ?? process.env.INTAKEQ_WEBHOOK_SECRET ?? null
}

export async function isIntakeqConfigured(): Promise<boolean> {
  return !!(await getIntakeqApiKey())
}

/**
 * Which IntakeQ forms to ingest, as loose name fragments. Admin-editable so a
 * renamed or newly added form needs no deploy. Falls back to the built-in list when
 * unset or stored as something unusable.
 */
export async function getIntakeForms(): Promise<string[]> {
  const row = await getIntegration().catch(() => null)
  const raw = (row?.config as any)?.intakeForms
  const list = Array.isArray(raw) ? raw.filter((f: unknown) => typeof f === "string" && f.trim()).map((f: string) => f.trim()) : []
  return list.length ? list : [...DEFAULT_INTAKE_FORMS]
}
