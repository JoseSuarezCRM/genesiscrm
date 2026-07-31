import { NextResponse } from "next/server"
import { ingestIntake } from "@/lib/intakeq-ingest"
import { getIntakeqWebhookSecret } from "@/lib/integration-store"

// IntakeQ Submission Webhook. Configure the URL in IntakeQ as:
//   https://<app>/api/webhooks/intakeq?token=<INTAKEQ_WEBHOOK_SECRET>
// IntakeQ posts { IntakeId, Type: "Intake Submitted", ClientId, ... } on submit;
// we fetch that one intake, categorize the referral answer, and store it.
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token")
  const secret = await getIntakeqWebhookSecret()
  if (!secret || token !== secret) return new NextResponse("Forbidden", { status: 403 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 }) }

  if (body?.Type && body.Type !== "Intake Submitted") return NextResponse.json({ ok: true, skipped: true })
  const intakeId = body?.IntakeId
  if (!intakeId) return NextResponse.json({ ok: false, error: "no IntakeId" }, { status: 400 })

  try {
    const category = await ingestIntake(String(intakeId))
    return NextResponse.json({ ok: true, category })
  } catch (e: any) {
    // Return 200 so IntakeQ doesn't retry-storm; the error is logged for us.
    console.error("[intakeq webhook]", e?.message ?? e)
    return NextResponse.json({ ok: false, logged: true })
  }
}
