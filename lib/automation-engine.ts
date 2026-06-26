import { prisma } from "@/lib/prisma"
import { AutomationTrigger, AutomationAction, ReferralStatus, TaskPriority } from "@prisma/client"
import { sendEmail } from "@/lib/graph-mailer"
import { sendSMS } from "@/lib/twilio"
import { enrollInMatchingSequences } from "@/app/actions/sequences"
import { evaluateRule as evalRule, evaluateGroups, selectBranch, type AutomationFlow as PureFlow, type Condition as PureCondition, type ConditionGroup } from "@/lib/automation-conditions"
import { walkGraph, delayMs, type AutomationGraph, type DelayUnit } from "@/lib/automation-graph"
import { findProcedureLocation } from "@/lib/surgery-procedures"

// Attach derived surgical provider + body part (from the stored procedure) so
// criteria can filter on them even though the case only stores `procedure`.
function withDerivedSurgeryFields(sc: Record<string, unknown>): Record<string, unknown> {
  const loc = findProcedureLocation((sc.procedure as string) ?? "")
  return { ...sc, surgeryProvider: loc.provider, surgeryBodyPart: loc.bodyPart }
}

// Template vars for surgery-case emails/notifications/tasks.
function surgeryVars(sc: Record<string, unknown>, extra: Partial<TemplateVars> = {}): TemplateVars {
  const name = (sc.patientName as string) ?? ""
  // Surgery names are stored "Last, First" — take the part after the comma.
  const firstName = name.includes(",") ? name.split(",").pop()!.trim() : name
  const loc = findProcedureLocation((sc.procedure as string) ?? "")
  const date = sc.surgeryDate ? new Date(sc.surgeryDate as string) : null
  return {
    patient_name: name,
    patient_first_name: firstName,
    procedure: (sc.procedure as string) ?? "",
    body_part: loc.bodyPart,
    surgical_provider: loc.provider,
    surgery_date: date && !isNaN(date.getTime())
      ? date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" })
      : "",
    facility: (sc.facility as string) ?? "",
    ...extra,
  }
}

// ─── Template variable resolution ─────────────────────────────────────────────

interface TemplateVars {
  provider_name?: string
  practice_name?: string
  patient_name?: string
  patient_first_name?: string
  count?: number
  period?: string
  days?: number
  status?: string
  call_count?: number
  auth_status?: string
  tag_name?: string
  referral_url?: string
  // Surgery case
  procedure?: string
  body_part?: string
  surgical_provider?: string
  surgery_date?: string
  facility?: string
}

function resolveTemplate(template: string, vars: TemplateVars): string {
  const btnHtml = vars.referral_url
    ? `<a href="${vars.referral_url}" style="display:inline-block;margin:16px 0;padding:10px 24px;background-color:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:6px;font-family:sans-serif;font-weight:600;font-size:14px;">View Referral →</a>`
    : ""
  return template
    .replace(/\{provider_name\}/g, vars.provider_name ?? "the provider")
    .replace(/\{practice_name\}/g, vars.practice_name ?? "the practice")
    .replace(/\{patient_name\}/g, vars.patient_name ?? "the patient")
    .replace(/\{patient_first_name\}/g, vars.patient_first_name ?? "the patient")
    .replace(/\{count\}/g, String(vars.count ?? ""))
    .replace(/\{period\}/g, vars.period ?? "")
    .replace(/\{days\}/g, String(vars.days ?? ""))
    .replace(/\{status\}/g, vars.status ?? "")
    .replace(/\{call_count\}/g, String(vars.call_count ?? ""))
    .replace(/\{auth_status\}/g, vars.auth_status ?? "")
    .replace(/\{tag_name\}/g, vars.tag_name ?? "")
    .replace(/\{procedure\}/g, vars.procedure ?? "")
    .replace(/\{body_part\}/g, vars.body_part ?? "")
    .replace(/\{surgical_provider\}/g, vars.surgical_provider ?? "")
    .replace(/\{surgery_date\}/g, vars.surgery_date ?? "")
    .replace(/\{facility\}/g, vars.facility ?? "")
    .replace(/\{referral_url\}/g, vars.referral_url ?? "")
    .replace(/\{referral_button\}/g, btnHtml)
}

function buildReferralUrl(referralId: string): string | undefined {
  const base = (process.env.NEXTAUTH_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")).replace(/\/$/, "")
  return base ? `${base}/referrals/${referralId}` : undefined
}

// ─── Period helpers ────────────────────────────────────────────────────────────

function periodStart(period: string): Date {
  const now = new Date()
  if (period === "week") return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1)
  if (period === "quarter") return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
  return new Date(0)
}

function periodLabel(period: string): string {
  if (period === "week") return "this week"
  if (period === "month") return "this month"
  if (period === "quarter") return "this quarter"
  return "overall"
}

function dedupeKey(period: string): string {
  const now = new Date()
  if (period === "week") return `${now.getFullYear()}-W${Math.ceil(now.getDate() / 7)}`
  if (period === "month") return `${now.getFullYear()}-${now.getMonth() + 1}`
  if (period === "quarter") return `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`
  return "all"
}

// ─── Multi-criteria condition checker ─────────────────────────────────────────

// The raw Prisma referral satisfies the pure ReferralForConditions shape
// (scalar columns + customProperties + tags), so we evaluate against it directly.
function checkConditions(referral: Record<string, unknown>, cfg: Record<string, unknown>): boolean {
  const ref = referral as Parameters<typeof evalRule>[0]

  // Legacy top-level filters (backward compat)
  if (cfg.practiceId && ref.referringPracticeId !== cfg.practiceId) return false
  if (cfg.locationId && ref.referringLocationId !== cfg.locationId) return false
  if (cfg.statusFilter && ref.status !== cfg.statusFilter) return false
  if (cfg.insuranceProvider) {
    const ip = String(ref.insuranceProvider ?? "").toLowerCase()
    if (!ip.includes((cfg.insuranceProvider as string).toLowerCase())) return false
  }
  if (cfg.tagId) {
    if (!(ref.tags ?? []).some(t => t.tagId === cfg.tagId)) return false
  }

  // New: OR-of-AND condition groups take precedence over the flat list.
  const groups = cfg.conditionGroups as ConditionGroup[] | undefined
  if (groups && groups.length) return evaluateGroups(ref, groups)

  // Conditions array (AND logic)
  const conditions = (cfg.conditions as PureCondition[]) ?? []
  return conditions.every(c => evalRule(ref, c))
}

// ─── Referral fetcher with all condition fields ────────────────────────────────

async function fetchReferralForEngine(referralId: string) {
  return prisma.referral.findUnique({
    where: { id: referralId },
    include: {
      referringDoctor: true,
      referringPractice: true,
      tags: { select: { tagId: true } },
    },
  })
}

// ─── Action executor ──────────────────────────────────────────────────────────

export interface RunStep { label: string; status: "ok" | "failed"; error?: string }
export interface RunLog { recordLabel: string; steps: RunStep[]; ok: boolean }

const ACTION_STEP_LABELS: Record<string, string> = {
  CREATE_TASK: "Create task",
  SEND_NOTIFICATION: "Send notification",
  UPDATE_REFERRAL_STATUS: "Update referral status",
  ASSIGN_REFERRAL: "Assign referral",
  ADD_TAG: "Add tag",
  SEND_EMAIL: "Send email",
  SEND_SMS: "Send SMS",
}

function stepLabel(type: string, cfg: Record<string, unknown>): string {
  const base = ACTION_STEP_LABELS[type] ?? type
  if (type === "SEND_EMAIL" && cfg.subject) return `${base}: ${String(cfg.subject).slice(0, 60)}`
  if (type === "CREATE_TASK" && cfg.title) return `${base}: ${String(cfg.title).slice(0, 60)}`
  if (type === "UPDATE_REFERRAL_STATUS" && cfg.status) return `${base} → ${cfg.status}`
  return base
}

function recordLabelFor(record: Record<string, unknown> | null, vars: TemplateVars): string {
  return (vars.patient_name as string)
    ?? (record?.patientName as string)
    ?? (record?.name as string)
    ?? (record?.email as string)
    ?? "record"
}

// Top-level executor: graph (visual flow) → flow (if/else) → single action.
// Returns a structured log (enrolled record + each step's outcome).
// `conditionRecord` is the object the workflow runs on (referral, provider,
// practice, location, surgery case); branch criteria evaluate against it.
// `referralId` is the referral that referral-specific actions operate on (null
// for non-referral objects).
async function executeAction(
  automation: { id: string; actionType: AutomationAction; actionConfig: unknown; flow?: unknown; graph?: unknown },
  referralId: string | null,
  vars: TemplateVars,
  triggeredByUserId?: string,
  conditionRecord?: Record<string, unknown> | null
): Promise<RunLog> {
  // For referral workflows that didn't pass a record, fall back to fetching it.
  const record = conditionRecord !== undefined
    ? conditionRecord
    : (referralId ? await fetchReferralForEngine(referralId) : null)
  const condRef = record ? (record as unknown as Parameters<typeof walkGraph>[2]) : null

  const steps: RunStep[] = []
  const run = async (type: AutomationAction, cfg: Record<string, unknown>) => {
    const issue = await runSingleAction(type, cfg, referralId, vars, triggeredByUserId, record)
    steps.push({ label: stepLabel(type, cfg), status: issue ? "failed" : "ok", ...(issue ? { error: issue } : {}) })
  }

  const graph = automation.graph as AutomationGraph | null | undefined
  if (graph && graph.rootId && graph.nodes) {
    // Walk to the first wait; run those actions; if paused, persist a resume.
    const { actions, resumeNodeId, resumeAt, waitLabel } = walkGraph(graph, graph.rootId, condRef)
    for (const action of actions) {
      await run(action.type as AutomationAction, (action.config ?? {}) as Record<string, unknown>)
    }
    if (resumeAt && resumeNodeId) {
      await scheduleResume(automation.id, resumeNodeId, resumeAt, referralId, record, vars, recordLabelFor(record, vars))
      steps.push({ label: waitLabel ?? "Wait", status: "ok" })
    }
  } else {
    const flow = automation.flow as PureFlow | null | undefined
    if (flow && (flow.then?.length || flow.else?.length)) {
      // Resolve which branch runs. With no rules the THEN branch runs; if rules
      // exist but we have no record context, conditions can't pass → ELSE.
      const rules = flow.rules ?? []
      let branch = flow.then ?? []
      if (rules.length) {
        branch = condRef
          ? selectBranch(condRef as unknown as Parameters<typeof selectBranch>[0], flow)
          : (flow.else ?? [])
      }
      for (const action of branch) {
        await run(action.type as AutomationAction, (action.config ?? {}) as Record<string, unknown>)
      }
    } else {
      await run(automation.actionType, automation.actionConfig as Record<string, unknown>)
    }
  }

  return { recordLabel: recordLabelFor(record, vars), steps, ok: steps.every(s => s.status !== "failed") }
}

// Build the run-create payload from a workflow's execution log.
function runData(log: RunLog, contextType: string, contextId: string, detail: string) {
  return {
    contextType,
    contextId,
    result: log.ok ? "success" : "error",
    detail: log.ok ? detail : `${detail} — ${log.steps.filter(s => s.status === "failed").map(s => s.error).join("; ")}`.slice(0, 1000),
    meta: { recordLabel: log.recordLabel, recordType: contextType, steps: log.steps } as any,
  }
}

// ─── Delay: pause & resume ─────────────────────────────────────────────────────

async function scheduleResume(
  automationId: string,
  resumeNodeId: string,
  resumeAt: Date,
  referralId: string | null,
  record: Record<string, unknown> | null,
  vars: TemplateVars,
  recordLabel: string,
) {
  await prisma.workflowResume.create({
    data: {
      automationId,
      resumeNodeId,
      resumeAt,
      referralId: referralId ?? null,
      recordLabel,
      vars: vars as any,
      record: (record ?? {}) as any,
    },
  })
}

// Process workflows whose delay has elapsed: continue from where they paused.
export async function runDueWorkflowResumes() {
  const due = await prisma.workflowResume.findMany({
    where: { resumeAt: { lte: new Date() } },
    orderBy: { resumeAt: "asc" },
    take: 100,
    include: { automation: true },
  })

  for (const r of due) {
    const automation = r.automation
    const graph = automation.graph as AutomationGraph | null
    if (!automation.isActive || !graph || !graph.nodes) {
      await prisma.workflowResume.delete({ where: { id: r.id } }).catch(() => {})
      continue
    }

    const record = (r.record ?? null) as Record<string, unknown> | null
    const condRef = record ? (record as unknown as Parameters<typeof walkGraph>[2]) : null
    const vars = (r.vars ?? {}) as TemplateVars

    const { actions, resumeNodeId, resumeAt, waitLabel } = walkGraph(graph, r.resumeNodeId, condRef)
    const steps: RunStep[] = []
    for (const a of actions) {
      const cfg = (a.config ?? {}) as Record<string, unknown>
      const issue = await runSingleAction(a.type as AutomationAction, cfg, r.referralId, vars, undefined, record)
      steps.push({ label: stepLabel(a.type, cfg), status: issue ? "failed" : "ok", ...(issue ? { error: issue } : {}) })
    }

    if (resumeAt && resumeNodeId) {
      await prisma.workflowResume.update({
        where: { id: r.id },
        data: { resumeNodeId, resumeAt },
      })
      steps.push({ label: waitLabel ?? "Wait", status: "ok" })
    } else {
      await prisma.workflowResume.delete({ where: { id: r.id } })
    }

    await prisma.automationRun.create({
      data: {
        automationId: automation.id,
        contextType: "resume",
        contextId: (record?.id as string) ?? "n/a",
        result: steps.some(s => s.status === "failed") ? "error" : "success",
        detail: "Resumed after delay",
        meta: { recordLabel: r.recordLabel ?? "record", recordType: "resume", steps } as any,
      },
    }).catch(() => {})
  }
}

// Email of the enrolled record itself (surgery case `email`, referral patient,
// provider, etc.) — used by the "record_email" recipient option.
function recordEmail(record?: Record<string, unknown> | null): string | null {
  if (!record) return null
  const e = (record.email ?? record.patientEmail) as string | undefined
  return e && e.trim() ? e.trim() : null
}

// Runs one action of the given type with its config.
// Returns a human-readable issue string if the action couldn't complete (e.g.
// an email that didn't send), or null on success.
async function runSingleAction(
  actionType: AutomationAction,
  cfg: Record<string, unknown>,
  referralId: string | null,
  vars: TemplateVars,
  triggeredByUserId?: string,
  record?: Record<string, unknown> | null
): Promise<string | null> {
  const automation = { actionType } // local alias so existing `automation.actionType` checks still read

  // If the action references a saved Communications template, load its content.
  // Referencing by id keeps workflow graphs small and lets edits propagate.
  let tplSubject: string | null = null
  let tplBody: string | null = null
  if (cfg.templateId) {
    const tpl = await prisma.messageTemplate.findUnique({ where: { id: cfg.templateId as string } })
    if (tpl) { tplSubject = tpl.subject; tplBody = tpl.body }
  }

  if (automation.actionType === AutomationAction.CREATE_TASK) {
    const title = resolveTemplate((cfg.title as string) || "Automation task", vars)
    const description = cfg.description ? resolveTemplate(cfg.description as string, vars) : null
    const priority = (cfg.priority as TaskPriority) ?? TaskPriority.NORMAL
    let assignedToId = (cfg.assignedToId as string) || null
    if (assignedToId === "assigned_to" && referralId) {
      const r = await prisma.referral.findUnique({ where: { id: referralId }, select: { assignedToId: true } })
      assignedToId = r?.assignedToId ?? null
    }
    const dueDays = cfg.dueDaysFromNow ? Number(cfg.dueDaysFromNow) : null
    const dueDate = dueDays ? new Date(Date.now() + dueDays * 86400000) : null

    const task = await prisma.task.create({
      data: {
        title,
        description,
        priority,
        dueDate,
        referralId,
        createdById: triggeredByUserId ?? (await prisma.user.findFirst({ where: { role: "ADMIN" } }))!.id,
        assignedToId,
      },
    })

    if (assignedToId && assignedToId !== triggeredByUserId) {
      await prisma.notification.create({
        data: {
          userId: assignedToId,
          type: "TASK_ASSIGNED",
          message: `Automation assigned you a task: "${title}"`,
          link: `/tasks?highlight=${task.id}`,
          taskId: task.id,
        },
      })
    }
  }

  if (automation.actionType === AutomationAction.SEND_NOTIFICATION) {
    const message = resolveTemplate((cfg.message as string) || "Automation triggered", vars)
    const link = referralId ? `/referrals/${referralId}` : null
    let userIds: string[] = []
    const target = cfg.userId as string

    if (target === "all_admins") {
      const admins = await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } })
      userIds = admins.map(a => a.id)
    } else if (target === "assigned_to" && referralId) {
      const r = await prisma.referral.findUnique({ where: { id: referralId }, select: { assignedToId: true } })
      if (r?.assignedToId) userIds = [r.assignedToId]
    } else if (target) {
      userIds = [target]
    }

    for (const uid of userIds) {
      await prisma.notification.create({ data: { userId: uid, type: "AUTOMATION", message, link } })
    }
  }

  if (automation.actionType === AutomationAction.UPDATE_REFERRAL_STATUS && referralId) {
    const status = cfg.status as ReferralStatus
    if (status) await prisma.referral.update({ where: { id: referralId }, data: { status } })
  }

  if (automation.actionType === AutomationAction.ASSIGN_REFERRAL && referralId) {
    const userId = cfg.userId as string
    if (userId) {
      await prisma.referral.update({ where: { id: referralId }, data: { assignedToId: userId } })
      const r = await prisma.referral.findUnique({ where: { id: referralId }, select: { patientFirstName: true, patientLastName: true } })
      await prisma.notification.create({
        data: {
          userId,
          type: "REFERRAL_ASSIGNED",
          message: `You were assigned the referral for ${r?.patientFirstName} ${r?.patientLastName} (via automation)`,
          link: `/referrals/${referralId}`,
        },
      })
    }
  }

  if (automation.actionType === AutomationAction.SEND_EMAIL) {
    const subject = resolveTemplate((tplSubject ?? (cfg.subject as string)) || "Automation notification", vars)
    const bodyText = resolveTemplate((tplBody ?? (cfg.body as string)) || "", vars)
    // Body may already be HTML (rich text editor); only convert newlines for legacy plain text.
    const inner = /<[a-z][\s\S]*>/i.test(bodyText) ? bodyText : bodyText.replace(/\n/g, "<br/>")
    const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1e293b;">${inner}</div>`
    const emailAttachments = (Array.isArray(cfg.attachments) ? cfg.attachments : []) as any

    const resolveRecipientList = async (list: unknown): Promise<string[]> => {
      const emailSet = new Set<string>()
      if (Array.isArray(list)) {
        for (const r of list as { type: string; value: string }[]) {
          if (r.type === "record_email") {
            const e = recordEmail(record)
            if (e) emailSet.add(e)
          } else if (r.type === "all_admins") {
            const admins = await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { email: true } })
            admins.forEach(a => emailSet.add(a.email))
          } else if (r.type === "assigned_to" && referralId) {
            const ref = await prisma.referral.findUnique({ where: { id: referralId }, select: { assignedTo: { select: { email: true } } } })
            if (ref?.assignedTo?.email) emailSet.add(ref.assignedTo.email)
          } else if (r.type === "user") {
            const ids = Array.isArray(r.value) ? r.value : (r.value ? [r.value] : [])
            for (const id of ids) {
              const u = await prisma.user.findUnique({ where: { id }, select: { email: true } })
              if (u?.email) emailSet.add(u.email)
            }
          } else if (r.type === "email" && r.value) {
            emailSet.add(r.value.trim())
          }
        }
      }
      return Array.from(emailSet)
    }

    let toEmails: string[]
    if (Array.isArray(cfg.recipients)) {
      toEmails = await resolveRecipientList(cfg.recipients)
    } else {
      // Legacy single-recipient format (backward compat)
      const toType = cfg.toType as string
      const legacySet = new Set<string>()
      if (toType === "custom" && cfg.customEmail) {
        legacySet.add((cfg.customEmail as string).trim())
      } else if (toType === "all_admins") {
        const admins = await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { email: true } })
        admins.forEach(a => legacySet.add(a.email))
      } else if (toType === "assigned_to" && referralId) {
        const r = await prisma.referral.findUnique({ where: { id: referralId }, select: { assignedTo: { select: { email: true } } } })
        if (r?.assignedTo?.email) legacySet.add(r.assignedTo.email)
      } else if ((toType === "specific_user" || toType === "user") && cfg.userId) {
        const u = await prisma.user.findUnique({ where: { id: cfg.userId as string }, select: { email: true } })
        if (u?.email) legacySet.add(u.email)
      }
      toEmails = Array.from(legacySet)
    }

    const ccEmails = await resolveRecipientList(cfg.cc)
    const bccEmails = await resolveRecipientList(cfg.bcc)

    if (!toEmails.length) {
      return "Email not sent: no recipient resolved (the enrolled record has no email, or the chosen recipient is empty)."
    }
    const result = await sendEmail(toEmails, subject, html, { cc: ccEmails, bcc: bccEmails, sender: (cfg.sender as any) || "referrals", attachments: emailAttachments })
    if (!result.success) {
      return `Email failed to ${toEmails.join(", ")} via ${(cfg.sender as string) || "referrals"}: ${result.error ?? "unknown error"}`
    }
  }

  if ((automation.actionType as string) === "SEND_SMS" && referralId) {
    const body = resolveTemplate((tplBody ?? (cfg.body as string)) || "", vars)
    if (body) {
      const referral = await prisma.referral.findUnique({ where: { id: referralId }, select: { patientPhone: true } })
      const phone = referral?.patientPhone
      if (phone) await sendSMS(phone, body)
    }
  }

  if (automation.actionType === AutomationAction.ADD_TAG && referralId) {
    const tagId = cfg.tagId as string
    if (tagId) {
      await prisma.referralTag.upsert({
        where: { referralId_tagId: { referralId, tagId } },
        create: { referralId, tagId },
        update: {},
      })
    }
  }

  return null
}

// ─── Event triggers ───────────────────────────────────────────────────────────

export async function runTrigger_ReferralCreated(referralId: string, triggeredByUserId?: string) {
  const automations = await prisma.automation.findMany({
    where: { triggerType: AutomationTrigger.REFERRAL_CREATED, isActive: true },
  })
  if (!automations.length) return

  const referral = await fetchReferralForEngine(referralId)
  if (!referral) return

  const vars: TemplateVars = {
    provider_name: referral.referringDoctor?.name ?? referral.referringDoctorName ?? undefined,
    practice_name: referral.referringPractice?.name ?? undefined,
    patient_name: `${referral.patientFirstName} ${referral.patientLastName}`,
    patient_first_name: referral.patientFirstName,
    referral_url: buildReferralUrl(referralId),
  }

  for (const auto of automations) {
    const cfg = auto.triggerConfig as Record<string, unknown>
    if (!checkConditions(referral, cfg)) continue

    const log = await executeAction(auto, referralId, vars, triggeredByUserId)
    await prisma.automationRun.create({
      data: { automationId: auto.id, ...runData(log, "referral", referralId, `Triggered on new referral for ${vars.patient_name}`) },
    })
  }
}

export async function runTrigger_EmbedReferralReceived(referralId: string) {
  const automations = await prisma.automation.findMany({
    where: { triggerType: AutomationTrigger.EMBED_REFERRAL_RECEIVED, isActive: true },
  })
  if (!automations.length) return

  const referral = await fetchReferralForEngine(referralId)
  if (!referral) return

  const vars: TemplateVars = {
    provider_name: referral.referringDoctor?.name ?? referral.referringDoctorName ?? undefined,
    practice_name: referral.referringPractice?.name ?? undefined,
    patient_name: `${referral.patientFirstName} ${referral.patientLastName}`,
    patient_first_name: referral.patientFirstName,
    referral_url: buildReferralUrl(referralId),
  }

  for (const auto of automations) {
    const cfg = auto.triggerConfig as Record<string, unknown>
    if (!checkConditions(referral, cfg)) continue

    const log = await executeAction(auto, referralId, vars)
    await prisma.automationRun.create({
      data: { automationId: auto.id, ...runData(log, "referral", referralId, `Triggered on embed form referral for ${vars.patient_name}`) },
    })
  }
}

export async function runTrigger_StatusChanged(referralId: string, fromStatus: ReferralStatus, toStatus: ReferralStatus, triggeredByUserId?: string) {
  const automations = await prisma.automation.findMany({
    where: { triggerType: AutomationTrigger.REFERRAL_STATUS_CHANGED, isActive: true },
  })
  if (!automations.length) return

  const referral = await fetchReferralForEngine(referralId)
  if (!referral) return

  const vars: TemplateVars = {
    provider_name: referral.referringDoctor?.name ?? referral.referringDoctorName ?? undefined,
    practice_name: referral.referringPractice?.name ?? undefined,
    patient_name: `${referral.patientFirstName} ${referral.patientLastName}`,
    patient_first_name: referral.patientFirstName,
    status: toStatus,
    referral_url: buildReferralUrl(referralId),
  }

  for (const auto of automations) {
    const cfg = auto.triggerConfig as Record<string, unknown>
    if (cfg.toStatus && cfg.toStatus !== toStatus) continue
    if (cfg.fromStatus && cfg.fromStatus !== fromStatus) continue
    if (!checkConditions(referral, cfg)) continue

    const log = await executeAction(auto, referralId, vars, triggeredByUserId)
    await prisma.automationRun.create({
      data: { automationId: auto.id, ...runData(log, "referral", referralId, `Status changed ${fromStatus} → ${toStatus}`) },
    })
  }

  await enrollInMatchingSequences(referralId, "ON_STATUS_CHANGE", toStatus).catch(() => {})
}

export async function runTrigger_CallAttemptsReached(referralId: string, callCount: number, triggeredByUserId?: string) {
  const automations = await prisma.automation.findMany({
    where: { triggerType: AutomationTrigger.CALL_ATTEMPTS_REACHED, isActive: true },
  })
  if (!automations.length) return

  const referral = await fetchReferralForEngine(referralId)
  if (!referral) return

  const vars: TemplateVars = {
    provider_name: referral.referringDoctor?.name ?? referral.referringDoctorName ?? undefined,
    practice_name: referral.referringPractice?.name ?? undefined,
    patient_name: `${referral.patientFirstName} ${referral.patientLastName}`,
    patient_first_name: referral.patientFirstName,
    call_count: callCount,
    referral_url: buildReferralUrl(referralId),
  }

  for (const auto of automations) {
    const cfg = auto.triggerConfig as Record<string, unknown>
    if (cfg.count && Number(cfg.count) !== callCount) continue
    if (!checkConditions(referral, cfg)) continue

    const already = await prisma.automationRun.findFirst({
      where: { automationId: auto.id, contextType: "referral", contextId: referralId, detail: { contains: `calls:${callCount}` } },
    })
    if (already) continue

    const log = await executeAction(auto, referralId, vars, triggeredByUserId)
    await prisma.automationRun.create({
      data: { automationId: auto.id, ...runData(log, "referral", referralId, `calls:${callCount} - ${callCount} call attempts reached`) },
    })
  }
}

export async function runTrigger_ReferralAssigned(referralId: string, assignedToId: string, triggeredByUserId?: string) {
  const automations = await prisma.automation.findMany({
    where: { triggerType: AutomationTrigger.REFERRAL_ASSIGNED, isActive: true },
  })
  if (!automations.length) return

  const referral = await fetchReferralForEngine(referralId)
  if (!referral) return

  const vars: TemplateVars = {
    provider_name: referral.referringDoctor?.name ?? referral.referringDoctorName ?? undefined,
    practice_name: referral.referringPractice?.name ?? undefined,
    patient_name: `${referral.patientFirstName} ${referral.patientLastName}`,
    patient_first_name: referral.patientFirstName,
    referral_url: buildReferralUrl(referralId),
  }

  for (const auto of automations) {
    const cfg = auto.triggerConfig as Record<string, unknown>
    if (cfg.assignedToId && cfg.assignedToId !== assignedToId) continue
    if (!checkConditions(referral, cfg)) continue

    const log = await executeAction(auto, referralId, vars, triggeredByUserId)
    await prisma.automationRun.create({
      data: { automationId: auto.id, ...runData(log, "referral", referralId, `Referral assigned to user ${assignedToId}`) },
    })
  }
}

export async function runTrigger_TagAdded(referralId: string, tagId: string, tagName: string, triggeredByUserId?: string) {
  const automations = await prisma.automation.findMany({
    where: { triggerType: "TAG_ADDED" as AutomationTrigger, isActive: true },
  })
  if (!automations.length) return

  const referral = await fetchReferralForEngine(referralId)
  if (!referral) return

  const vars: TemplateVars = {
    provider_name: referral.referringDoctor?.name ?? referral.referringDoctorName ?? undefined,
    practice_name: referral.referringPractice?.name ?? undefined,
    patient_name: `${referral.patientFirstName} ${referral.patientLastName}`,
    patient_first_name: referral.patientFirstName,
    tag_name: tagName,
    referral_url: buildReferralUrl(referralId),
  }

  for (const auto of automations) {
    const cfg = auto.triggerConfig as Record<string, unknown>
    if (cfg.tagId && cfg.tagId !== tagId) continue
    if (!checkConditions(referral, cfg)) continue

    const key = `${referralId}:tag:${tagId}`
    const already = await prisma.automationRun.findFirst({
      where: { automationId: auto.id, contextType: "referral", contextId: key },
    })
    if (already) continue

    const log = await executeAction(auto, referralId, vars, triggeredByUserId)
    await prisma.automationRun.create({
      data: { automationId: auto.id, ...runData(log, "referral", key, `Tag "${tagName}" added`) },
    })
  }
}

export async function runTrigger_DocumentUploaded(referralId: string, triggeredByUserId?: string) {
  const automations = await prisma.automation.findMany({
    where: { triggerType: "DOCUMENT_UPLOADED" as AutomationTrigger, isActive: true },
  })
  if (!automations.length) return

  const referral = await fetchReferralForEngine(referralId)
  if (!referral) return

  const vars: TemplateVars = {
    provider_name: referral.referringDoctor?.name ?? referral.referringDoctorName ?? undefined,
    practice_name: referral.referringPractice?.name ?? undefined,
    patient_name: `${referral.patientFirstName} ${referral.patientLastName}`,
    patient_first_name: referral.patientFirstName,
    referral_url: buildReferralUrl(referralId),
  }

  for (const auto of automations) {
    const cfg = auto.triggerConfig as Record<string, unknown>
    if (!checkConditions(referral, cfg)) continue

    const log = await executeAction(auto, referralId, vars, triggeredByUserId)
    await prisma.automationRun.create({
      data: { automationId: auto.id, ...runData(log, "referral", referralId, "Document uploaded") },
    })
  }
}

export async function runTrigger_AuthStatusChanged(referralId: string, _fromAuthStatus: string | null, toAuthStatus: string, triggeredByUserId?: string) {
  const automations = await prisma.automation.findMany({
    where: { triggerType: "AUTH_STATUS_CHANGED" as AutomationTrigger, isActive: true },
  })
  if (!automations.length) return

  const referral = await fetchReferralForEngine(referralId)
  if (!referral) return

  const vars: TemplateVars = {
    provider_name: referral.referringDoctor?.name ?? referral.referringDoctorName ?? undefined,
    practice_name: referral.referringPractice?.name ?? undefined,
    patient_name: `${referral.patientFirstName} ${referral.patientLastName}`,
    patient_first_name: referral.patientFirstName,
    auth_status: toAuthStatus,
    referral_url: buildReferralUrl(referralId),
  }

  for (const auto of automations) {
    const cfg = auto.triggerConfig as Record<string, unknown>
    if (cfg.toAuthStatus && cfg.toAuthStatus !== toAuthStatus) continue
    if (!checkConditions(referral, cfg)) continue

    const log = await executeAction(auto, referralId, vars, triggeredByUserId)
    await prisma.automationRun.create({
      data: { automationId: auto.id, ...runData(log, "referral", referralId, `Auth status → "${toAuthStatus}"`) },
    })
  }
}

export async function runTrigger_PipelineChanged(referralId: string, fromPipelineId: string | null, toPipelineId: string | null, triggeredByUserId?: string) {
  const automations = await prisma.automation.findMany({
    where: { triggerType: "PIPELINE_CHANGED" as AutomationTrigger, isActive: true },
  })
  if (!automations.length) return

  const referral = await fetchReferralForEngine(referralId)
  if (!referral) return

  const vars: TemplateVars = {
    provider_name: referral.referringDoctor?.name ?? referral.referringDoctorName ?? undefined,
    practice_name: referral.referringPractice?.name ?? undefined,
    patient_name: `${referral.patientFirstName} ${referral.patientLastName}`,
    patient_first_name: referral.patientFirstName,
    referral_url: buildReferralUrl(referralId),
  }

  for (const auto of automations) {
    const cfg = auto.triggerConfig as Record<string, unknown>
    if (cfg.toPipelineId && cfg.toPipelineId !== toPipelineId) continue
    if (cfg.fromPipelineId && cfg.fromPipelineId !== fromPipelineId) continue
    if (!checkConditions(referral, cfg)) continue

    const log = await executeAction(auto, referralId, vars, triggeredByUserId)
    await prisma.automationRun.create({
      data: { automationId: auto.id, ...runData(log, "referral", referralId, `Pipeline changed ${fromPipelineId ?? "none"} → ${toPipelineId ?? "none"}`) },
    })
  }
}

// ─── Count triggers ───────────────────────────────────────────────────────────

export async function runTrigger_ProviderReferralCount(providerId: string, triggeredByUserId?: string) {
  const automations = await prisma.automation.findMany({
    where: { triggerType: AutomationTrigger.PROVIDER_REFERRAL_COUNT, isActive: true },
  })
  if (!automations.length) return

  const provider = await prisma.referringDoctor.findUnique({
    where: { id: providerId },
    include: { practice: true },
  })
  if (!provider) return

  for (const auto of automations) {
    const cfg = auto.triggerConfig as Record<string, unknown>
    const threshold = Number(cfg.count ?? 0)
    const period = (cfg.period as string) ?? "month"
    if (!threshold) continue

    const start = periodStart(period)
    const count = await prisma.referral.count({
      where: { referringDoctorId: providerId, referralDate: { gte: start } },
    })
    if (count !== threshold) continue
    if (!checkConditions(provider as unknown as Record<string, unknown>, cfg)) continue

    const key = `${providerId}:${dedupeKey(period)}`
    const already = await prisma.automationRun.findFirst({
      where: { automationId: auto.id, contextType: "provider", contextId: key },
    })
    if (already) continue

    const vars: TemplateVars = {
      provider_name: provider.name,
      practice_name: provider.practice.name,
      count,
      period: periodLabel(period),
    }

    const log = await executeAction(auto, null, vars, triggeredByUserId, provider as unknown as Record<string, unknown>)
    await prisma.automationRun.create({
      data: { automationId: auto.id, ...runData(log, "provider", key, `${provider.name} reached ${count} referrals ${periodLabel(period)}`) },
    })
  }
}

export async function runTrigger_PracticeReferralCount(practiceId: string, triggeredByUserId?: string) {
  const automations = await prisma.automation.findMany({
    where: { triggerType: AutomationTrigger.PRACTICE_REFERRAL_COUNT, isActive: true },
  })
  if (!automations.length) return

  const practice = await prisma.referringPractice.findUnique({ where: { id: practiceId } })
  if (!practice) return

  for (const auto of automations) {
    const cfg = auto.triggerConfig as Record<string, unknown>
    const threshold = Number(cfg.count ?? 0)
    const period = (cfg.period as string) ?? "month"
    if (!threshold) continue

    const start = periodStart(period)
    const count = await prisma.referral.count({
      where: { referringPracticeId: practiceId, referralDate: { gte: start } },
    })
    if (count !== threshold) continue
    if (!checkConditions(practice as unknown as Record<string, unknown>, cfg)) continue

    const key = `${practiceId}:${dedupeKey(period)}`
    const already = await prisma.automationRun.findFirst({
      where: { automationId: auto.id, contextType: "practice", contextId: key },
    })
    if (already) continue

    const vars: TemplateVars = { practice_name: practice.name, count, period: periodLabel(period) }
    const log = await executeAction(auto, null, vars, triggeredByUserId, practice as unknown as Record<string, unknown>)
    await prisma.automationRun.create({
      data: { automationId: auto.id, ...runData(log, "practice", key, `${practice.name} reached ${count} referrals ${periodLabel(period)}`) },
    })
  }
}

export async function runTrigger_LocationReferralCount(locationId: string, triggeredByUserId?: string) {
  const automations = await prisma.automation.findMany({
    where: { triggerType: "LOCATION_REFERRAL_COUNT" as AutomationTrigger, isActive: true },
  })
  if (!automations.length) return

  const location = await prisma.practiceLocation.findUnique({ where: { id: locationId } })
  if (!location) return

  for (const auto of automations) {
    const cfg = auto.triggerConfig as Record<string, unknown>
    const threshold = Number(cfg.count ?? 0)
    const period = (cfg.period as string) ?? "month"
    if (!threshold) continue
    if (cfg.locationId && cfg.locationId !== locationId) continue

    const start = periodStart(period)
    const count = await prisma.referral.count({
      where: { referringLocationId: locationId, referralDate: { gte: start } },
    })
    if (count !== threshold) continue
    if (!checkConditions(location as unknown as Record<string, unknown>, cfg)) continue

    const key = `${locationId}:${dedupeKey(period)}`
    const already = await prisma.automationRun.findFirst({
      where: { automationId: auto.id, contextType: "location", contextId: key },
    })
    if (already) continue

    const vars: TemplateVars = { count, period: periodLabel(period) }
    const log = await executeAction(auto, null, vars, triggeredByUserId, location as unknown as Record<string, unknown>)
    await prisma.automationRun.create({
      data: { automationId: auto.id, ...runData(log, "location", key, `${location.name} reached ${count} referrals ${periodLabel(period)}`) },
    })
  }
}

// ─── Surgery triggers ─────────────────────────────────────────────────────────

export async function runTrigger_SurgeryStatusChanged(
  caseId: string,
  fromStatus: string,
  toStatus: string,
  triggeredByUserId?: string,
) {
  const automations = await prisma.automation.findMany({
    where: { triggerType: "SURGERY_STATUS_CHANGED" as AutomationTrigger, isActive: true },
  })
  if (!automations.length) return

  const rawSc = await (prisma as any).surgeryCase.findUnique({ where: { id: caseId } })
  if (!rawSc) return
  const sc = withDerivedSurgeryFields(rawSc)

  const vars = surgeryVars(sc, { status: toStatus })

  for (const auto of automations) {
    const cfg = auto.triggerConfig as Record<string, unknown>
    if (cfg.fromStatus && cfg.fromStatus !== fromStatus) continue
    if (cfg.toStatus && cfg.toStatus !== toStatus) continue
    if (!checkConditions(sc, cfg)) continue

    const log = await executeAction(auto, null, vars, triggeredByUserId, sc)
    await prisma.automationRun.create({
      data: { automationId: auto.id, ...runData(log, "surgery", caseId, `Surgery status ${fromStatus} → ${toStatus}`) },
    })
  }
}

export async function runTrigger_SurgeryCallAttemptsReached(
  caseId: string,
  callCount: number,
  triggeredByUserId?: string,
) {
  const automations = await prisma.automation.findMany({
    where: { triggerType: "SURGERY_CALL_ATTEMPTS_REACHED" as AutomationTrigger, isActive: true },
  })
  if (!automations.length) return

  const rawSc = await (prisma as any).surgeryCase.findUnique({ where: { id: caseId } })
  if (!rawSc) return
  const sc = withDerivedSurgeryFields(rawSc)

  const vars = surgeryVars(sc, { call_count: callCount })

  for (const auto of automations) {
    const cfg = auto.triggerConfig as Record<string, unknown>
    const threshold = Number(cfg.count ?? 4)
    if (callCount !== threshold) continue
    if (!checkConditions(sc, cfg)) continue

    const key = `${caseId}:calls:${callCount}`
    const already = await prisma.automationRun.findFirst({
      where: { automationId: auto.id, contextType: "surgery", contextId: key },
    })
    if (already) continue

    const log = await executeAction(auto, null, vars, triggeredByUserId, sc)
    await prisma.automationRun.create({
      data: { automationId: auto.id, ...runData(log, "surgery", key, `${callCount} surgery call attempts reached`) },
    })
  }
}

// ─── Scheduled triggers ───────────────────────────────────────────────────────

export async function runScheduledTriggers() {
  await runTrigger_NoActivity()
  await runTrigger_AppointmentUpcoming()
  await runTrigger_AppointmentOverdue()
  await runTrigger_ReferralStale()
  await runDueWorkflowResumes()
}

async function runTrigger_NoActivity() {
  const automations = await prisma.automation.findMany({
    where: { triggerType: AutomationTrigger.REFERRAL_NO_ACTIVITY, isActive: true },
  })
  if (!automations.length) return

  for (const auto of automations) {
    const cfg = auto.triggerConfig as Record<string, unknown>
    const days = Number(cfg.days ?? 7)
    const cutoff = new Date(Date.now() - days * 86400000)
    const statusFilter = cfg.statusFilter as ReferralStatus | undefined

    const staleReferrals = await prisma.referral.findMany({
      where: {
        status: statusFilter
          ? { equals: statusFilter }
          : { notIn: [ReferralStatus.COMPLETED, ReferralStatus.NO_SHOW] },
        updatedAt: { lte: cutoff },
        ...(cfg.assignedToId ? { assignedToId: cfg.assignedToId as string } : {}),
      },
      include: { referringDoctor: true, referringPractice: true, tags: { select: { tagId: true } } },
      take: 50,
    })

    for (const referral of staleReferrals) {
      if (!checkConditions(referral, cfg)) continue

      const key = `${referral.id}:noactivity:${days}`
      const already = await prisma.automationRun.findFirst({
        where: { automationId: auto.id, contextType: "referral", contextId: key },
      })
      if (already) continue

      const vars: TemplateVars = {
        provider_name: referral.referringDoctor?.name ?? referral.referringDoctorName ?? undefined,
        practice_name: referral.referringPractice?.name ?? undefined,
        patient_name: `${referral.patientFirstName} ${referral.patientLastName}`,
        patient_first_name: referral.patientFirstName,
        days,
        referral_url: buildReferralUrl(referral.id),
      }

      const log = await executeAction(auto, referral.id, vars)
      await prisma.automationRun.create({
        data: { automationId: auto.id, ...runData(log, "referral", key, `No activity for ${days} days`) },
      })
    }
  }
}

async function runTrigger_AppointmentUpcoming() {
  const automations = await prisma.automation.findMany({
    where: { triggerType: AutomationTrigger.APPOINTMENT_UPCOMING, isActive: true },
  })
  if (!automations.length) return

  for (const auto of automations) {
    const cfg = auto.triggerConfig as Record<string, unknown>
    const daysAhead = Number(cfg.daysAhead ?? 1)
    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() + daysAhead)
    const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate())
    const dayEnd = new Date(dayStart.getTime() + 86400000)

    const upcoming = await prisma.referral.findMany({
      where: { appointmentDate: { gte: dayStart, lt: dayEnd } },
      include: { referringDoctor: true, referringPractice: true, tags: { select: { tagId: true } } },
      take: 50,
    })

    for (const referral of upcoming) {
      if (!checkConditions(referral, cfg)) continue

      const key = `${referral.id}:appt:${daysAhead}`
      const already = await prisma.automationRun.findFirst({
        where: { automationId: auto.id, contextType: "referral", contextId: key },
      })
      if (already) continue

      const vars: TemplateVars = {
        patient_name: `${referral.patientFirstName} ${referral.patientLastName}`,
        patient_first_name: referral.patientFirstName,
        days: daysAhead,
        referral_url: buildReferralUrl(referral.id),
      }

      const log = await executeAction(auto, referral.id, vars)
      await prisma.automationRun.create({
        data: { automationId: auto.id, ...runData(log, "referral", key, `Appointment in ${daysAhead} day(s)`) },
      })
    }
  }
}

async function runTrigger_AppointmentOverdue() {
  const automations = await prisma.automation.findMany({
    where: { triggerType: "APPOINTMENT_OVERDUE" as AutomationTrigger, isActive: true },
  })
  if (!automations.length) return

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (const auto of automations) {
    const cfg = auto.triggerConfig as Record<string, unknown>
    const daysOverdue = Number(cfg.daysOverdue ?? 0)
    const cutoffDate = new Date(today.getTime() - daysOverdue * 86400000)

    const overdue = await prisma.referral.findMany({
      where: {
        appointmentDate: { lt: cutoffDate },
        status: ReferralStatus.SCHEDULED,
      },
      include: { referringDoctor: true, referringPractice: true, tags: { select: { tagId: true } } },
      take: 50,
    })

    for (const referral of overdue) {
      if (!checkConditions(referral, cfg)) continue

      const key = `${referral.id}:overdue`
      const already = await prisma.automationRun.findFirst({
        where: { automationId: auto.id, contextType: "referral", contextId: key },
      })
      if (already) continue

      const vars: TemplateVars = {
        patient_name: `${referral.patientFirstName} ${referral.patientLastName}`,
        patient_first_name: referral.patientFirstName,
        provider_name: referral.referringDoctor?.name ?? referral.referringDoctorName ?? undefined,
        practice_name: referral.referringPractice?.name ?? undefined,
        referral_url: buildReferralUrl(referral.id),
      }

      const log = await executeAction(auto, referral.id, vars)
      await prisma.automationRun.create({
        data: { automationId: auto.id, ...runData(log, "referral", key, "Appointment date passed, still Scheduled") },
      })
    }
  }
}

async function runTrigger_ReferralStale() {
  const automations = await prisma.automation.findMany({
    where: { triggerType: "REFERRAL_STALE" as AutomationTrigger, isActive: true },
  })
  if (!automations.length) return

  for (const auto of automations) {
    const cfg = auto.triggerConfig as Record<string, unknown>
    const days = Number(cfg.days ?? 14)
    const cutoff = new Date(Date.now() - days * 86400000)

    const stale = await prisma.referral.findMany({
      where: {
        appointmentDate: null,
        createdAt: { lte: cutoff },
        status: { notIn: [ReferralStatus.COMPLETED, ReferralStatus.NO_SHOW, "LOST" as ReferralStatus] },
      },
      include: { referringDoctor: true, referringPractice: true, tags: { select: { tagId: true } } },
      take: 50,
    })

    for (const referral of stale) {
      if (!checkConditions(referral, cfg)) continue

      const key = `${referral.id}:stale:${days}`
      const already = await prisma.automationRun.findFirst({
        where: { automationId: auto.id, contextType: "referral", contextId: key },
      })
      if (already) continue

      const vars: TemplateVars = {
        patient_name: `${referral.patientFirstName} ${referral.patientLastName}`,
        patient_first_name: referral.patientFirstName,
        provider_name: referral.referringDoctor?.name ?? referral.referringDoctorName ?? undefined,
        practice_name: referral.referringPractice?.name ?? undefined,
        days,
        referral_url: buildReferralUrl(referral.id),
      }

      const log = await executeAction(auto, referral.id, vars)
      await prisma.automationRun.create({
        data: { automationId: auto.id, ...runData(log, "referral", key, `No appointment set after ${days} days`) },
      })
    }
  }
}
