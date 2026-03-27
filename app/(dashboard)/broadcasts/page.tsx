import Link from "next/link"
import { listBroadcasts } from "@/app/actions/broadcasts"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Send, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react"
import { format } from "date-fns"
import { BroadcastStatus } from "@prisma/client"

const STATUS_CONFIG: Record<BroadcastStatus, { label: string; icon: React.ReactNode; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  DRAFT:     { label: "Draft",     icon: <Clock className="h-3 w-3" />,        variant: "secondary" },
  SCHEDULED: { label: "Scheduled", icon: <Clock className="h-3 w-3" />,        variant: "outline" },
  SENDING:   { label: "Sending",   icon: <Loader2 className="h-3 w-3 animate-spin" />, variant: "default" },
  SENT:      { label: "Sent",      icon: <CheckCircle2 className="h-3 w-3" />, variant: "default" },
  FAILED:    { label: "Failed",    icon: <XCircle className="h-3 w-3" />,      variant: "destructive" },
}

export default async function BroadcastsPage() {
  const broadcasts = await listBroadcasts()

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Email Broadcasts</h1>
          <p className="text-sm text-slate-500 mt-1">Send bulk emails to patients and referring providers.</p>
        </div>
        <Button asChild>
          <Link href="/broadcasts/new">
            <Plus className="h-4 w-4 mr-2" />
            New Broadcast
          </Link>
        </Button>
      </div>

      {broadcasts.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Send className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No broadcasts yet</p>
          <p className="text-sm mt-1">Create your first broadcast to send emails to patients or providers.</p>
          <Button asChild className="mt-4">
            <Link href="/broadcasts/new">Create Broadcast</Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Subject</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Recipients</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Scheduled / Sent</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Created By</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {broadcasts.map((b) => {
                const cfg = STATUS_CONFIG[b.status]
                return (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{b.subject}</td>
                    <td className="px-4 py-3">
                      <Badge variant={cfg.variant} className="flex items-center gap-1 w-fit">
                        {cfg.icon}{cfg.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {b.status === "SENT"
                        ? `${b.sentCount} sent${b.failedCount ? `, ${b.failedCount} failed` : ""}`
                        : `${b.recipientCount} recipients`}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {b.sentAt ? format(new Date(b.sentAt), "MMM d, yyyy h:mm a")
                        : b.scheduledAt ? format(new Date(b.scheduledAt), "MMM d, yyyy h:mm a")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{b.createdBy?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{format(new Date(b.createdAt), "MMM d, yyyy")}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
