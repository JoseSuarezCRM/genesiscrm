import Link from "next/link"
import { requireView } from "@/lib/auth-guard"
import { listBroadcasts } from "@/app/actions/broadcasts"
import { getIvrConfig } from "@/app/actions/ivr"
import { getSmsAutoResponses } from "@/app/actions/sms-auto"
import { getSequences } from "@/app/actions/sequences"
import { listDirectEmails } from "@/app/actions/direct-email"
import { prisma } from "@/lib/prisma"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Send, Clock, CheckCircle2, XCircle, Loader2, Phone, MessageSquare, GitBranch, Mail } from "lucide-react"
import { format } from "date-fns"
import { BroadcastStatus } from "@prisma/client"
import IvrBuilder from "@/components/ivr-builder"
import SmsAutoReplyManager from "@/components/sms-auto-reply-manager"
import SequenceManager from "@/components/sequence-manager"
import DirectEmailComposer from "@/components/direct-email-composer"
import { getMySenders } from "@/app/actions/account"

const STATUS_CONFIG: Record<BroadcastStatus, { label: string; icon: React.ReactNode; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  DRAFT:     { label: "Draft",     icon: <Clock className="h-3 w-3" />,        variant: "secondary" },
  SCHEDULED: { label: "Scheduled", icon: <Clock className="h-3 w-3" />,        variant: "outline" },
  SENDING:   { label: "Sending",   icon: <Loader2 className="h-3 w-3 animate-spin" />, variant: "default" },
  SENT:      { label: "Sent",      icon: <CheckCircle2 className="h-3 w-3" />, variant: "default" },
  FAILED:    { label: "Failed",    icon: <XCircle className="h-3 w-3" />,      variant: "destructive" },
}

const TABS = [
  { key: "email",     label: "Email Broadcasts", icon: Send },
  { key: "compose",   label: "Compose",           icon: Mail },
  { key: "sequences", label: "Sequences",         icon: GitBranch },
  { key: "ivr",       label: "Voice IVR",         icon: Phone },
  { key: "sms",       label: "SMS Auto-Reply",    icon: MessageSquare },
]

interface Props {
  searchParams: { tab?: string }
}

export default async function BroadcastsPage({ searchParams }: Props) {
  await requireView("BROADCASTS")
  const tab = searchParams.tab ?? "email"
  const mySenders = tab === "compose" ? await getMySenders() : []

  const [broadcasts, ivrConfig, smsRules, sequences, practices, composeContacts, sentEmails] = await Promise.all([
    tab === "email"     ? listBroadcasts()        : Promise.resolve([]),
    tab === "ivr"       ? getIvrConfig()           : Promise.resolve(null),
    tab === "sms"       ? getSmsAutoResponses()    : Promise.resolve([]),
    tab === "sequences" ? getSequences()           : Promise.resolve([]),
    tab === "sequences" ? prisma.referringPractice.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    tab === "compose"   ? prisma.referral.findMany({
      where: { patientEmail: { not: null } },
      select: { patientFirstName: true, patientLastName: true, patientEmail: true },
      distinct: ["patientEmail"],
      orderBy: { patientFirstName: "asc" },
    }).then(rows =>
      rows.map(r => ({ name: `${r.patientFirstName} ${r.patientLastName}`.trim(), email: r.patientEmail!, type: "patient" as const }))
    ) : Promise.resolve([]),
    tab === "compose"   ? listDirectEmails() : Promise.resolve([]),
  ])

  // Merge referring doctors into contacts
  const doctorContacts = tab === "compose" ? await prisma.referringDoctor.findMany({
    where: { email: { not: null } },
    select: { name: true, email: true },
    orderBy: { name: "asc" },
  }).then(rows => rows.map(r => ({ name: r.name, email: r.email!, type: "provider" as const }))) : []

  const contacts = [...composeContacts, ...doctorContacts]

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Broadcasts & Automations</h1>
          <p className="text-sm text-slate-500 mt-1">Manage email campaigns, voice menus, and SMS auto-replies.</p>
        </div>
        {tab === "email" && (
          <Button asChild>
            <Link href="/broadcasts/new">
              <Plus className="h-4 w-4 mr-2" />
              New Broadcast
            </Link>
          </Button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <Link
            key={key}
            href={`/broadcasts?tab=${key}`}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === key
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </div>

      {/* Email broadcasts tab */}
      {tab === "email" && (
        <>
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
            <div className="rounded-xl border bg-white overflow-hidden">
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
                  {broadcasts.map((b: any) => {
                    const cfg = STATUS_CONFIG[b.status as BroadcastStatus]
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
        </>
      )}

      {/* IVR tab */}
      {tab === "ivr" && (
        <IvrBuilder
          initialConfig={
            ivrConfig
              ? {
                  ...ivrConfig,
                  options: ivrConfig.options.map((o) => ({
                    id:        o.id,
                    digit:     o.digit,
                    label:     o.label,
                    action:    o.action,
                    message:   o.message   ?? undefined,
                    forwardTo: o.forwardTo ?? undefined,
                    order:     o.order,
                  })),
                }
              : null
          }
        />
      )}

      {/* Sequences tab */}
      {tab === "sequences" && (
        <SequenceManager sequences={sequences as any} practices={practices} />
      )}

      {/* Compose tab */}
      {tab === "compose" && (
        <DirectEmailComposer contacts={contacts} sentEmails={sentEmails as any} senders={mySenders} />
      )}

      {/* SMS auto-reply tab */}
      {tab === "sms" && (
        <SmsAutoReplyManager
          initialRules={smsRules.map((r) => ({
            ...r,
            description: r.description ?? null,
          }))}
        />
      )}
    </div>
  )
}
