import ReferralCallIntake from "@/components/referral-calls/intake"
import { loadOnCallPage } from "@/lib/referral-calls/page-data"
import { OnCallMessage } from "../on-call-states"

export const dynamic = "force-dynamic"
export const metadata = { title: "Referral call" }

export default async function OnCallRecordPage({ params }: { params: { id: string } }) {
  const data = await loadOnCallPage(params.id)
  if (data.kind === "not-set-up") {
    return <OnCallMessage title="On-call isn't set up yet" body="An admin needs to open the On-call page once to create the call log." />
  }
  if (data.kind === "conflict") return <OnCallMessage title="The call log couldn't be opened" body={data.message} />
  if (data.kind === "not-found") return <OnCallMessage title="Call not found" body="It may have been deleted, or the link is wrong." back />
  // Keyed by record so opening another call starts from a clean form.
  return <ReferralCallIntake key={params.id} {...data.props} />
}
