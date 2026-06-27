"use client"

import StyledSelect from "@/components/ui/styled-select"
import { useState, useTransition } from "react"
import {
  Plus, Trash2, Pencil, Play, Pause, ChevronDown, ChevronRight,
  MessageSquare, Mail, Clock, Users, X, AlertCircle, CheckCircle2,
  GripVertical, Zap, GitBranch,
} from "lucide-react"
import { ReferralStatus, StepChannel } from "@prisma/client"
import { STATUS_LABELS } from "@/lib/utils"
import { cn } from "@/lib/utils"
import {
  createSequence, updateSequence, deleteSequence, toggleSequenceActive,
  SequenceInput, SequenceStepInput,
} from "@/app/actions/sequences"
import { RichTextEditor, tokensFromStrings } from "@/components/rich-text-editor"
import TokenTextarea from "@/components/ui/token-textarea"
import { EmailAttachments, type AttachmentRef } from "@/components/email-attachments"

// ── Types ─────────────────────────────────────────────────────────────────────

interface StepDraft {
  id?: string
  order: number
  delayDays: number
  channel: StepChannel
  subject: string
  body: string
  fromSender?: string
  attachments?: AttachmentRef[]
}

interface SequenceData {
  id: string
  name: string
  description: string | null
  isActive: boolean
  trigger: string
  triggerStatus: ReferralStatus | null
  filters: { referringPracticeId?: string; insuranceProvider?: string }
  steps: (StepDraft & { id: string })[]
  _count: { enrollments: number }
}

interface Props {
  sequences: SequenceData[]
  practices: { id: string; name: string }[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TRIGGER_OPTIONS = [
  { value: "ON_STATUS_CHANGE", label: "When status changes to…" },
  { value: "ON_CREATE",        label: "When any referral is created" },
  { value: "MANUAL",           label: "Manual enrollment only" },
]

const TEMPLATE_VARS = [
  "{patient_first_name}", "{patient_name}", "{provider_name}", "{practice_name}",
]

// ── Step editor ───────────────────────────────────────────────────────────────

function StepCard({
  step,
  index,
  onUpdate,
  onRemove,
}: {
  step: StepDraft
  index: number
  onUpdate: (s: StepDraft) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(true)

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      {/* Step header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-slate-50 select-none"
        onClick={() => setOpen(!open)}
      >
        <GripVertical className="h-4 w-4 text-slate-300 shrink-0" />
        <span className="text-xs font-mono text-slate-400 w-5 shrink-0">{index + 1}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {step.channel === "SMS"
            ? <MessageSquare className="h-3.5 w-3.5 text-blue-500" />
            : <Mail className="h-3.5 w-3.5 text-purple-500" />}
          <span className="text-xs font-medium text-slate-700">{step.channel}</span>
        </div>
        <span className="text-xs text-slate-500">
          {step.delayDays === 0 ? "immediately" : `day ${step.delayDays}`}
        </span>
        {step.subject && <span className="text-xs text-slate-400 truncate flex-1">{step.subject}</span>}
        <div className="ml-auto flex items-center gap-1">
          {open ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            className="p-1 text-slate-400 hover:text-red-500 rounded"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {/* Channel */}
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Channel</label>
              <div className="flex gap-2">
                {(["SMS", "EMAIL"] as StepChannel[]).map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => onUpdate({ ...step, channel: ch })}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                      step.channel === ch
                        ? ch === "SMS" ? "bg-blue-600 border-blue-600 text-white" : "bg-purple-600 border-purple-600 text-white"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    {ch === "SMS" ? <MessageSquare className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                    {ch}
                  </button>
                ))}
              </div>
            </div>
            {/* Delay */}
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">
                Send after <span className="text-blue-600">N days</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={step.delayDays}
                  onChange={(e) => onUpdate({ ...step, delayDays: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="w-20 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-xs text-slate-400">days after enrollment</span>
              </div>
            </div>
          </div>

          {/* From + Subject (email only) */}
          {step.channel === "EMAIL" && (
            <>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">From</label>
                <StyledSelect
                  value={(step as any).fromSender || "referrals"}
                  onChange={(e) => onUpdate({ ...step, fromSender: e.target.value } as any)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="referrals">Referrals@genesisortho.com</option>
                  <option value="surgery">surgery@genesisortho.com</option>
                  <option value="tpl">tpl@genesisortho.com</option>
                </StyledSelect>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Subject</label>
                <input
                  value={step.subject}
                  onChange={(e) => onUpdate({ ...step, subject: e.target.value })}
                  placeholder="e.g. Your appointment at Genesis Ortho"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Attachments</label>
                <EmailAttachments value={step.attachments ?? []} onChange={(a) => onUpdate({ ...step, attachments: a })} compact />
              </div>
            </>
          )}

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-500">Message</label>
              <div className="flex gap-1">
                {TEMPLATE_VARS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onUpdate({ ...step, body: step.body + v })}
                    className="text-xs text-blue-600 hover:bg-blue-50 px-1.5 py-0.5 rounded font-mono"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            {step.channel === "EMAIL" ? (
              <RichTextEditor value={step.body} onChange={(html) => onUpdate({ ...step, body: html })} minHeight={120} placeholder="Hi {patient_first_name}, this is Genesis Ortho…" tokens={tokensFromStrings(TEMPLATE_VARS)} />
            ) : (
              <TokenTextarea
                value={step.body}
                onChange={(v) => onUpdate({ ...step, body: v })}
                rows={3}
                placeholder="Hi {patient_first_name}, this is Genesis Ortho…"
                tokens={tokensFromStrings(TEMPLATE_VARS)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sequence form ─────────────────────────────────────────────────────────────

function SequenceForm({
  initial,
  practices,
  onSave,
  onCancel,
  saving,
}: {
  initial?: SequenceData
  practices: { id: string; name: string }[]
  onSave: (input: SequenceInput) => void
  onCancel: () => void
  saving: boolean
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [trigger, setTrigger] = useState<string>(initial?.trigger ?? "ON_STATUS_CHANGE")
  const [triggerStatus, setTriggerStatus] = useState<string>(initial?.triggerStatus ?? "")
  const [practiceFilter, setPracticeFilter] = useState(initial?.filters?.referringPracticeId ?? "")
  const [insuranceFilter, setInsuranceFilter] = useState(initial?.filters?.insuranceProvider ?? "")
  const [steps, setSteps] = useState<StepDraft[]>(
    initial?.steps.map((s) => ({ ...s, subject: s.subject ?? "" })) ?? []
  )

  function addStep() {
    setSteps((prev) => [
      ...prev,
      { order: prev.length, delayDays: prev.length === 0 ? 0 : (prev[prev.length - 1].delayDays + 1), channel: "SMS", subject: "", body: "" },
    ])
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onSave({
      name,
      description,
      isActive,
      trigger: trigger as SequenceInput["trigger"],
      triggerStatus: (trigger === "ON_STATUS_CHANGE" && triggerStatus) ? triggerStatus as ReferralStatus : null,
      filters: {
        ...(practiceFilter ? { referringPracticeId: practiceFilter } : {}),
        ...(insuranceFilter.trim() ? { insuranceProvider: insuranceFilter.trim() } : {}),
      },
      steps: steps.map((s, i) => ({ ...s, order: i, subject: s.subject || undefined })),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Name + active toggle */}
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-1">
          <label className="text-xs font-medium text-slate-500 block">Sequence name *</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. New Patient Welcome"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="pt-6 flex items-center gap-2 shrink-0">
          <label className="text-xs text-slate-500">Active</label>
          <button
            type="button"
            onClick={() => setIsActive(!isActive)}
            className={cn("w-9 h-5 rounded-full transition-colors relative", isActive ? "bg-blue-600" : "bg-slate-300")}
          >
            <span className={cn("absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", isActive ? "translate-x-4" : "translate-x-0.5")} />
          </button>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-500 block mb-1">Description (optional)</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this sequence do?"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Trigger */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5" /> Enrollment Trigger
        </p>
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">Trigger type</label>
          <StyledSelect
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {TRIGGER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </StyledSelect>
        </div>

        {trigger === "ON_STATUS_CHANGE" && (
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Enroll when referral reaches</label>
            <StyledSelect
              value={triggerStatus}
              onChange={(e) => setTriggerStatus(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Any status change</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </StyledSelect>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5" /> Audience Filters <span className="font-normal text-slate-400 normal-case">(optional — leave blank for all)</span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Referring practice</label>
            <StyledSelect
              value={practiceFilter}
              onChange={(e) => setPracticeFilter(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">All practices</option>
              {practices.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </StyledSelect>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Insurance contains</label>
            <input
              value={insuranceFilter}
              onChange={(e) => setInsuranceFilter(e.target.value)}
              placeholder="e.g. Medicare"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Steps ({steps.length})
          </p>
          <button
            type="button"
            onClick={addStep}
            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg"
          >
            <Plus className="h-3.5 w-3.5" /> Add step
          </button>
        </div>

        {steps.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-xl py-8 text-center text-slate-400 text-sm">
            No steps yet. Add your first message step above.
          </div>
        ) : (
          <div className="space-y-2">
            {steps.map((step, i) => (
              <StepCard
                key={i}
                step={step}
                index={i}
                onUpdate={(s) => setSteps((prev) => prev.map((x, j) => j === i ? s : x))}
                onRemove={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
              />
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : initial ? "Save changes" : "Create sequence"}
        </button>
      </div>
    </form>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SequenceManager({ sequences: initial, practices }: Props) {
  const [sequences, setSequences] = useState<SequenceData[]>(initial)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<SequenceData | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ msg: string; ok: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()

  function showFlash(msg: string, ok = true) {
    setFlash({ msg, ok })
    setTimeout(() => setFlash(null), 3000)
  }

  function handleCreate(input: SequenceInput) {
    startTransition(async () => {
      const res = await createSequence(input)
      if (!res.success) { showFlash(res.error ?? "Failed.", false); return }
      setCreating(false)
      showFlash("Sequence created.")
      window.location.reload()
    })
  }

  function handleUpdate(id: string, input: SequenceInput) {
    startTransition(async () => {
      const res = await updateSequence(id, input)
      if (!res.success) { showFlash(res.error ?? "Failed.", false); return }
      setEditing(null)
      showFlash("Sequence updated.")
      window.location.reload()
    })
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this sequence? Active enrollments will be cancelled.")) return
    startTransition(async () => {
      const res = await deleteSequence(id)
      if (!res.success) { showFlash(res.error ?? "Failed.", false); return }
      setSequences((prev) => prev.filter((s) => s.id !== id))
      showFlash("Sequence deleted.")
    })
  }

  function handleToggle(id: string, isActive: boolean) {
    startTransition(async () => {
      await toggleSequenceActive(id, isActive)
      setSequences((prev) => prev.map((s) => s.id === id ? { ...s, isActive } : s))
    })
  }

  function triggerLabel(seq: SequenceData) {
    if (seq.trigger === "MANUAL") return "Manual enrollment"
    if (seq.trigger === "ON_CREATE") return "On referral creation"
    return seq.triggerStatus
      ? `Status → ${STATUS_LABELS[seq.triggerStatus]}`
      : "Any status change"
  }

  // Full-screen overlay for create/edit
  if (creating || editing) {
    const isEdit = !!editing
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {isEdit ? `Edit: ${editing!.name}` : "New Sequence"}
          </h2>
          <button onClick={() => { setCreating(false); setEditing(null) }} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <SequenceForm
          initial={isEdit ? editing! : undefined}
          practices={practices}
          onSave={isEdit ? (input) => handleUpdate(editing!.id, input) : handleCreate}
          onCancel={() => { setCreating(false); setEditing(null) }}
          saving={isPending}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">Sequences</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Automated multi-step SMS or email journeys triggered by referral events or filters.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-colors shrink-0"
        >
          <Plus className="h-3.5 w-3.5" /> New sequence
        </button>
      </div>

      {flash && (
        <div className={cn(
          "flex items-center gap-2 text-sm rounded-xl px-4 py-3 border",
          flash.ok ? "text-green-700 bg-green-50 border-green-200" : "text-red-700 bg-red-50 border-red-200"
        )}>
          {flash.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {flash.msg}
        </div>
      )}

      {sequences.length === 0 ? (
        <div className="text-center py-14 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl bg-white">
          No sequences yet. Create one to start sending automated messages.
        </div>
      ) : (
        <div className="space-y-2">
          {sequences.map((seq) => {
            const isExpanded = expanded === seq.id
            return (
              <div key={seq.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {/* Row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    className="flex items-center gap-2 flex-1 text-left min-w-0"
                    onClick={() => setExpanded(isExpanded ? null : seq.id)}
                  >
                    {isExpanded
                      ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                      : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
                    <span className={cn("h-2 w-2 rounded-full shrink-0", seq.isActive ? "bg-green-400" : "bg-slate-300")} />
                    <span className="font-semibold text-slate-900 truncate">{seq.name}</span>
                    <span className="text-xs text-slate-400 shrink-0 hidden sm:block">{triggerLabel(seq)}</span>
                  </button>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-slate-400 hidden md:flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />{seq.steps.length} step{seq.steps.length !== 1 ? "s" : ""}
                    </span>
                    <span className="text-xs text-slate-400 hidden md:flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />{seq._count.enrollments} enrolled
                    </span>

                    {/* Active toggle */}
                    <button
                      type="button"
                      onClick={() => handleToggle(seq.id, !seq.isActive)}
                      title={seq.isActive ? "Pause sequence" : "Activate sequence"}
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-colors",
                        seq.isActive
                          ? "border-green-200 text-green-700 bg-green-50 hover:bg-green-100"
                          : "border-slate-200 text-slate-500 bg-slate-50 hover:bg-slate-100"
                      )}
                    >
                      {seq.isActive ? <><Play className="h-3 w-3" />Active</> : <><Pause className="h-3 w-3" />Paused</>}
                    </button>

                    <button
                      onClick={() => setEditing(seq)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(seq.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Expanded steps */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
                    {seq.description && (
                      <p className="text-xs text-slate-500 mb-3">{seq.description}</p>
                    )}
                    {/* Filters summary */}
                    {(seq.filters.referringPracticeId || seq.filters.insuranceProvider) && (
                      <div className="flex gap-2 mb-3 flex-wrap">
                        {seq.filters.referringPracticeId && (
                          <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                            Practice filter active
                          </span>
                        )}
                        {seq.filters.insuranceProvider && (
                          <span className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">
                            Insurance: {seq.filters.insuranceProvider}
                          </span>
                        )}
                      </div>
                    )}
                    {seq.steps.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No steps configured.</p>
                    ) : (
                      <div className="relative pl-4">
                        {/* Vertical line */}
                        <div className="absolute left-1.5 top-2 bottom-2 w-px bg-slate-200" />
                        <div className="space-y-3">
                          {seq.steps.map((step, i) => (
                            <div key={step.id} className="relative flex items-start gap-3">
                              <div className={cn(
                                "absolute -left-2.5 top-1.5 h-3 w-3 rounded-full border-2 border-white",
                                step.channel === "SMS" ? "bg-blue-500" : "bg-purple-500"
                              )} />
                              <div className="ml-2 bg-white border border-slate-200 rounded-lg px-3 py-2 flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  {step.channel === "SMS"
                                    ? <MessageSquare className="h-3 w-3 text-blue-500 shrink-0" />
                                    : <Mail className="h-3 w-3 text-purple-500 shrink-0" />}
                                  <span className="text-xs font-medium text-slate-700">{step.channel}</span>
                                  <span className="text-xs text-slate-400">
                                    {step.delayDays === 0 ? "· immediately" : `· day ${step.delayDays}`}
                                  </span>
                                </div>
                                {step.subject && (
                                  <p className="text-xs font-medium text-slate-600 mb-0.5">{step.subject}</p>
                                )}
                                <p className="text-xs text-slate-500 line-clamp-2">{step.body}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
