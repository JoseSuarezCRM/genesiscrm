import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Sidebar from "@/components/sidebar"
import SessionWatcher from "@/components/session-watcher"
import TopToolbar from "@/components/top-toolbar"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, message: true, link: true, read: true, createdAt: true },
  })

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar
        userName={session.user.name}
        userEmail={session.user.email}
        userRole={(session.user as any).role ?? "STAFF"}
        userPermissions={(session.user as any).permissions ?? []}
      />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopToolbar
          initialNotifications={notifications}
          permissions={(session.user as any).permissions ?? []}
          isAdmin={(session.user as any).role === "ADMIN"}
        />
        <main className="flex-1 overflow-auto bg-white">
          {children}
        </main>
      </div>
      <SessionWatcher />
    </div>
  )
}
