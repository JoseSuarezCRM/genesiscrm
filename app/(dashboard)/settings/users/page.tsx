import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import UserManager from "@/components/user-manager"
import { getTeams } from "@/app/actions/teams"

export default async function UsersPage() {
  const session = await auth()
  if ((session?.user as { role?: string })?.role !== "ADMIN") {
    redirect("/")
  }

  const [users, teams] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        permissions: true,
        isActive: true,
        createdAt: true,
        _count: { select: { referralsCreated: true } },
        teamMemberships: { select: { team: { select: { id: true, name: true } } } },
      },
    }),
    getTeams(),
  ])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
        <p className="text-sm text-slate-500">
          {users.length} user{users.length !== 1 ? "s" : ""}
        </p>
      </div>

      <UserManager users={users} teams={teams} currentUserId={session!.user.id} />
    </div>
  )
}
