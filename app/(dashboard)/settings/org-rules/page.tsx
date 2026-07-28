import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getOrgRules, getOrgRulesPoller, getOrgRulesRunLogs } from "@/app/actions/org-rules"
import OrgRulesManager from "@/components/org-rules-manager"

export default async function OrgRulesPage() {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") redirect("/")

  const [rules, poller, logs, practices] = await Promise.all([
    getOrgRules(),
    getOrgRulesPoller(),
    getOrgRulesRunLogs(),
    prisma.referringPractice.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
  ])
  const practiceNames = practices.map((p) => p.name)

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Organization Name Rules</h1>
        <p className="text-sm text-slate-500 mt-1">
          Define how incoming organization names on referrals are normalized to your known practices.
          When a match is found the referral is automatically linked — or a new practice is created if it doesn't exist yet.
        </p>
      </div>

      <OrgRulesManager initialRules={rules} initialPoller={poller} initialLogs={logs} practiceNames={practiceNames} />
    </div>
  )
}
