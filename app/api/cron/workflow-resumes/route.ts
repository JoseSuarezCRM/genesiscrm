import { NextResponse } from "next/server"
import { runDueWorkflowResumes } from "@/lib/automation-engine"

// Vercel Cron — resumes workflows whose delay step has elapsed.
// Runs frequently (see vercel.json) so delays fire close to on time.
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await runDueWorkflowResumes()
  return NextResponse.json({ ok: true })
}
