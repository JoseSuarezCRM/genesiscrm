import { NextResponse } from "next/server"
import { assertCron } from "@/lib/cron-auth"
import { getIntegration } from "@/lib/integration-store"
import { runFilesanywhereImport, faImportDue, type FaConfig } from "@/lib/filesanywhere-import"
import { sendFilesanywhereReport } from "@/lib/filesanywhere-report"
import { scheduleDue } from "@/lib/schedule"

// Runs on a schedule (hourly). When the integration is enabled it imports (if the
// import interval has elapsed) and emails the weekly new-providers report (if its
// schedule is due) — independently. Configured in vercel.json.
export async function GET(req: Request) {
  const err = assertCron(req)
  if (err) return err

  const integ = await getIntegration("filesanywhere")
  if (!integ?.enabled) return NextResponse.json({ ok: true, skipped: "disabled" })
  const cfg = (integ.config ?? {}) as Partial<FaConfig>

  let importResult: any = { skipped: "not due" }
  if (faImportDue(cfg)) importResult = await runFilesanywhereImport()

  let reportResult: any = { skipped: "not due" }
  const r = cfg.report
  if (r?.enabled && scheduleDue({ frequency: "weekly", dayOfWeek: r.dayOfWeek, hour: r.hour, lastRunAt: r.lastSentAt })) {
    reportResult = await sendFilesanywhereReport()
  }

  return NextResponse.json({ ok: true, import: importResult, report: reportResult })
}
