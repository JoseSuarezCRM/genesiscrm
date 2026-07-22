import { NextResponse } from "next/server"
import { assertCron } from "@/lib/cron-auth"
import { runDueWorkflowResumes } from "@/lib/automation-engine"

// Vercel Cron — resumes workflows whose delay step has elapsed.
// Runs frequently (see vercel.json) so delays fire close to on time.
export async function GET(req: Request) {
  const _cronErr = assertCron(req)
  if (_cronErr) return _cronErr

  await runDueWorkflowResumes()
  return NextResponse.json({ ok: true })
}
