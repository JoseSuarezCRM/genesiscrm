import { prisma } from "@/lib/prisma"
import { AutomationTrigger, AutomationAction, ReferralStatus, TaskPriority } from "@prisma/client"
import { sendEmail, sendCalendarInvite, senderEmail, type EmailSender } from "@/lib/graph-mailer"
import { buildIcs } from "@/lib/ics"
import { resolveWorkflowSender } from "@/lib/sender-resolve"
import { zonedParts, zonedWallToUtc } from "@/lib/tz"
import { sendSMS } from "@/lib/twilio"
import { enrollInMatchingSequences } from "@/app/actions/sequences"
import { evaluateRule as evalRule, evaluateGroups, selectBranch, MULTI_SEP, type AutomationFlow as PureFlow, type Condition as PureCondition, type ConditionGroup } from "@/lib/automation-conditions"
import { walkGraph, delayMs, type AutomationGraph, type DelayUnit } from "@/lib/automation-graph"
import { findProcedureLocation } from "@/lib/surgery-procedures"
import { type RecordRef, loadRecord, loadAllRecords, recordLabel as genericRecordLabel, setRecordProperty, setRecordOwner as setGenericOwner, createRecordFor } from "@/lib/automation-records"
import { ensureAssociationDef, ensureAssociation } from "@/lib/object-associations"

// A record created by a workflow can fire its own "record created" workflows; cap
// the chain so a misconfigured loop stops instead of running away.
const MAX_CHAIN_DEPTH = 5

// Read a property off a triggering record — native column, or a custom-property
// bag addressed as "custom:<id>"/"cp_<id>" (built-ins use `customProperties`,
// custom objects use `values`). Shared by COPY_PROPERTY and CREATE_RECORD.
function readRecordProp(rec: any, key: string): unknown {
  if (!rec || !key) return null
  if (key.startsWith("custom:") || key.startsWith("cp_")) {
    const id = key.startsWith("cp_") ? key.slice(3) : key.slice(7)
    const bag = (rec.customProperties ?? rec.values) as Record<string, unknown> | undefined
    return bag?.[id] ?? rec[id] ?? null
  }
  return rec[key] ?? null
}
import { buildRecordTokenVars } from "@/lib/record-token-vars"

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
      ? date.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })
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
  // Generic record triggers (any object)
  record_name?: string
  // Custom-property values keyed by property id, for {cp_<id>} tokens.
  __custom?: Record<string, string>
}

// A record's custom-property values → display strings, keyed by property id.
// Built-in objects store them under `customProperties`; custom objects under `values`.
function customValueMap(record?: Record<string, unknown> | null): Record<string, string> {
  const out: Record<string, string> = {}
  const bag = (record?.customProperties ?? record?.values) as Record<string, unknown> | undefined
  if (!bag || typeof bag !== "object") return out
  for (const [k, v] of Object.entries(bag)) {
    if (v == null) { out[k] = ""; continue }
    if (Array.isArray(v)) { out[k] = v.filter(Boolean).join(", "); continue }
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) { out[k] = new Date(v).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" } as any); continue }
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) { out[k] = new Date(v).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" }); continue }
    out[k] = String(v)
  }
  return out
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
    .replace(/\{record_name\}/g, vars.record_name ?? "the record")
    .replace(/\{referral_url\}/g, vars.referral_url ?? "")
    .replace(/\{referral_button\}/g, btnHtml)
    // Custom tokens: {cp_<id>} or a property's internal name. Resolved from the
    // record's custom values; left as-is when unknown.
    .replace(/\{([a-zA-Z0-9_]+)\}/g, (m, k: string) => vars.__custom?.[k] ?? m)
}

function engineSlug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
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
  SEND_MEETING_INVITE: "Send meeting invite",
  SET_PROPERTY: "Set property",
  COPY_PROPERTY: "Copy property",
  ASSIGN_OWNER: "Assign owner",
  CREATE_RECORD: "Create record",
}

function stepLabel(type: string, cfg: Record<string, unknown>): string {
  const base = ACTION_STEP_LABELS[type] ?? type
  if (type === "SEND_EMAIL" && cfg.subject) return `${base}: ${String(cfg.subject).slice(0, 60)}`
  if (type === "SEND_MEETING_INVITE" && cfg.title) return `${base}: ${String(cfg.title).slice(0, 60)}`
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
  conditionRecord?: Record<string, unknown> | null,
  recordRef?: RecordRef | null,
  depth = 0,
): Promise<RunLog> {
  // For referral workflows that didn't pass a record, fall back to fetching it.
  const record = conditionRecord !== undefined
    ? conditionRecord
    : (referralId ? await fetchReferralForEngine(referralId) : null)
  const condRef = record ? (record as unknown as Parameters<typeof walkGraph>[2]) : null

  const steps: RunStep[] = []
  const run = async (type: AutomationAction, cfg: Record<string, unknown>) => {
    const issue = await runSingleAction(type, cfg, referralId, vars, triggeredByUserId, record, recordRef, depth)
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
      await scheduleResume(automation.id, resumeNodeId, resumeAt, referralId, record, vars, recordLabelFor(record, vars), recordRef)
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
  recordRef?: RecordRef | null,
) {
  await prisma.workflowResume.create({
    data: {
      automationId,
      resumeNodeId,
      resumeAt,
      referralId: referralId ?? null,
      recordType: recordRef?.type ?? null,
      recordId: recordRef?.id ?? null,
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

    // Reload the record fresh so branch conditions AND action tokens reflect the
    // CURRENT state after the wait — e.g. "is the property STILL that value?"
    // 30 days later — not the snapshot captured when the workflow paused. Fall
    // back to that snapshot if the record can't be reloaded (e.g. deleted).
    let record = (r.record ?? null) as Record<string, unknown> | null
    let vars = (r.vars ?? {}) as TemplateVars
    if (r.recordType && r.recordId) {
      const fresh = await loadRecord(r.recordType, r.recordId).catch(() => null)
      if (fresh) {
        record = fresh
        try { vars = { ...vars, ...(await buildRecordTokenVars(r.recordType, r.recordId)) } } catch { /* keep snapshot vars */ }
      }
    } else if (r.referralId) {
      const fresh = await fetchReferralForEngine(r.referralId).catch(() => null)
      if (fresh) record = fresh as unknown as Record<string, unknown>
    }
    const condRef = record ? (record as unknown as Parameters<typeof walkGraph>[2]) : null

    const { actions, resumeNodeId, resumeAt, waitLabel } = walkGraph(graph, r.resumeNodeId, condRef)
    const steps: RunStep[] = []
    for (const a of actions) {
      const cfg = (a.config ?? {}) as Record<string, unknown>
      const ref = r.recordType && r.recordId ? { type: r.recordType, id: r.recordId } : null
      const issue = await runSingleAction(a.type as AutomationAction, cfg, r.referralId, vars, undefined, record, ref)
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

// Resolve a recipient-picker list (record email / admins / assigned user /
// specific users / literal email) into a deduplicated list of email addresses.
// Shared by Send Email and Send Meeting Invite.
async function resolveRecipients(
  list: unknown,
  record: Record<string, unknown> | null | undefined,
  referralId: string | null,
  vars?: TemplateVars,
): Promise<string[]> {
  const emailSet = new Set<string>()
  if (Array.isArray(list)) {
    for (const r of list as { type: string; value: string | string[] }[]) {
      if (r.type === "record_email") {
        const e = recordEmail(record)
        if (e) emailSet.add(e)
      } else if (r.type === "record_property") {
        // Send to an address held in a property of the enrolled record. The value
        // is a "{token}"; its resolved value may contain one or more addresses.
        const key = String(r.value ?? "").replace(/^\{|\}$/g, "").trim()
        const raw = key && vars ? (vars as Record<string, unknown>)[key] : undefined
        String(raw ?? "").split(/[,;\s]+/).forEach((e) => { if (e.includes("@")) emailSet.add(e.trim()) })
      } else if (r.type === "all_admins") {
        const admins = await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { email: true } })
        admins.forEach((a) => emailSet.add(a.email))
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
        emailSet.add(String(r.value).trim())
      }
    }
  }
  return Array.from(emailSet)
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
  record?: Record<string, unknown> | null,
  recordRef?: RecordRef | null,
  depth = 0,
): Promise<string | null> {
  const automation = { actionType } // local alias so existing `automation.actionType` checks still read
  // Resolve every native + custom token for the triggering record via the shared
  // per-object resolver, so {patient_name}, {surgery_date}, custom internal names,
  // {cp_<id>}, etc. all fill in for ANY object type. Trigger-specific vars (count,
  // status, …) still win over the record-derived ones.
  {
    const tokenRef = recordRef ?? (referralId ? { type: "REFERRAL", id: referralId } : null)
    let tokenMap: Record<string, string> = {}
    if (tokenRef) {
      try { tokenMap = await buildRecordTokenVars(tokenRef.type, tokenRef.id) } catch { /* keep whatever vars has */ }
    }
    // Fold in any custom values already on the record snapshot (a delayed resume
    // carries a snapshot even when tokenRef is missing).
    const byId = customValueMap(record)
    for (const [id, v] of Object.entries(byId)) if (tokenMap[`cp_${id}`] === undefined) tokenMap[`cp_${id}`] = v
    vars = {
      ...(tokenMap as any),
      ...vars,
      __custom: { ...tokenMap, ...(vars.__custom ?? {}) },
    }
  }

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

    let toEmails: string[]
    if (Array.isArray(cfg.recipients)) {
      toEmails = await resolveRecipients(cfg.recipients, record, referralId, vars)
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

    const ccEmails = await resolveRecipients(cfg.cc, record, referralId, vars)
    const bccEmails = await resolveRecipients(cfg.bcc, record, referralId, vars)

    if (!toEmails.length) {
      return "Email not sent: no recipient resolved (the enrolled record has no email, or the chosen recipient is empty)."
    }

    // Generate + attach document templates for the enrolled record. Each generated
    // PDF is also saved onto the record (RecordAttachment) so it stays viewable — in
    // the Attachments card and, via savedDocs below, on the timeline email entry.
    const docIds = Array.isArray(cfg.documentTemplateIds) ? (cfg.documentTemplateIds as string[]) : []
    const docRef = recordRef ?? (referralId ? { type: "REFERRAL", id: referralId } : null)
    const savedDocs: { name: string; url: string }[] = []
    if (docIds.length && docRef) {
      const { generateDocumentPdf } = await import("@/lib/document-pdf")
      for (const tid of docIds) {
        try {
          const doc = await generateDocumentPdf(tid, docRef.type, docRef.id)
          if ("error" in doc) continue
          emailAttachments.push({ name: doc.filename, contentType: "application/pdf", contentBase64: doc.buffer.toString("base64") })
          // Persist the generated PDF to the record (best-effort — never blocks the send).
          if (process.env.BLOB_READ_WRITE_TOKEN) {
            try {
              const { put } = await import("@vercel/blob")
              const safe = (doc.filename || "document.pdf").replace(/[^a-zA-Z0-9._-]/g, "_")
              const key = `record-attachments/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`
              const blob = await put(key, doc.buffer, { access: "private", contentType: "application/pdf" })
              const row = await (prisma as any).recordAttachment.create({
                data: {
                  recordType: docRef.type, recordId: docRef.id, name: doc.filename,
                  blobUrl: blob.url, contentType: "application/pdf", size: doc.buffer.length,
                  createdById: triggeredByUserId ?? null,
                },
                select: { id: true },
              })
              savedDocs.push({ name: doc.filename, url: `/api/record-attachments/${row.id}` })
            } catch { /* save failed — still send with the attachment */ }
          }
        } catch { /* skip a failing document, still send the email */ }
      }
    }

    const from = await resolveWorkflowSender(cfg.sender, record, referralId)
    const result = await sendEmail(toEmails, subject, html, {
      cc: ccEmails, bcc: bccEmails,
      ...(from.fromEmail ? { fromEmail: from.fromEmail } : { sender: from.senderKey }),
      attachments: emailAttachments,
    })
    if (!result.success) {
      return `Email failed to ${toEmails.join(", ")} from ${from.fromEmail ?? from.senderKey}: ${result.error ?? "unknown error"}`
    }

    // Track the send on the enrolled record's timeline (mirrors sendEmailFromRecord).
    const emailRef = recordRef ?? (referralId ? { type: "REFERRAL", id: referralId } : null)
    if (emailRef) {
      const fromAddr = from.fromEmail ?? senderEmail(from.senderKey)
      try {
        const logged = await prisma.directEmail.create({
          data: {
            to: toEmails, cc: ccEmails, bcc: bccEmails,
            subject, body: bodyText, success: true,
            direction: "OUTBOUND", fromEmail: fromAddr, mailbox: fromAddr,
            sentById: triggeredByUserId ?? null, // null on cron/delayed resume — column is nullable
            attachments: savedDocs, // generated PDFs saved on the record, shown on the timeline entry
          },
          select: { id: true },
        })
        await (prisma as any).objectAssociation.create({
          data: { fromType: "EMAIL", fromId: logged.id, toType: emailRef.type, toId: emailRef.id },
        })
      } catch { /* logging must never fail the send */ }
    }
  }

  if ((automation.actionType as string) === "SEND_MEETING_INVITE") {
    const inviteTo = await resolveRecipients(cfg.recipients, record, referralId, vars)
    if (!inviteTo.length) {
      return "Meeting invite not sent: no recipient resolved (the enrolled record has no email, or the chosen recipient is empty)."
    }

    const title = resolveTemplate((cfg.title as string) || "Meeting", vars)
    const location = cfg.location ? resolveTemplate(cfg.location as string, vars) : ""
    const description = cfg.description ? resolveTemplate(cfg.description as string, vars) : ""

    // Resolve the event start: either a fixed date/time or a date property on the
    // record (optionally overridden with a specific time-of-day in clinic time).
    let start: Date | null = null
    const eventMode = (cfg.eventMode as string) || "fixed"
    if (eventMode === "field") {
      const fieldPath = cfg.eventField as string | undefined
      const raw = fieldPath ? (record?.[fieldPath] as unknown) : null
      const base = raw ? new Date(raw as string) : null
      if (!base || Number.isNaN(base.getTime())) {
        return `Meeting invite not sent: the record has no value for the chosen date field${fieldPath ? ` (${fieldPath})` : ""}.`
      }
      const tm = String(cfg.eventTime ?? "").match(/^(\d{1,2}):(\d{2})$/)
      if (tm) {
        const p = zonedParts(base)
        start = zonedWallToUtc(p.year, p.month, p.day, Number(tm[1]), Number(tm[2]))
      } else {
        start = base
      }
    } else {
      const iso = cfg.eventDatetime as string | undefined
      start = iso ? new Date(iso) : null
      if (!start || Number.isNaN(start.getTime())) {
        return "Meeting invite not sent: no event date/time configured."
      }
    }

    const durationMinutes = Math.max(5, Number(cfg.durationMinutes) || 30)
    const end = new Date(start.getTime() + durationMinutes * 60000)
    const from = await resolveWorkflowSender(cfg.sender, record, referralId)
    const organizer = from.fromEmail ?? senderEmail(from.senderKey)
    const uid = `${referralId ?? "rec"}-${start.getTime()}-${Math.random().toString(36).slice(2, 8)}@genesisortho.com`

    // A calendar invite can't be sent to its own organizer — Microsoft strips the
    // sender from the recipients and rejects the send with a cryptic "contains no
    // recipients" error. Drop the organizer/sender address and fail clearly if that
    // leaves no one (e.g. sender = "record owner" and the recipient is that same user).
    const selfAddrs = new Set([organizer, from.fromEmail].filter(Boolean).map((a) => (a as string).toLowerCase()))
    const sendTo = inviteTo.filter((e) => !selfAddrs.has(e.toLowerCase()))
    if (!sendTo.length) {
      return `Meeting invite not sent: the only recipient is the sender/organizer (${organizer}). Choose a different sender or recipient.`
    }

    const ics = buildIcs({
      uid, start, end, title, description, location,
      organizer: { email: organizer, name: "Genesis Ortho" },
      attendees: sendTo.map((e) => ({ email: e })),
    })

    const when = start.toLocaleString("en-US", {
      weekday: "short", month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", timeZone: "America/Chicago",
    })
    const inner = [
      `<p style="font-size:15px;font-weight:600;">${title}</p>`,
      `<p><strong>When:</strong> ${when} (CT) · ${durationMinutes} min</p>`,
      location ? `<p><strong>Where:</strong> ${location}</p>` : "",
      description ? `<p>${description.replace(/\n/g, "<br/>")}</p>` : "",
      `<p style="color:#64748b;font-size:13px;">Open the attached invite to add this to your calendar.</p>`,
    ].filter(Boolean).join("")
    const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1e293b;">${inner}</div>`

    const result = await sendCalendarInvite(sendTo, title, html, ics, from.senderKey, from.fromEmail)
    if (!result.success) {
      return `Meeting invite failed to ${sendTo.join(", ")}: ${result.error ?? "unknown error"}`
    }
  }

  if ((automation.actionType as string) === "SEND_SMS") {
    const body = resolveTemplate((tplBody ?? (cfg.body as string)) || "", vars)
    if (!body) return "SMS body is empty"
    // Recipient can be the record's own phone (default), a specific property on the
    // record, or a fixed/custom number — configured in the action.
    const toCfg = (cfg.to as { type?: string; value?: string } | undefined) ?? { type: "record" }
    let phone: string | null = null
    if (toCfg.type === "custom") {
      phone = resolveTemplate(toCfg.value ?? "", vars).trim() || null
    } else if (toCfg.type === "property" && toCfg.value) {
      // A property holds the number. The UI addresses a custom property as
      // "custom:<id>" (or "cp_<id>"), but the JSON bag is keyed by the raw id —
      // so strip the prefix before reading. Native fields sit on the record.
      const key = toCfg.value
      const bag = ((record as any)?.customProperties ?? (record as any)?.values) as Record<string, unknown> | undefined
      let raw: unknown
      if (key.startsWith("custom:") || key.startsWith("cp_")) {
        const id = key.startsWith("cp_") ? key.slice(3) : key.slice(7)
        raw = bag?.[id] ?? (record as any)?.[id] ?? null
      } else {
        raw = (record as any)?.[key] ?? bag?.[key] ?? null
      }
      if (Array.isArray(raw)) raw = raw[0] ?? null
      phone = raw != null && String(raw).trim() ? String(raw).trim() : null
    } else {
      // "record" (default): the referral's / triggering record's own phone.
      if (referralId) {
        const referral = await prisma.referral.findUnique({ where: { id: referralId }, select: { patientPhone: true } })
        phone = referral?.patientPhone ?? null
      } else if (record) {
        const r = record as any
        phone = r.patientPhone ?? r.phone ?? r.officePhone ?? r.patientCell ?? null
      }
    }
    if (!phone) return "No phone number to send an SMS to"
    const res = await sendSMS(phone, body)
    if (!res.success) return res.error ?? "SMS failed to send"
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

  // ── Generic writes against the triggering record (any object) ───────────────
  const target: RecordRef | null = recordRef ?? (referralId ? { type: "REFERRAL", id: referralId } : null)

  if ((automation.actionType as string) === "SET_PROPERTY") {
    if (!target) return "Set property: no record in context"
    const property = cfg.property as string
    if (!property) return "Set property: no property selected"
    const raw = cfg.value
    const value = typeof raw === "string" ? resolveTemplate(raw, vars) : raw
    try {
      await setRecordProperty(target.type, target.id, property, value)
    } catch (err: any) {
      return `Set property failed: ${err.message}`
    }
  }

  if ((automation.actionType as string) === "COPY_PROPERTY") {
    if (!target) return "Copy property: no record in context"
    const source = cfg.source as string
    const dest = cfg.target as string
    if (!source || !dest) return "Copy property: choose a source and a target property"
    let value = readRecordProp(record, source)
    // "Date only": drop the time, storing the calendar date (America/Chicago) the
    // same way the date field would — an ISO at UTC midnight.
    if (cfg.dateOnly && value != null && value !== "") {
      const d = new Date(value as any)
      if (!isNaN(d.getTime())) {
        // Take the calendar date in the app's timezone, then store it at NOON UTC
        // so it renders as that same day everywhere (midnight UTC would show as the
        // day before for viewers in negative-offset zones like America/Chicago).
        const ymd = d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" })
        value = new Date(`${ymd}T12:00:00.000Z`).toISOString()
      }
    }
    try {
      await setRecordProperty(target.type, target.id, dest, value)
    } catch (err: any) {
      return `Copy property failed: ${err.message}`
    }
  }

  if ((automation.actionType as string) === "ASSIGN_OWNER") {
    if (!target) return "Assign owner: no record in context"
    // "triggering_user" assigns whoever caused the workflow to fire.
    const raw = (cfg.ownerId as string) || ""
    const ownerId = raw === "triggering_user" ? (triggeredByUserId ?? null) : (raw || null)
    try {
      await setGenericOwner(target.type, target.id, ownerId)
    } catch (err: any) {
      return `Assign owner failed: ${err.message}`
    }
  }

  if ((automation.actionType as string) === "CREATE_RECORD") {
    const objectKey = (cfg.objectKey as string) || ""
    if (!objectKey.startsWith("CO:")) return "Create record: choose a custom object to create in"
    // Prefill fields. Each field is either copied from a property on the triggering
    // record (source "field") or a custom value/token (source "value", the default).
    const fields = Array.isArray(cfg.fields) ? (cfg.fields as { property?: string; source?: string; field?: string; value?: unknown }[]) : []
    const values: Record<string, unknown> = {}
    for (const f of fields) {
      if (!f?.property) continue
      let resolved: unknown
      if (f.source === "field" && f.field) {
        resolved = readRecordProp(record, f.field)
      } else {
        resolved = typeof f.value === "string" ? resolveTemplate(f.value, vars) : f.value
      }
      const empty = resolved === undefined || resolved === null || resolved === "" || (Array.isArray(resolved) && resolved.length === 0)
      if (!empty) values[f.property] = resolved
    }
    // Owner of the new record: "triggering_user" | a user id | unassigned.
    const ownerRaw = (cfg.ownerId as string) || ""
    const ownerId = ownerRaw === "triggering_user" ? (triggeredByUserId ?? null) : (ownerRaw || null)

    let newId: string
    try {
      newId = await createRecordFor(objectKey, values, { ownerId, createdById: triggeredByUserId ?? null })
    } catch (err: any) {
      return `Create record failed: ${err.message}`
    }

    // Associate the new record with the triggering record (when asked, and one exists).
    if (cfg.associate !== false && target) {
      try {
        await ensureAssociationDef(objectKey, target.type)
        await ensureAssociation(objectKey, newId, target.type, target.id)
      } catch (err: any) {
        return `Create record: associate failed: ${err.message}`
      }
    }

    // Let the new record fire its own "record created" workflows (chaining),
    // bounded so a create-loop can't run away.
    if (depth < MAX_CHAIN_DEPTH) {
      await runTrigger_RecordCreated(objectKey, newId, triggeredByUserId, depth + 1).catch(() => {})
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

    const log = await executeAction(auto, null, vars, triggeredByUserId, sc, { type: "SURGERY", id: caseId })
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

    const log = await executeAction(auto, null, vars, triggeredByUserId, sc, { type: "SURGERY", id: caseId })
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
  await runTrigger_TaskOverdue()
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

// ─── Generic, object-agnostic triggers ────────────────────────────────────────
// These work for any object — built-in or custom. The workflow names its object
// in triggerConfig.objectType (a registry key like "SURGERY" or "CO:visits"), so
// one trigger covers the whole data model instead of one per object.

async function runRecordTrigger(
  triggerType: AutomationTrigger,
  recordType: string,
  recordId: string,
  detail: string,
  extraVars: Partial<TemplateVars>,
  match: (cfg: Record<string, unknown>, record: Record<string, unknown>) => boolean,
  triggeredByUserId?: string,
  depth = 0,
) {
  const automations = await prisma.automation.findMany({ where: { triggerType, isActive: true } })
  const forThisObject = automations.filter((a) => ((a.triggerConfig ?? {}) as Record<string, unknown>).objectType === recordType)
  if (!forThisObject.length) return

  // Load the record once, then match — some matchers (e.g. multi-property "all")
  // need the record's current values, not just the change delta.
  const record = await loadRecord(recordType, recordId)
  if (!record) return

  const matched = forThisObject.filter((a) => match((a.triggerConfig ?? {}) as Record<string, unknown>, record))
  if (!matched.length) return

  const label = await genericRecordLabel(recordType, recordId, record)
  // Native + custom tokens for this record are filled in by runSingleAction via
  // the shared per-object resolver, so any object's tokens resolve here.
  const vars: TemplateVars = { ...extraVars, record_name: label } as TemplateVars
  const ref: RecordRef = { type: recordType, id: recordId }

  for (const auto of matched) {
    const cfg = (auto.triggerConfig ?? {}) as Record<string, unknown>
    if (!checkConditions(record, cfg)) continue

    const log = await executeAction(auto, null, vars, triggeredByUserId, record, ref, depth)
    await prisma.automationRun.create({
      data: { automationId: auto.id, ...runData(log, recordType, recordId, detail) },
    }).catch(() => {})
  }
}

export async function runTrigger_RecordCreated(recordType: string, recordId: string, triggeredByUserId?: string, depth = 0) {
  await runRecordTrigger(
    "RECORD_CREATED" as AutomationTrigger,
    recordType, recordId, "Record created", {},
    () => true,
    triggeredByUserId,
    depth,
  )
}

// A single watched property with its own condition + value. Semantics are ALL —
// the trigger fires only when every watcher is satisfied.
type PropWatcher = { property: string; condition: string; value?: string }

// Normalize a property-changed config into watchers. New configs store
// `watchers: PropWatcher[]`; legacy ones use `properties[]`/`property` with a
// single shared `condition`/`toValue`.
function watchersOf(cfg: Record<string, unknown>): PropWatcher[] {
  const w = cfg.watchers as PropWatcher[] | undefined
  if (Array.isArray(w) && w.length) return w.filter((x) => x && typeof x === "object")
  const condition = (cfg.condition as string) || (cfg.toValue ? "equals" : "changed")
  const list = cfg.properties as string[] | undefined
  const legacy = Array.isArray(list) && list.length ? list.filter(Boolean) : cfg.property ? [cfg.property as string] : []
  return legacy.map((p) => ({ property: p, condition, value: cfg.toValue as string | undefined }))
}

// Does a value satisfy the "when it" condition? `toValue` may be a MULTI_SEP list
// (is any of), and `cur` may be an array (multi-select property).
function propSatisfies(cur: unknown, condition: string, toValue: unknown): boolean {
  const has = cur != null && String(cur).trim() !== "" && !(Array.isArray(cur) && cur.length === 0)
  if (condition === "unknown") return !has
  if (condition === "equals") {
    const vals = String(toValue ?? "").split(MULTI_SEP).map((s) => s.trim()).filter(Boolean)
    if (!vals.length) return has // "equals" with no value chosen → treat as "known"
    const curArr = Array.isArray(cur) ? cur.map((x) => String(x)) : [String(cur ?? "")]
    return vals.some((v) => curArr.includes(v))
  }
  return has // "known" / "changed" → currently holds a value
}

// `changes` is the set of properties the update touched, so a workflow can watch
// one or more properties (and optionally require a specific new value).
export async function runTrigger_RecordPropertyChanged(
  recordType: string,
  recordId: string,
  changes: Record<string, unknown>,
  triggeredByUserId?: string,
) {
  const keys = Object.keys(changes ?? {})
  if (!keys.length) return
  // Friendly detail: resolve "custom:<id>" keys to the property's name for logs.
  const labels = await Promise.all(keys.map(async (k) => {
    if (!k.startsWith("custom:")) return k
    const cp = await prisma.customProperty.findUnique({ where: { id: k.slice(7) }, select: { name: true } }).catch(() => null)
    return cp?.name ?? k
  }))
  await runRecordTrigger(
    "RECORD_PROPERTY_CHANGED" as AutomationTrigger,
    recordType, recordId, `Property changed: ${labels.join(", ")}`, {},
    (cfg, record) => {
      const watchers = watchersOf(cfg).filter((w) => w.property)
      if (!watchers.length) return true // no property named → any change fires it
      // The change must touch at least one watched property (so unrelated edits
      // don't re-fire), AND every watcher must currently satisfy its condition.
      if (!watchers.some((w) => keys.includes(w.property))) return false
      return watchers.every((w) => propSatisfies(currentPropValue(record, w.property), w.condition, w.value))
    },
    triggeredByUserId,
  )
}

// ─── Enroll existing records (HubSpot-style backfill) ─────────────────────────

// Current value of a property on a loaded record (native column or custom bag,
// addressed as "custom:<id>"/"cp_<id>").
function currentPropValue(record: Record<string, unknown>, key: string): unknown {
  if (!key) return undefined
  if (key.startsWith("custom:") || key.startsWith("cp_")) {
    const id = key.startsWith("cp_") ? key.slice(3) : key.slice(7)
    const bag = ((record as any).customProperties ?? (record as any).values) as Record<string, unknown> | undefined
    return bag?.[id] ?? (record as any)[id]
  }
  return (record as any)[key]
}

// Does an EXISTING record currently satisfy a workflow's trigger + criteria? Only
// property-state triggers have a meaningful "already matches" notion; other
// triggers fall back to the criteria filter alone.
function recordMatchesConfig(record: Record<string, unknown>, triggerType: string, cfg: Record<string, unknown>): boolean {
  if (triggerType === "RECORD_PROPERTY_CHANGED") {
    const watchers = watchersOf(cfg).filter((w) => w.property)
    // ALL watched properties must currently satisfy their own condition.
    if (watchers.length && !watchers.every((w) => propSatisfies(currentPropValue(record, w.property), w.condition, w.value))) return false
  }
  return checkConditions(record, cfg)
}

// How many existing records currently match — for the editor's preview.
export async function countMatchingRecords(objectType: string, triggerType: string, cfg: Record<string, unknown>): Promise<number> {
  if (!objectType) return 0
  const records = await loadAllRecords(objectType)
  let n = 0
  for (const r of records) if (recordMatchesConfig(r, triggerType, cfg)) n++
  return n
}

const ENROLL_CAP = 2000

// Run the full workflow once on every existing record that currently matches.
export async function enrollExistingRecords(automationId: string): Promise<{ matched: number; ran: number; capped: boolean }> {
  const auto = await prisma.automation.findUnique({ where: { id: automationId } })
  if (!auto) return { matched: 0, ran: 0, capped: false }
  const cfg = (auto.triggerConfig ?? {}) as Record<string, unknown>
  const objectType = (cfg.objectType as string) || "REFERRAL"

  const records = await loadAllRecords(objectType)
  const matching = records.filter((r) => recordMatchesConfig(r, auto.triggerType as string, cfg))
  const capped = matching.length > ENROLL_CAP
  const batch = matching.slice(0, ENROLL_CAP)

  let ran = 0
  for (const record of batch) {
    const id = record.id as string
    const label = await genericRecordLabel(objectType, id, record)
    const vars: TemplateVars = { record_name: label } as TemplateVars
    const ref: RecordRef = { type: objectType, id }
    try {
      const log = await executeAction(auto, null, vars, undefined, record, ref)
      await prisma.automationRun.create({
        data: { automationId: auto.id, ...runData(log, objectType, id, `Enrolled existing record: ${label}`) },
      }).catch(() => {})
      ran++
    } catch { /* skip a single failing record, keep going */ }
  }
  return { matched: matching.length, ran, capped }
}

// ─── Manual enrollment ────────────────────────────────────────────────────────

// Run the full workflow now on an explicit set of records, independent of the
// trigger's enrollment criteria (HubSpot-style manual enrollment).
export async function manualEnrollRecords(
  automationId: string,
  recordIds: string[],
): Promise<{ ran: number; capped: boolean }> {
  const auto = await prisma.automation.findUnique({ where: { id: automationId } })
  if (!auto) return { ran: 0, capped: false }
  const cfg = (auto.triggerConfig ?? {}) as Record<string, unknown>
  const objectType = (cfg.objectType as string) || "REFERRAL"
  const capped = recordIds.length > ENROLL_CAP
  const batch = recordIds.slice(0, ENROLL_CAP)
  let ran = 0
  for (const id of batch) {
    try {
      const record = await loadRecord(objectType, id)
      if (!record) continue
      const label = await genericRecordLabel(objectType, id, record)
      const vars: TemplateVars = { record_name: label } as TemplateVars
      const ref: RecordRef = { type: objectType, id }
      const log = await executeAction(auto, null, vars, undefined, record, ref)
      await prisma.automationRun.create({
        data: { automationId: auto.id, ...runData(log, objectType, id, `Manually enrolled record: ${label}`) },
      }).catch(() => {})
      ran++
    } catch { /* skip a single failing record, keep going */ }
  }
  return { ran, capped }
}

// Search an object's records by display label — powers the manual-enroll picker.
export async function searchObjectRecords(
  objectType: string,
  query: string,
  limit = 50,
): Promise<{ id: string; label: string }[]> {
  const records = await loadAllRecords(objectType)
  const q = query.trim().toLowerCase()
  const out: { id: string; label: string }[] = []
  for (const r of records) {
    const id = r.id as string
    const label = await genericRecordLabel(objectType, id, r)
    if (!q || label.toLowerCase().includes(q)) out.push({ id, label })
    if (out.length >= limit) break
  }
  return out
}

// Records of an object matching an ad-hoc criteria group set — the manual-enroll
// "custom filter" mode. Reuses the same evaluator as trigger enrollment criteria.
export async function matchRecordsByGroups(
  objectType: string,
  groups: ConditionGroup[],
): Promise<{ records: { id: string; label: string }[]; count: number; capped: boolean }> {
  const records = await loadAllRecords(objectType)
  const matching = records.filter((r) => checkConditions(r, { conditionGroups: groups } as any))
  const capped = matching.length > ENROLL_CAP
  const batch = matching.slice(0, ENROLL_CAP)
  const out: { id: string; label: string }[] = []
  for (const r of batch) {
    const id = r.id as string
    out.push({ id, label: await genericRecordLabel(objectType, id, r) })
  }
  return { records: out, count: matching.length, capped }
}

export async function runTrigger_RecordOwnerChanged(
  recordType: string,
  recordId: string,
  ownerId: string | null,
  triggeredByUserId?: string,
) {
  await runRecordTrigger(
    "RECORD_OWNER_CHANGED" as AutomationTrigger,
    recordType, recordId, "Record owner changed", {},
    (cfg) => !cfg.ownerId || cfg.ownerId === ownerId,
    triggeredByUserId,
  )
}

// ─── Engagement triggers ──────────────────────────────────────────────────────

function smsMatches(body: string, keyword: string, mode: string): boolean {
  if (!keyword) return true
  const b = body.toLowerCase().trim()
  const k = keyword.toLowerCase().trim()
  if (mode === "exact") return b === k
  if (mode === "starts_with") return b.startsWith(k)
  return b.includes(k)
}

// A patient texted back. If the thread is tied to a referral, the workflow's
// referral actions operate on it; otherwise only the generic actions apply.
export async function runTrigger_SmsReceived(threadId: string, body: string) {
  const automations = await prisma.automation.findMany({
    where: { triggerType: "SMS_RECEIVED" as AutomationTrigger, isActive: true },
  })
  if (!automations.length) return

  const thread = await prisma.smsThread.findUnique({ where: { id: threadId } })
  if (!thread) return

  const referral = thread.referralId ? await fetchReferralForEngine(thread.referralId) : null
  const vars: TemplateVars = {
    patient_name: referral ? `${referral.patientFirstName} ${referral.patientLastName}` : (thread.contactName ?? "the patient"),
    patient_first_name: referral?.patientFirstName ?? (thread.contactName ?? "there"),
    provider_name: referral?.referringDoctor?.name ?? "",
    practice_name: referral?.referringPractice?.name ?? "",
    record_name: thread.contactName ?? thread.phone,
    ...(thread.referralId ? { referral_url: buildReferralUrl(thread.referralId) } : {}),
  }

  for (const auto of automations) {
    const cfg = (auto.triggerConfig ?? {}) as Record<string, unknown>
    if (!smsMatches(body, (cfg.keyword as string) ?? "", (cfg.matchType as string) ?? "contains")) continue
    if (referral && !checkConditions(referral as unknown as Record<string, unknown>, cfg)) continue

    const ref: RecordRef | null = thread.referralId ? { type: "REFERRAL", id: thread.referralId } : null
    const log = await executeAction(auto, thread.referralId ?? null, vars, undefined, referral as any, ref)
    await prisma.automationRun.create({
      data: { automationId: auto.id, ...runData(log, "sms", threadId, `Inbound SMS from ${thread.phone}`) },
    }).catch(() => {})
  }
}

// A note / call / meeting was logged on a record (any object).
export async function runTrigger_EngagementLogged(
  recordType: string,
  recordId: string,
  kind: "NOTE" | "CALL" | "MEETING",
  triggeredByUserId?: string,
) {
  await runRecordTrigger(
    "ENGAGEMENT_LOGGED" as AutomationTrigger,
    recordType, recordId, `${kind[0]}${kind.slice(1).toLowerCase()} logged`, {},
    (cfg) => !cfg.kind || cfg.kind === kind,
    triggeredByUserId,
  )
}

// Swept by the automations cron: tasks past due and still open. A workflow fires
// once per task — a previous run for the same task is treated as already handled.
export async function runTrigger_TaskOverdue() {
  const automations = await prisma.automation.findMany({
    where: { triggerType: "TASK_OVERDUE" as AutomationTrigger, isActive: true },
  })
  if (!automations.length) return

  const overdue = await prisma.task.findMany({
    where: { dueDate: { lt: new Date() }, status: { not: "COMPLETED" } },
    include: { assignedTo: { select: { name: true, email: true } }, referral: { select: { id: true, patientFirstName: true, patientLastName: true } } },
    take: 200,
  })
  if (!overdue.length) return

  for (const auto of automations) {
    const cfg = (auto.triggerConfig ?? {}) as Record<string, unknown>
    for (const task of overdue) {
      if (cfg.priority && task.priority !== cfg.priority) continue

      const already = await prisma.automationRun.findFirst({
        where: { automationId: auto.id, contextType: "task", contextId: task.id },
        select: { id: true },
      })
      if (already) continue

      const vars: TemplateVars = {
        record_name: task.title,
        patient_name: task.referral ? `${task.referral.patientFirstName} ${task.referral.patientLastName}` : "",
        ...(task.referralId ? { referral_url: buildReferralUrl(task.referralId) } : {}),
      }
      const ref: RecordRef = { type: "TASK", id: task.id }
      const log = await executeAction(auto, task.referralId ?? null, vars, undefined, task as any, ref)
      await prisma.automationRun.create({
        data: { automationId: auto.id, ...runData(log, "task", task.id, `Task overdue: ${task.title}`) },
      }).catch(() => {})
    }
  }
}
