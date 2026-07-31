import { NextResponse } from "next/server"
import { assertCron } from "@/lib/cron-auth"
import { getIntegration } from "@/lib/integration-store"
import { runFilesanywhereImport, faImportDue, type FaConfig } from "@/lib/filesanywhere-import"

// Runs on a schedule (hourly). Imports only when the integration is enabled and
// its configured interval has elapsed. Configured in vercel.json.
export async function GET(req: Request) {
  const err = assertCron(req)
  if (err) return err

  const integ = await getIntegration("filesanywhere")
  if (!integ?.enabled) return NextResponse.json({ ok: true, skipped: "disabled" })
  if (!faImportDue((integ.config ?? {}) as Partial<FaConfig>)) return NextResponse.json({ ok: true, skipped: "not due" })

  const result = await runFilesanywhereImport()
  return NextResponse.json({ ok: true, ...result })
}
