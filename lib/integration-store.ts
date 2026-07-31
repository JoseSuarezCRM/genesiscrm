import { prisma } from "@/lib/prisma"
import { decryptSecret } from "@/lib/crypto"

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
