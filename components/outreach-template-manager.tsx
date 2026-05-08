"use client"

import { useState, useTransition } from "react"
import { OutreachChannel, OutreachTrigger } from "@prisma/client"
import { updateOutreachTemplate, toggleOutreachTemplate } from "@/app/actions/outreach-templates"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Pencil, CheckCircle2, XCircle } from "lucide-react"

type Template = {
  id: string
  trigger: OutreachTrigger
  channel: OutreachChannel
  subject: string | null
  body: string
  isActive: boolean
  updatedAt: Date
}

const TRIGGER_LABELS: Record<OutreachTrigger, string> = {
  MANUAL: "Manual",
  STATUS_SCHEDULED: "Appointment Scheduled",
  STATUS_COMPLETED: "Visit Completed",
  REMINDER_24HR: "24hr Reminder",
}

const PLACEHOLDERS = `{{firstName}}, {{appointmentDate}}, {{practiceName}}, {{practicePhone}}`
const SMS_CHAR_LIMIT = 160

interface Props {
  templates: Template[]
}

export default function OutreachTemplateManager({ templates: initial }: Props) {
  const [templates, setTemplates] = useState(initial)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Edit form state
  const [editBody, setEditBody] = useState("")
  const [editSubject, setEditSubject] = useState("")
  const [editIsActive, setEditIsActive] = useState(true)

  const editing = templates.find((t) => t.id === editingId) ?? null

  function handleToggle(t: Template) {
    setTogglingId(t.id)
    startTransition(async () => {
      try {
        const result = await toggleOutreachTemplate(t.id)
        setTemplates((prev) =>
          prev.map((tmpl) =>
            tmpl.id === t.id ? { ...tmpl, isActive: result.isActive, updatedAt: new Date() } : tmpl
          )
        )
      } finally {
        setTogglingId(null)
      }
    })
  }

  function openEdit(t: Template) {
    setEditingId(t.id)
    setEditBody(t.body)
    setEditSubject(t.subject ?? "")
    setEditIsActive(t.isActive)
    setError(null)
  }

  function closeEdit() {
    setEditingId(null)
    setError(null)
  }

  function handleSave() {
    if (!editing) return
    setError(null)
    startTransition(async () => {
      try {
        await updateOutreachTemplate(editing.id, {
          body: editBody,
          subject: editing.channel === OutreachChannel.EMAIL ? editSubject : null,
          isActive: editIsActive,
        })
        setTemplates((prev) =>
          prev.map((t) =>
            t.id === editing.id
              ? {
                  ...t,
                  body: editBody,
                  subject: editing.channel === OutreachChannel.EMAIL ? editSubject : null,
                  isActive: editIsActive,
                  updatedAt: new Date(),
                }
              : t
          )
        )
        closeEdit()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save")
      }
    })
  }

  // Group by trigger for display order
  const triggerOrder: OutreachTrigger[] = [
    OutreachTrigger.STATUS_SCHEDULED,
    OutreachTrigger.REMINDER_24HR,
    OutreachTrigger.STATUS_COMPLETED,
  ]

  const rows = triggerOrder.flatMap((trigger) =>
    [OutreachChannel.SMS, OutreachChannel.EMAIL].map((channel) =>
      templates.find((t) => t.trigger === trigger && t.channel === channel)
    ).filter(Boolean) as Template[]
  )

  return (
    <>
      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 text-left">Trigger</th>
              <th className="px-4 py-3 text-left">Channel</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Last Updated</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">
                  {TRIGGER_LABELS[t.trigger]}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={t.channel === "SMS" ? "secondary" : "outline"}>
                    {t.channel}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {t.isActive ? (
                    <span className="inline-flex items-center gap-1 text-green-700">
                      <CheckCircle2 className="h-4 w-4" />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-slate-400">
                      <XCircle className="h-4 w-4" />
                      Disabled
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {t.updatedAt.toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleToggle(t)}
                      disabled={togglingId === t.id}
                      className={t.isActive ? "text-slate-500 hover:text-red-600" : "text-slate-500 hover:text-green-600"}
                    >
                      {t.isActive ? "Disable" : "Enable"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(t)}>
                      <Pencil className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingId} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Edit Template —{" "}
              {editing ? `${TRIGGER_LABELS[editing.trigger]} / ${editing.channel}` : ""}
            </DialogTitle>
          </DialogHeader>

          {editing && (
            <div className="space-y-4 py-2">
              {/* Active toggle */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <Label htmlFor="isActive">Active (send this message automatically)</Label>
              </div>

              {/* Subject — email only */}
              {editing.channel === OutreachChannel.EMAIL && (
                <div>
                  <Label htmlFor="subject" className="mb-1 block">
                    Subject
                  </Label>
                  <Input
                    id="subject"
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    disabled={isPending}
                  />
                </div>
              )}

              {/* Body */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label htmlFor="body">Message Body</Label>
                  {editing.channel === OutreachChannel.SMS && (
                    <span
                      className={`text-xs ${
                        editBody.length > SMS_CHAR_LIMIT
                          ? "text-red-600"
                          : "text-slate-400"
                      }`}
                    >
                      {editBody.length} / {SMS_CHAR_LIMIT}
                    </span>
                  )}
                </div>
                <Textarea
                  id="body"
                  rows={editing.channel === OutreachChannel.EMAIL ? 8 : 4}
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  disabled={isPending}
                />
                <p className="text-xs text-slate-400 mt-1">
                  Placeholders: <code>{PLACEHOLDERS}</code>
                </p>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeEdit} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending || !editBody.trim()}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
