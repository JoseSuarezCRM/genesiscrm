import ReferralCallIntake from "@/components/referral-calls/intake"
import { loadOnCallPage } from "@/lib/referral-calls/page-data"
import { OnCallMessage } from "./on-call-states"

// Pages live under /on-call rather than /referral-calls: the middleware matcher
// skips every path that starts with "refer", which would leave them unguarded.

export const dynamic = "force-dynamic"
export const metadata = { title: "New referral call" }

export default async function OnCallPage() {
  const data = await loadOnCallPage()
  if (data.kind === "not-set-up") {
    return <OnCallMessage title="On-call isn't set up yet" body="An admin needs to open this page once to create the call log. Then you'll be able to log calls here." />
  }
  if (data.kind === "conflict") return <OnCallMessage title="The call log couldn't be opened" body={data.message} />
  if (data.kind === "not-found") return <OnCallMessage title="Call not found" body="It may have been deleted." back />
  return <ReferralCallIntake {...data.props} />
}
