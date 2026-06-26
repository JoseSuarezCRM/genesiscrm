import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { userCan, userCanLevel, userCanDelete, type AccessLevel } from "@/lib/permissions"

// Server-side gate for a binary capability (Export, Import, Merge, etc).
export async function requirePermission(key: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  if (!userCan(session.user as any, key)) throw new Error("You don't have permission to do this")
  return session
}

// Server-side gate for graded object access (VIEW / EDIT).
export async function requireAccess(objectKey: string, level: AccessLevel) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  if (!userCanLevel(session.user as any, objectKey, level)) throw new Error("You don't have permission to do this")
  return session
}

// Page guard: redirect away if the user has no View access to an object, so
// "No access" objects aren't reachable (even by deep link). Returns the session.
export async function requireView(objectKey: string, to = "/") {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!userCanLevel(session.user as any, objectKey, "VIEW")) redirect(to)
  return session
}

// Server-side gate for the separate delete capability.
export async function requireDelete(objectKey: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")
  if (!userCanDelete(session.user as any, objectKey)) throw new Error("You don't have permission to delete this")
  return session
}
