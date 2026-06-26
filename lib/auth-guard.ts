import { auth } from "@/lib/auth"
import { userCan } from "@/lib/permissions"

// Server-side gate for write actions. Throws unless the current user is an admin
// or has the given permission (directly or via a team). Pair every gated button
// with one of these so UI hiding isn't the only guard.
export async function requirePermission(key: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  if (!userCan(session.user as any, key)) throw new Error("You don't have permission to do this")
  return session
}
