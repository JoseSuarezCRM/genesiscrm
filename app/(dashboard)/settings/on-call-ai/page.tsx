import { settingsPageOrRedirect } from "@/lib/auth-guard"
import Link from "next/link"
import AiRulesEditor from "@/components/referral-calls/ai-rules-editor"
import { getReferralCallDef } from "@/lib/referral-calls/provision"
import { getExtractionProfile } from "@/lib/referral-calls/profile"
import { addedProperties } from "@/lib/referral-calls/extras"

export const dynamic = "force-dynamic"
export const metadata = { title: "On-call AI" }

export default async function OnCallAiSettingsPage() {
  const session = await settingsPageOrRedirect("on-call-ai")

  const def = await getReferralCallDef()
  const profile = def ? await getExtractionProfile() : null

  return (
    <div className="max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">On-call AI</h1>
        <p className="mt-2 text-sm text-zinc-500">
          What the AI pulls from a pasted call or screenshot, and where it puts it. Staff always review the fields before a
          call is logged, and anything they type is never overwritten. Changes apply to the next call read.
        </p>
      </div>

      {!def || !profile ? (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
          The call log hasn&apos;t been set up yet.{" "}
          <Link href="/on-call" className="font-medium text-zinc-900 underline underline-offset-2">Open the On-call page</Link>{" "}
          once to create it, then come back here.
        </div>
      ) : (
        <div className="mt-6">
          <AiRulesEditor
            properties={def.properties}
            added={addedProperties(def.properties)}
            initialInstructions={profile.instructions}
            initialFields={profile.fields}
            updatedAt={profile.updatedAt}
          />
        </div>
      )}
    </div>
  )
}
