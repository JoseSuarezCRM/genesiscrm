import { prisma } from "@/lib/prisma"
import { AutomationTrigger, AutomationAction, ReferralStatus, TaskPriority } from "@prisma/client"
import { sendEmail } from "@/lib/graph-mailer"
import { sendSMS } from "@/lib/twilio"
import { enrollInMatchingSequences } from "@/app/actions/sequences"
import { evaluateRule as evalRule, selectBranch, type AutomationFlow as PureFlow } from "@/lib/automation-conditions"
import { resolveGraphActions, type AutomationGraph } from "@/lib/automation-graph"

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

interface ReferralForConditions {
  id: string
  referringPracticeId: string | null
  referringLocationId: string | null
  assignedToId: string | null
  status: ReferralStatus
  insuranceProvider: string | null
  tags: { tagId: string }[]
}

interface Condition {
  field: string
  op: string
  value: string
}

function checkConditions(referral: ReferralForConditions, cfg: Record<string, unknown>): boolean {
  // Legacy top-level filters (backward compat)
  if (cfg.practiceId && referral.referringPracticeId !== cfg.practiceId) return false
  if (cfg.locationId && referral.referringLocationId !== cfg.locationId) return false
  if (cfg.statusFilter && referral.status !== cfg.statusFilter) return false
  if (cfg.insuranceProvider) {
    const ip = (referral.insuranceProvider ?? "").toLowerCase()
    if (!ip.includes((cfg.insuranceProvider as string).toLowerCase())) return false
  }
  if (cfg.tagId) {
    if (!referral.tags.some(t => t.tagId === cfg.tagId)) return false
  }

  // Conditions array (AND logic)
  const conditions = (cfg.conditions as Condition[]) ?? []
  for (const cond of conditions) {
    const condVal = cond.value ?? ""
    const condValLower = condVal.toLowerCase()

    if (cond.field === "practiceId") {
      if (cond.op === "eq" && referral.referringPracticeId !== condVal) return false
      if (cond.op === "ne" && referral.referringPracticeId === condVal) return false
      if (cond.op === "empty" && referral.referringPracticeId !== null) return false
    }
    if (cond.field === "locationId") {
      if (cond.op === "eq" && referral.referringLocationId !== condVal) return false
      if (cond.op === "ne" && referral.referringLocationId === condVal) return false
      if (cond.op === "empty" && referral.referringLocationId !== null) return false
    }
    if (cond.field === "assignedToId") {
      if (cond.op === "eq" && referral.assignedToId !== condVal) return false
      if (cond.op === "ne" && referral.assignedToId === condVal) return false
      if (cond.op === "unassigned" && referral.assignedToId !== null) return false
    }
    if (cond.field === "status") {
      if (cond.op === "eq" && referral.status !== condVal) return false
      if (cond.op === "ne" && referral.status === condVal) return false
    }
    if (cond.field === "insuranceProvider") {
      const ip = (referral.insuranceProvider ?? "").toLowerCase()
      if (cond.op === "contains" && !ip.includes(condValLower)) return false
      if (cond.op === "eq" && ip !== condValLower) return false
      if (cond.op === "empty" && !!referral.insuranceProvider) return false
    }
    if (cond.field === "tagId") {
      const hasTag = referral.tags.some(t => t.tagId === condVal)
      if (cond.op === "has" && !hasTag) return false
      if (cond.op === "not_has" && hasTag) return false
    }
  }
  return true
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

// keep a reference so the import is used even though selectBranch wraps it
void evalRule

// Top-level executor: graph (visual flow) → flow (if/else) → single action.
async function executeAction(
  automation: { id: string; actionType: AutomationAction; actionConfig: unknown; flow?: unknown; graph?: unknown },
  referralId: string | null,
  vars: TemplateVars,
  triggeredByUserId?: string
): Promise<void> {
  const graph = automation.graph as AutomationGraph | null | undefined
  if (graph && graph.rootId && graph.nodes) {
    const ref = referralId ? await fetchReferralForEngine(referralId) : null
    const actions = resolveGraphActions(graph, ref ? (ref as unknown as Parameters<typeof resolveGraphActions>[1]) : null)
    for (const action of actions) {
      await runSingleAction(action.type as AutomationAction, (action.config ?? {}) as Record<string, unknown>, referralId, vars, triggeredByUserId)
    }
    return
  }

  const flow = automation.flow as PureFlow | null | undefined
  if (flow && (flow.then?.length || flow.else?.length)) {
    // Resolve which branch runs. With no rules the THEN branch runs; if rules
    // exist but we have no referral context, conditions can't pass → ELSE.
    const rules = flow.rules ?? []
    let branch = flow.then ?? []
    if (rules.length) {
      const ref = referralId ? await fetchReferralForEngine(referralId) : null
      branch = ref
        ? selectBranch(ref as unknown as Parameters<typeof selectBranch>[0], flow)
        : (flow.else ?? [])
    }
    for (const action of branch) {
      await runSingleAction(action.type as AutomationAction, (action.config ?? {}) as Record<string, unknown>, referralId, vars, triggeredByUserId)
    }
    return
  }
  await runSingleAction(automation.actionType, automation.actionConfig as Record<string, unknown>, referralId, vars, triggeredByUserId)
}

// Runs one action of the given type with its config.
async function runSingleAction(
  actionType: AutomationAction,
  cfg: Record<string, unknown>,
  referralId: string | null,
  vars: TemplateVars,
  triggeredByUserId?: string
): Promise<void> {
  const automation = { actionType } // local alias so existing `automation.actionType` checks still read

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
    const subject = resolveTemplate((cfg.subject as string) || "Automation notification", vars)
    const bodyText = resolveTemplate((cfg.body as string) || "", vars)
    // Body may already be HTML (rich text editor); only convert newlines for legacy plain text.
    const inner = /<[a-z][\s\S]*>/i.test(bodyText) ? bodyText : bodyText.replace(/\n/g, "<br/>")
    const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1e293b;">${inner}</div>`
    const emailAttachments = (Array.isArray(cfg.attachments) ? cfg.attachments : []) as any

    const resolveRecipientList = async (list: unknown): Promise<string[]> => {
      const emailSet = new Set<string>()
      if (Array.isArray(list)) {
        for (const r of list as { type: string; value: string }[]) {
          if (r.type === "all_admins") {
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

    if (toEmails.length) {
      await sendEmail(toEmails, subject, html, { cc: ccEmails, bcc: bccEmails, sender: (cfg.sender as any) || "referrals", attachments: emailAttachments })
    }
  }

  if ((automation.actionType as string) === "SEND_SMS" && referralId) {
    const body = resolveTemplate((cfg.body as string) || "", vars)
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

    await executeAction(auto, referralId, vars, triggeredByUserId)
    await prisma.automationRun.create({
      data: { automationId: auto.id, contextType: "referral", contextId: referralId, result: "success", detail: `Triggered on new referral for ${vars.patient_name}` },
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

    await executeAction(auto, referralId, vars)
    await prisma.automationRun.create({
      data: { automationId: auto.id, contextType: "referral", contextId: referralId, result: "success", detail: `Triggered on embed form referral for ${vars.patient_name}` },
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

    await executeAction(auto, referralId, vars, triggeredByUserId)
    await prisma.automationRun.create({
      data: { automationId: auto.id, contextType: "referral", contextId: referralId, result: "success", detail: `Status changed ${fromStatus} → ${toStatus}` },
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

    await executeAction(auto, referralId, vars, triggeredByUserId)
    await prisma.automationRun.create({
      data: { automationId: auto.id, contextType: "referral", contextId: referralId, result: "success", detail: `calls:${callCount} - ${callCount} call attempts reached` },
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

    await executeAction(auto, referralId, vars, triggeredByUserId)
    await prisma.automationRun.create({
      data: { automationId: auto.id, contextType: "referral", contextId: referralId, result: "success", detail: `Referral assigned to user ${assignedToId}` },
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

    await executeAction(auto, referralId, vars, triggeredByUserId)
    await prisma.automationRun.create({
      data: { automationId: auto.id, contextType: "referral", contextId: key, result: "success", detail: `Tag "${tagName}" added` },
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

    await executeAction(auto, referralId, vars, triggeredByUserId)
    await prisma.automationRun.create({
      data: { automationId: auto.id, contextType: "referral", contextId: referralId, result: "success", detail: "Document uploaded" },
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

    await executeAction(auto, referralId, vars, triggeredByUserId)
    await prisma.automationRun.create({
      data: { automationId: auto.id, contextType: "referral", contextId: referralId, result: "success", detail: `Auth status → "${toAuthStatus}"` },
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

    await executeAction(auto, referralId, vars, triggeredByUserId)
    await prisma.automationRun.create({
      data: { automationId: auto.id, contextType: "referral", contextId: referralId, result: "success", detail: `Pipeline changed ${fromPipelineId ?? "none"} → ${toPipelineId ?? "none"}` },
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

    await executeAction(auto, null, vars, triggeredByUserId)
    await prisma.automationRun.create({
      data: { automationId: auto.id, contextType: "provider", contextId: key, result: "success", detail: `${provider.name} reached ${count} referrals ${periodLabel(period)}` },
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

    const key = `${practiceId}:${dedupeKey(period)}`
    const already = await prisma.automationRun.findFirst({
      where: { automationId: auto.id, contextType: "practice", contextId: key },
    })
    if (already) continue

    const vars: TemplateVars = { practice_name: practice.name, count, period: periodLabel(period) }
    await executeAction(auto, null, vars, triggeredByUserId)
    await prisma.automationRun.create({
      data: { automationId: auto.id, contextType: "practice", contextId: key, result: "success", detail: `${practice.name} reached ${count} referrals ${periodLabel(period)}` },
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

    const key = `${locationId}:${dedupeKey(period)}`
    const already = await prisma.automationRun.findFirst({
      where: { automationId: auto.id, contextType: "location", contextId: key },
    })
    if (already) continue

    const vars: TemplateVars = { count, period: periodLabel(period) }
    await executeAction(auto, null, vars, triggeredByUserId)
    await prisma.automationRun.create({
      data: { automationId: auto.id, contextType: "location", contextId: key, result: "success", detail: `${location.name} reached ${count} referrals ${periodLabel(period)}` },
    })
  }
}

// ─── Scheduled triggers ───────────────────────────────────────────────────────

export async function runScheduledTriggers() {
  await runTrigger_NoActivity()
  await runTrigger_AppointmentUpcoming()
  await runTrigger_AppointmentOverdue()
  await runTrigger_ReferralStale()
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

      await executeAction(auto, referral.id, vars)
      await prisma.automationRun.create({
        data: { automationId: auto.id, contextType: "referral", contextId: key, result: "success", detail: `No activity for ${days} days` },
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

      await executeAction(auto, referral.id, vars)
      await prisma.automationRun.create({
        data: { automationId: auto.id, contextType: "referral", contextId: key, result: "success", detail: `Appointment in ${daysAhead} day(s)` },
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

      await executeAction(auto, referral.id, vars)
      await prisma.automationRun.create({
        data: { automationId: auto.id, contextType: "referral", contextId: key, result: "success", detail: "Appointment date passed, still Scheduled" },
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

      await executeAction(auto, referral.id, vars)
      await prisma.automationRun.create({
        data: { automationId: auto.id, contextType: "referral", contextId: key, result: "success", detail: `No appointment set after ${days} days` },
      })
    }
  }
}
