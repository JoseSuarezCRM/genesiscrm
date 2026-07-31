import { prisma } from "@/lib/prisma"

// Best-effort activity logging — never let a logging failure break the real call.
export async function logIntegrationEvent(e: {
  provider?: string
  kind: "api" | "webhook" | "inbound"
  endpoint?: string | null
  method?: string | null
  status?: number | null
  ok: boolean
  message?: string | null
  durationMs?: number | null
}) {
  try {
    await (prisma as any).integrationEvent.create({
      data: {
        provider: e.provider ?? "intakeq",
        kind: e.kind,
        endpoint: e.endpoint ?? null,
        method: e.method ?? null,
        status: e.status ?? null,
        ok: e.ok,
        message: e.message ? String(e.message).slice(0, 300) : null,
        durationMs: e.durationMs ?? null,
      },
    })
  } catch {
    /* ignore */
  }
}
