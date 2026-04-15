import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import SmsInbox from "@/components/sms-inbox"

export default async function MessagesPage() {
  const session = await auth()
  const isAdmin = (session?.user as any)?.role === "ADMIN"

  const threads = await prisma.smsThread.findMany({
    orderBy: { lastMessageAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, direction: true, createdAt: true },
      },
    },
  })

  const serialized = threads.map((t) => ({
    ...t,
    lastMessageAt: t.lastMessageAt.toISOString(),
    createdAt: t.createdAt.toISOString(),
    messages: t.messages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    })),
  }))

  return (
    <div className="flex flex-col h-full p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">SMS Inbox</h1>
        <p className="text-sm text-slate-500">
          Two-way SMS conversations. Replies from patients or providers appear here automatically.
        </p>
      </div>
      <div className="flex-1 min-h-0">
        <SmsInbox initialThreads={serialized} isAdmin={isAdmin} />
      </div>
    </div>
  )
}
