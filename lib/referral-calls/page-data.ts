/**
 * What the /on-call pages load before rendering the intake. Server-only.
 */

import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { userCanLevel } from "@/lib/permissions"
import type { IntakeProps, IntakeUser } from "@/components/referral-calls/intake"
import { RC_DEFAULT_STATUS, RC_PERM_KEY } from "./constants"
import { ensureReferralCallObject, getReferralCallDef, type ReferralCallDef } from "./provision"
import { getExtractionProfile } from "./profile"
import { addedProperties } from "./extras"
import { RC_PROP_IDS, type RcPropId } from "./schema"
import { valuesToSnapshot } from "./snapshot"

export type OnCallPageData =
  | { kind: "ready"; props: IntakeProps }
  | { kind: "not-set-up" }
  | { kind: "conflict"; message: string }
  | { kind: "not-found" }

export async function loadOnCallPage(recordId?: string): Promise<OnCallPageData> {
  const session = await auth()
  const user = session?.user as { id: string; name?: string | null; email?: string | null; role?: string; permissions?: string[] } | undefined
  if (!user?.id) redirect("/login")
  // The intake writes; View-only users get the log instead.
  if (!userCanLevel(user, RC_PERM_KEY, "EDIT")) {
    redirect(userCanLevel(user, RC_PERM_KEY, "VIEW") ? "/objects/referral-calls" : "/")
  }

  // Creating the object is an admin's first visit; afterwards anyone who can
  // log calls keeps it complete (it only ever adds).
  let def: ReferralCallDef | null
  try {
    const existing = await getReferralCallDef()
    if (!existing && user.role !== "ADMIN") return { kind: "not-set-up" }
    def = await ensureReferralCallObject(user.id)
  } catch (e) {
    const message = e instanceof Error && e.message.includes("wasn't created by the On-call intake")
      ? e.message
      : "The call log couldn't be opened. Try again in a moment."
    return { kind: "conflict", message }
  }

  const [profile, users, awaiting, rec] = await Promise.all([
    getExtractionProfile(),
    (prisma as any).user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    }) as Promise<IntakeUser[]>,
    (prisma as any).customObjectRecord.count({
      where: { objectDefId: def.id, values: { path: ["status"], equals: RC_DEFAULT_STATUS } },
    }) as Promise<number>,
    recordId
      ? (prisma as any).customObjectRecord.findFirst({
          // Scoped to the call log: another object's record id opens nothing.
          where: { id: recordId, objectDefId: def.id },
          select: { id: true, recordNumber: true, ownerId: true, values: true },
        })
      : Promise.resolve(null),
  ])
  if (recordId && !rec) return { kind: "not-found" }

  const added = addedProperties(def.properties)
  const extraIds = new Set(added.map((p) => p.id))
  const labels: Partial<Record<RcPropId, string>> = {}
  for (const p of def.properties) if (RC_PROP_IDS.has(p.id)) labels[p.id as RcPropId] = p.name

  const me: IntakeUser = { id: user.id, name: user.name ?? null, email: user.email ?? "" }
  // The current owner stays selectable even if they have since been deactivated.
  let userList = users
  if (rec?.ownerId && !users.some((u) => u.id === rec.ownerId)) {
    const o = await (prisma as any).user.findUnique({ where: { id: rec.ownerId }, select: { id: true, name: true, email: true } })
    if (o) userList = [...users, o]
  }
  if (!userList.some((u) => u.id === me.id)) userList = [me, ...userList]

  return {
    kind: "ready",
    props: {
      me,
      users: userList,
      addedProperties: added,
      rules: profile.fields,
      labels,
      awaiting,
      aiEnabled: !!process.env.ANTHROPIC_API_KEY,
      canViewLog: true,
      record: rec
        ? {
            id: rec.id,
            recordNumber: rec.recordNumber ?? null,
            ownerId: rec.ownerId ?? null,
            snapshot: valuesToSnapshot((rec.values as Record<string, unknown>) ?? {}, extraIds),
          }
        : undefined,
    },
  }
}
